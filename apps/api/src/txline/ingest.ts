import { EventSource } from "eventsource";
import {
  Fixture,
  OddsQuote,
  isFinalScoreRecord,
} from "@whistle/shared";
import {
  TxlineConfig,
  fetchFixtures,
  fetchScoresSnapshot,
  normalizeFixture,
  normalizeScoreUpdate,
  sseUrl,
  txlineHeaders,
} from "./client";
import { getState, mutate, pushNotification } from "../store";
import { maybeSettleFixture } from "../settlement/keeper";
import { lockMarket, voidMarketsForFixture } from "../markets/service";

function seedDemoFixtures(): Fixture[] {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  return [
    {
      id: "demo-wc-001",
      competition: "FIFA World Cup",
      round: "Group A",
      group: "A",
      kickoffTs: now - 35 * 60 * 1000,
      status: "live",
      home: { name: "Mexico", shortName: "MEX" },
      away: { name: "South Africa", shortName: "RSA" },
      score: { home: 1, away: 0 },
    },
    {
      id: "demo-wc-002",
      competition: "FIFA World Cup",
      round: "Group B",
      group: "B",
      kickoffTs: now + 2 * hour,
      status: "scheduled",
      home: { name: "Canada", shortName: "CAN" },
      away: { name: "Qatar", shortName: "QAT" },
    },
    {
      id: "demo-wc-003",
      competition: "FIFA World Cup",
      round: "Group C",
      group: "C",
      kickoffTs: now + 5 * hour,
      status: "scheduled",
      home: { name: "Brazil", shortName: "BRA" },
      away: { name: "Morocco", shortName: "MAR" },
    },
    {
      id: "demo-wc-004",
      competition: "FIFA World Cup",
      round: "Group D",
      group: "D",
      kickoffTs: now - 2 * hour,
      status: "finished",
      home: { name: "France", shortName: "FRA" },
      away: { name: "USA", shortName: "USA" },
      score: { home: 2, away: 1 },
    },
    {
      id: "demo-wc-005",
      competition: "FIFA World Cup",
      round: "Group E",
      group: "E",
      kickoffTs: now + 26 * hour,
      status: "scheduled",
      home: { name: "Germany", shortName: "GER" },
      away: { name: "Japan", shortName: "JPN" },
    },
    {
      id: "demo-wc-006",
      competition: "International Friendly",
      round: "Friendly",
      kickoffTs: now + 90 * 60 * 1000,
      status: "scheduled",
      home: { name: "Argentina", shortName: "ARG" },
      away: { name: "Spain", shortName: "ESP" },
    },
  ];
}

export async function bootstrapFixtures(cfg: TxlineConfig | null, demoMode: boolean) {
  if (demoMode || !cfg?.apiToken) {
    mutate((s) => {
      for (const f of seedDemoFixtures()) s.fixtures[f.id] = f;
    }, "fixtures", Object.values(getState().fixtures));
    console.log(`[ingest] seeded ${Object.keys(getState().fixtures).length} demo fixtures`);
    return;
  }

  try {
    const fixtures = await fetchFixtures(cfg);
    mutate((s) => {
      for (const f of fixtures) s.fixtures[f.id] = f;
    }, "fixtures", fixtures);
    console.log(`[ingest] loaded ${fixtures.length} TxLINE fixtures`);

    const scores = await fetchScoresSnapshot(cfg);
    mutate((s) => {
      for (const sc of scores) {
        s.live[sc.fixtureId] = sc;
        const f = s.fixtures[sc.fixtureId];
        if (f) {
          f.score = { home: sc.homeScore, away: sc.awayScore };
          f.status = sc.status;
        }
      }
    }, "scores", scores);
  } catch (err) {
    console.warn("[ingest] TxLINE fixtures failed, falling back to demo:", err);
    mutate((s) => {
      for (const f of seedDemoFixtures()) {
        if (!s.fixtures[f.id]) s.fixtures[f.id] = f;
      }
    }, "fixtures", Object.values(getState().fixtures));
  }
}

function applyScoreUpdate(update: ReturnType<typeof normalizeScoreUpdate>) {
  if (!update) return;
  mutate((s) => {
    s.live[update.fixtureId] = update;
    const f = s.fixtures[update.fixtureId];
    if (f) {
      f.score = { home: update.homeScore, away: update.awayScore };
      f.status = update.status;
      f.period = update.period;
    } else {
      s.fixtures[update.fixtureId] = {
        id: update.fixtureId,
        kickoffTs: Date.now(),
        status: update.status,
        home: { name: "Home" },
        away: { name: "Away" },
        score: { home: update.homeScore, away: update.awayScore },
        competition: "World Cup",
      };
    }
  }, "score", update);

  if (update.status === "live") {
    for (const m of Object.values(getState().markets)) {
      if (m.fixtureId === update.fixtureId && m.status === "open") {
        lockMarket(m.id);
      }
    }
  }

  if (update.status === "cancelled" || update.status === "postponed") {
    voidMarketsForFixture(update.fixtureId, `fixture ${update.status}`);
  }

  if (
    update.status === "finished" ||
    isFinalScoreRecord({
      action: update.action,
      statusId: update.statusId,
      period: update.period,
    })
  ) {
    void maybeSettleFixture(update.fixtureId, update.homeScore, update.awayScore);
  }
}

export function startSseIngest(cfg: TxlineConfig) {
  const scoresUrl = sseUrl(cfg, "scores");
  console.log(`[ingest] connecting scores SSE ${scoresUrl}`);

  const es = new EventSource(scoresUrl, {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          ...txlineHeaders(cfg),
        },
      }),
  });

  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const fixture = normalizeFixture(item);
        if (fixture) {
          mutate((s) => {
            s.fixtures[fixture.id] = { ...s.fixtures[fixture.id], ...fixture };
          }, "fixture", fixture);
        }
        applyScoreUpdate(normalizeScoreUpdate(item));
      }
    } catch (err) {
      console.warn("[ingest] scores parse error", err);
    }
  };

  es.onerror = (err) => {
    console.warn("[ingest] scores SSE error", err);
  };

  try {
    const oddsEs = new EventSource(sseUrl(cfg, "odds"), {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers || {}),
            ...txlineHeaders(cfg),
          },
        }),
    });
    oddsEs.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const items = Array.isArray(data) ? data : [data];
        mutate((s) => {
          for (const item of items) {
            if (!item || typeof item !== "object") continue;
            const o = item as Record<string, unknown>;
            const fixtureId = String(o.fixtureId ?? o.id ?? "");
            if (!fixtureId) continue;
            const quote: OddsQuote = {
              fixtureId,
              market: String(o.market ?? o.marketType ?? "1x2"),
              selection: String(o.selection ?? o.outcome ?? o.name ?? "unknown"),
              price: Number(o.price ?? o.odds ?? o.decimal ?? 0),
              ts: Number(o.ts ?? Date.now()),
            };
            const list = s.odds[fixtureId] || [];
            const idx = list.findIndex(
              (q) => q.market === quote.market && q.selection === quote.selection
            );
            if (idx >= 0) list[idx] = quote;
            else list.push(quote);
            s.odds[fixtureId] = list.slice(-40);
          }
        }, "odds", null);
      } catch {
        // ignore malformed odds frames
      }
    };
  } catch (err) {
    console.warn("[ingest] odds SSE unavailable", err);
  }

  return () => es.close();
}

/** Demo clock that advances a live demo match toward full-time for settlement demos. */
export function startDemoMatchSimulator() {
  const id = "demo-wc-001";
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
    const state = getState();
    const f = state.fixtures[id];
    if (!f || f.status === "finished") return;

    let home = f.score?.home ?? 0;
    let away = f.score?.away ?? 0;
    if (ticks === 3) home = 1;
    if (ticks === 6) away = 1;
    if (ticks === 9) home = 2;

    const finished = ticks >= 12;
    applyScoreUpdate({
      fixtureId: id,
      homeScore: home,
      awayScore: away,
      status: finished ? "finished" : "live",
      action: finished ? "game_finalised" : "score_update",
      statusId: finished ? 100 : 2,
      period: finished ? 100 : 2,
      clock: finished ? "FT" : `${Math.min(90, 40 + ticks * 4)}'`,
      ts: Date.now(),
    });

    if (finished) {
      pushNotification("settle", `${f.home.name} ${home}-${away} ${f.away.name} — full time`);
      clearInterval(timer);
    }
  }, 15_000);

  return () => clearInterval(timer);
}
