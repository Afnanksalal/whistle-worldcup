import { EventSource } from "eventsource";
import {
  Fixture,
  OddsQuote,
  isFinalScoreRecord,
} from "@whistle/shared";
import {
  TxlineConfig,
  enrichFinishedFixtureScores,
  fetchFixtures,
  fetchScoresSnapshot,
  normalizeFixture,
  normalizeScoreUpdate,
  sseUrl,
  txlineHeaders,
} from "./client";
import {
  fetchPublicFixtures,
  isCurrentWorldCupPublicFixture,
} from "../fixtures/publicSchedule";
import { enrichFixturesWithTeamAssets } from "../fixtures/teamAssets";
import { getState, mutate } from "../store";
import { maybeSettleFixture } from "../settlement/keeper";
import {
  enforceMarketCutoffs,
  voidMarketsForFixtureWithRail,
} from "../markets/service";
import { bumpMetric, getLogger, markIngest } from "../observability";
import { isPlaceholderTxlineToken } from "../config";

const log = () => getLogger().child({ module: "ingest" });

export type FixtureSource = "txline" | "thesportsdb";

let onchainEnabled = false;

/** Keep ingest void path aligned with the settlement rail. */
export function configureIngest(useOnchain: boolean) {
  onchainEnabled = useOnchain;
}

let activeSource: FixtureSource = "txline";
let publicBoardLoadedAt = 0;
let publicBoardInFlight: Promise<void> | null = null;
let lastTxlineRetryAt = 0;
let activeSseKey: string | null = null;
let activeSseStop: (() => void) | null = null;

const PUBLIC_BOARD_TTL_MS = Math.max(
  60_000,
  Number(process.env.PUBLIC_SCHEDULE_REFRESH_MS || 10 * 60_000)
);
const TXLINE_RETRY_MS = Math.max(
  60_000,
  Number(process.env.TXLINE_RETRY_MS || 5 * 60_000)
);

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

function wipePublicFallbackIds(s: {
  fixtures: Record<string, Fixture>;
  live: Record<string, unknown>;
  odds: Record<string, unknown>;
}) {
  for (const id of Object.keys(s.fixtures)) {
    if (!id.startsWith("tsdb-")) continue;
    delete s.fixtures[id];
    delete s.live[id];
    delete s.odds[id];
  }
}

async function loadPublicBoard(force = false) {
  if (!force && Date.now() - publicBoardLoadedAt < PUBLIC_BOARD_TTL_MS) return;
  if (publicBoardInFlight) return publicBoardInFlight;

  publicBoardInFlight = (async () => {
    try {
      const fixtures = await fetchPublicFixtures();
      activeSource = "thesportsdb";
      mutate((s) => {
        wipeLegacyDemoIds(s);
        s.fixtures = {};
        for (const f of fixtures) s.fixtures[f.id] = f;
      }, "fixtures", fixtures);
      publicBoardLoadedAt = Date.now();
      markIngest();
      log().info({ count: fixtures.length, source: activeSource }, "board ready");
    } catch (error) {
      const cached = Object.values(getState().fixtures).filter(
        isCurrentWorldCupPublicFixture
      );
      if (!cached.length) throw error;
      activeSource = "thesportsdb";
      mutate((state) => {
        state.fixtures = Object.fromEntries(cached.map((fixture) => [fixture.id, fixture]));
      }, "fixtures", cached);
      publicBoardLoadedAt = Date.now();
      log().warn(
        { err: error, count: cached.length },
        "public schedule refresh failed; retained persisted board"
      );
    }
  })().finally(() => {
    publicBoardInFlight = null;
  });
  return publicBoardInFlight;
}

export async function bootstrapFixtures(cfg: TxlineConfig | null) {
  if (cfg?.apiToken && !isPlaceholderTxlineToken(cfg.apiToken)) {
    // Prefer real TxLINE when token does not look like our local placeholder
    try {
      const fixtures = await enrichFixturesWithTeamAssets(await fetchFixtures(cfg));
      if (!fixtures.length) throw new Error("TxLINE returned zero fixtures");
      activeSource = "txline";
      mutate((s) => {
        wipeLegacyDemoIds(s);
        wipePublicFallbackIds(s);
        // Replace the board so lookback/competition filters don't keep stale rows.
        s.fixtures = Object.fromEntries(fixtures.map((f) => [f.id, f]));
        for (const id of Object.keys(s.live)) {
          if (!s.fixtures[id]) delete s.live[id];
        }
        for (const id of Object.keys(s.odds)) {
          if (!s.fixtures[id]) delete s.odds[id];
        }
      }, "fixtures", fixtures);
      markIngest();
      const finished = fixtures.filter((f) => f.status === "finished").length;
      log().info(
        { count: fixtures.length, finished },
        "loaded TxLINE fixtures"
      );

      const scores = await fetchScoresSnapshot(cfg);
      mutate((s) => {
        for (const sc of scores) {
          s.live[sc.fixtureId] = sc;
          const f = s.fixtures[sc.fixtureId];
          if (f) {
            f.score = { home: sc.homeScore, away: sc.awayScore };
            if (sc.status === "finished" || sc.status === "live") {
              f.status = sc.status;
            }
          }
        }
      }, "scores", scores);

      // Past WC tapes are per-fixture; backfill in the background so boot stays fast.
      void enrichFinishedFixtureScores(cfg, fixtures, {
        skipFixtureIds: scores.map((score) => score.fixtureId),
      })
        .then((historicalScores) => {
          if (!historicalScores.length) return;
          mutate((s) => {
            for (const sc of historicalScores) {
              s.live[sc.fixtureId] = sc;
              const f = s.fixtures[sc.fixtureId];
              if (!f) continue;
              f.score = { home: sc.homeScore, away: sc.awayScore };
              if (sc.status === "finished" || sc.status === "live") {
                f.status = sc.status;
              }
            }
          }, "scores", historicalScores);
          log().info(
            { scoresBackfilled: historicalScores.length },
            "backfilled TxLINE historical scores"
          );
        })
        .catch((err) => {
          log().warn({ err }, "TxLINE historical score backfill failed");
        });
      return;
    } catch (err) {
      log().warn({ err }, "TxLINE bootstrap failed — using public sports API");
    }
  } else if (cfg?.apiToken) {
    log().info("placeholder TxLINE token configured — loading cached public schedule");
  }

  await loadPublicBoard(true);
}

export async function refreshFixtures(cfg: TxlineConfig | null) {
  const realTxline = Boolean(
    cfg?.apiToken && !isPlaceholderTxlineToken(cfg.apiToken)
  );
  const shouldTryTxline =
    realTxline &&
    (activeSource === "txline" || Date.now() - lastTxlineRetryAt >= TXLINE_RETRY_MS);

  if (shouldTryTxline && cfg) {
    lastTxlineRetryAt = Date.now();
    try {
      const fixtures = await enrichFixturesWithTeamAssets(await fetchFixtures(cfg));
      if (!fixtures.length) throw new Error("TxLINE returned zero fixtures");
      activeSource = "txline";
      const alreadyScored = Object.entries(getState().fixtures)
        .filter(([, f]) => f.score?.home !== undefined && f.score?.away !== undefined)
        .map(([id]) => id);
      const historicalScores = await enrichFinishedFixtureScores(cfg, fixtures, {
        skipFixtureIds: alreadyScored,
      });
      mutate((s) => {
        wipePublicFallbackIds(s);
        for (const f of fixtures) {
          const prev = s.fixtures[f.id];
          // Keep prior UI assets if a refresh briefly fails badge lookup.
          const merged = prev
            ? {
                ...prev,
                ...f,
                score: f.score ?? prev.score,
                home: {
                  ...f.home,
                  logo: f.home.logo || prev.home.logo,
                  shortName: f.home.shortName || prev.home.shortName,
                },
                away: {
                  ...f.away,
                  logo: f.away.logo || prev.away.logo,
                  shortName: f.away.shortName || prev.away.shortName,
                },
              }
            : f;
          s.fixtures[f.id] = merged;
        }
        for (const sc of historicalScores) {
          s.live[sc.fixtureId] = sc;
          const f = s.fixtures[sc.fixtureId];
          if (!f) continue;
          f.score = { home: sc.homeScore, away: sc.awayScore };
          if (sc.status === "finished" || sc.status === "live") f.status = sc.status;
        }
      }, "fixtures", fixtures);
      markIngest();
      log().info(
        {
          count: fixtures.length,
          finished: fixtures.filter((f) => f.status === "finished").length,
          scoresBackfilled: historicalScores.length,
        },
        "refreshed TxLINE fixtures"
      );
      return;
    } catch (error) {
      if (activeSource === "txline") throw error;
      log().warn({ err: error }, "TxLINE retry failed; retaining cached public board");
    }
  }
  await loadPublicBoard();
}

function eventKey(event: {
  type: string;
  minute?: number;
  team?: string;
  player?: string;
  detail?: string;
}): string {
  return [
    event.type,
    event.minute ?? "",
    event.team ?? "",
    event.player ?? "",
    event.detail ?? "",
  ].join("|");
}

function applyScoreUpdate(update: ReturnType<typeof normalizeScoreUpdate>) {
  if (!update) return;
  markIngest();
  mutate((s) => {
    const prev = s.live[update.fixtureId];
    const mergedEvents = [...(prev?.events || [])];
    const seen = new Set(mergedEvents.map(eventKey));
    for (const event of update.events || []) {
      const key = eventKey(event);
      if (seen.has(key)) continue;
      seen.add(key);
      mergedEvents.push(event);
    }
    mergedEvents.sort((a, b) => (a.minute || 0) - (b.minute || 0));
    s.live[update.fixtureId] = {
      ...update,
      events: mergedEvents.length ? mergedEvents : update.events,
    };
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
    enforceMarketCutoffs();
  }

  if (update.status === "cancelled" || update.status === "postponed") {
    // On-chain first, then ledger. If the rail void fails, leave markets active
    // so USDC is not stuck while the ledger says refundable.
    void voidMarketsForFixtureWithRail(
      update.fixtureId,
      `fixture ${update.status}`,
      onchainEnabled
    ).catch((err) => {
      log().error(
        { err, fixtureId: update.fixtureId, status: update.status, onchainEnabled },
        "rail-aware fixture void failed; markets left active"
      );
    });
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

  const streamKey = cfg.apiOrigin;
  if (activeSseKey === streamKey && activeSseStop) return activeSseStop;
  if (activeSseStop) activeSseStop();

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

  let oddsEs: EventSource | null = null;
  try {
    oddsEs = new EventSource(sseUrl(cfg, "odds"), {
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
    oddsEs.onerror = () => {
      bumpMetric("sseReconnects");
      log().warn("odds SSE error — EventSource will retry");
    };
  } catch (err) {
    log().warn({ err }, "odds SSE unavailable");
  }

  const stop = () => {
    es.close();
    oddsEs?.close();
    if (activeSseStop === stop) {
      activeSseStop = null;
      activeSseKey = null;
    }
  };
  activeSseKey = streamKey;
  activeSseStop = stop;
  return stop;
}
