import {
  isFinalScoreRecord,
  resolveMatchResult,
  resolveTotals,
} from "@whistle/shared";
import { getState } from "../store";
import { settleMarketOffchain } from "../markets/service";
import {
  TxlineConfig,
  fetchHistoricalScores,
  fetchStatValidationV2,
  normalizeScoreUpdate,
} from "../txline/client";
import { submitOnchainSettle } from "./onchain";

let txlineCfg: TxlineConfig | null = null;
let settleEnabled = true;

export function configureKeeper(cfg: TxlineConfig | null, enabled: boolean) {
  txlineCfg = cfg;
  settleEnabled = enabled;
}

export async function maybeSettleFixture(
  fixtureId: string,
  homeScore: number,
  awayScore: number
) {
  if (!settleEnabled) return;
  const markets = Object.values(getState().markets).filter(
    (m) =>
      m.fixtureId === fixtureId &&
      (m.status === "open" || m.status === "locked")
  );
  if (!markets.length) return;

  let settleTxSig: string | undefined;
  let mode: "onchain" | "offchain" = "offchain";

  if (txlineCfg?.apiToken && !fixtureId.startsWith("demo-")) {
    try {
      const historical = await fetchHistoricalScores(txlineCfg, fixtureId);
      const finalRec = historical
        .map((r) => normalizeScoreUpdate(r))
        .find(
          (u) =>
            u &&
            (u.status === "finished" ||
              isFinalScoreRecord({
                action: u.action,
                statusId: u.statusId,
                period: u.period,
              }))
        );

      const seq =
        (finalRec as { seq?: number } | null)?.seq ??
        (historical[historical.length - 1] as { seq?: number } | undefined)?.seq ??
        0;

      const validation = await fetchStatValidationV2(
        txlineCfg,
        fixtureId,
        seq,
        ["home_score", "away_score", "final_outcome"]
      ).catch(() => null);

      const onchain = await submitOnchainSettle({
        fixtureId,
        homeScore,
        awayScore,
        validation,
      });
      if (onchain?.signature) {
        settleTxSig = onchain.signature;
        mode = "onchain";
      }
    } catch (err) {
      console.warn("[keeper] on-chain settle path failed, using offchain:", err);
    }
  }

  for (const market of markets) {
    // Validate deterministic mapping matches expected outcome before writing
    if (market.marketType === "match_result") {
      resolveMatchResult(homeScore, awayScore);
    } else {
      resolveTotals(homeScore, awayScore, market.line ?? 2.5);
    }
    settleMarketOffchain(market.id, homeScore, awayScore, settleTxSig);
    console.log(
      `[keeper] settled market ${market.id} for ${fixtureId} via ${mode}`
    );
  }
}

export async function runKeeperPass() {
  const state = getState();
  for (const live of Object.values(state.live)) {
    if (
      live.status === "finished" ||
      isFinalScoreRecord({
        action: live.action,
        statusId: live.statusId,
        period: live.period,
      })
    ) {
      await maybeSettleFixture(live.fixtureId, live.homeScore, live.awayScore);
    }
  }

  // Also settle finished fixtures that have open markets
  for (const f of Object.values(state.fixtures)) {
    if (f.status === "finished" && f.score) {
      await maybeSettleFixture(f.id, f.score.home, f.score.away);
    }
  }
}

export function startKeeperLoop(intervalMs = 20_000) {
  const tick = () => {
    void runKeeperPass().catch((e) => console.warn("[keeper] pass error", e));
  };
  tick();
  return setInterval(tick, intervalMs);
}
