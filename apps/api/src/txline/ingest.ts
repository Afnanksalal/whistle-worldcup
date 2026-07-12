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
import { fetchPublicFixtures } from "../fixtures/publicSchedule";
import { getState, mutate } from "../store";
import { maybeSettleFixture } from "../settlement/keeper";
import { lockMarket, voidMarketsForFixture } from "../markets/service";
import { bumpMetric, getLogger, markIngest } from "../observability";

const log = () => getLogger().child({ module: "ingest" });

export type FixtureSource = "txline" | "thesportsdb";

let activeSource: FixtureSource = "txline";

export function getFixtureSource(): FixtureSource {
  return activeSource;
}

function wipeLegacyDemoIds(s: {
  fixtures: Record<string, Fixture>;
  live: Record<string, unknown>;
  odds: Record<string, unknown>;
}) {
  for (const id of Object.keys(s.fixtures)) {
    if (id.startsWith("sandbox-") || id.startsWith("demo-")) {
      delete s.fixtures[id];
      delete s.live[id];
      delete s.odds[id];
    }
  }
}

async function loadPublicBoard() {
  const fixtures = await fetchPublicFixtures();
  activeSource = "thesportsdb";
  mutate((s) => {
    wipeLegacyDemoIds(s);
    s.fixtures = {};
    for (const f of fixtures) s.fixtures[f.id] = f;
  }, "fixtures", fixtures);
  markIngest();
  log().info({ count: fixtures.length, source: activeSource }, "board ready");
}

export async function bootstrapFixtures(cfg: TxlineConfig | null) {
  if (cfg?.apiToken && !cfg.apiToken.startsWith("txl_")) {
    // Prefer real TxLINE when token does not look like our local placeholder
    try {
      const fixtures = await fetchFixtures(cfg);
      if (!fixtures.length) throw new Error("TxLINE returned zero fixtures");
      activeSource = "txline";
      mutate((s) => {
        wipeLegacyDemoIds(s);
        for (const f of fixtures) s.fixtures[f.id] = f;
      }, "fixtures", fixtures);
      markIngest();
      log().info({ count: fixtures.length }, "loaded TxLINE fixtures");

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
      return;
    } catch (err) {
      log().warn({ err }, "TxLINE bootstrap failed — using public sports API");
    }
  } else if (cfg?.apiToken) {
    // Placeholder token: try TxLINE once, then public API
    try {
      const fixtures = await fetchFixtures(cfg);
      if (fixtures.length) {
        activeSource = "txline";
        mutate((s) => {
          wipeLegacyDemoIds(s);
          for (const f of fixtures) s.fixtures[f.id] = f;
        }, "fixtures", fixtures);
        markIngest();
        log().info({ count: fixtures.length }, "loaded TxLINE fixtures");
        return;
      }
    } catch (err) {
      log().warn({ err }, "placeholder TxLINE token rejected — public sports API");
    }
  }

  await loadPublicBoard();
}

export async function refreshFixtures(cfg: TxlineConfig | null) {
  if (activeSource === "txline" && cfg?.apiToken) {
    const fixtures = await fetchFixtures(cfg);
    if (!fixtures.length) return;
    mutate((s) => {
      for (const f of fixtures) {
        const prev = s.fixtures[f.id];
        s.fixtures[f.id] = prev ? { ...prev, ...f, score: f.score ?? prev.score } : f;
      }
    }, "fixtures", fixtures);
    markIngest();
    return;
  }
  await loadPublicBoard();
}

function applyScoreUpdate(update: ReturnType<typeof normalizeScoreUpdate>) {
  if (!update) return;
  markIngest();
  mutate((s) => {
    s.live[update.fixtureId] = update;
    const f = s.fixtures[update.fixtureId];
    if (f) {
      f.score = { home: update.homeScore, away: update.awayScore };
      f.status = update.status;
      f.period = update.period;
    } else {
      log().warn({ fixtureId: update.fixtureId }, "score for unknown fixture");
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
  if (activeSource !== "txline") {
    log().info("SSE skipped — board sourced from public sports API");
    return () => undefined;
  }

  const scoresUrl = sseUrl(cfg, "scores");
  log().info({ scoresUrl }, "connecting scores SSE");

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
        if (fixture && fixture.home.name !== "Home") {
          mutate((s) => {
            s.fixtures[fixture.id] = { ...s.fixtures[fixture.id], ...fixture };
          }, "fixture", fixture);
        }
        applyScoreUpdate(normalizeScoreUpdate(item));
      }
    } catch (err) {
      log().warn({ err }, "scores parse error");
    }
  };

  es.onerror = () => {
    bumpMetric("sseReconnects");
    log().warn("scores SSE error — EventSource will retry");
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
        markIngest();
      } catch {
        // ignore
      }
    };
  } catch (err) {
    log().warn({ err }, "odds SSE unavailable");
  }

  return () => es.close();
}
