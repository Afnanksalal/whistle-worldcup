import { isFinalScoreRecord } from "@whistle/shared";
import { getState } from "../store";
import {
  settleMarketVerified,
  voidMarketsForFixtureWithRail,
} from "../markets/service";
import {
  TxlineConfig,
  fetchHistoricalScores,
  fetchStatValidationV2,
  normalizeScoreUpdate,
} from "../txline/client";
import { getLogger, markSettle } from "../observability";

let txlineCfg: TxlineConfig | null = null;
let settleEnabled = true;
let onchainEnabled = false;

export function configureKeeper(
  cfg: TxlineConfig | null,
  enabled: boolean,
  useOnchain = false
) {
  txlineCfg = cfg;
  settleEnabled = enabled;
  onchainEnabled = useOnchain;
}

export type SettlementAttempt = {
  status: "disabled" | "noop" | "pending" | "voided" | "settled";
  reason?: string;
};

function sequenceFrom(raw: unknown): number | string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  for (const key of ["seq", "sequence", "Sequence"]) {
    const value = obj[key];
    if (typeof value === "number" || typeof value === "string") return value;
  }
  return null;
}

function sequenceOrder(raw: unknown): number {
  const value = sequenceFrom(raw);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : -1;
}

function validationPresent(validation: unknown): boolean {
  if (Array.isArray(validation)) return validation.length > 0;
  if (!validation || typeof validation !== "object") return false;
  const value = validation as Record<string, unknown>;
  if (value.valid === false || value.ok === false || value.error) return false;
  return Object.keys(value).length > 0;
}

export async function maybeSettleFixture(
  fixtureId: string,
  homeScore: number,
  awayScore: number
): Promise<SettlementAttempt> {
  if (!settleEnabled) return { status: "disabled", reason: "keeper disabled" };
  const log = getLogger().child({ module: "keeper" });
  const markets = Object.values(getState().markets).filter(
    (m) =>
      m.fixtureId === fixtureId &&
      (m.status === "open" || m.status === "locked")
  );
  if (!markets.length) return { status: "noop" };

  const refundUnverified = async (reason: string): Promise<SettlementAttempt> => {
    const voided = await voidMarketsForFixtureWithRail(
      fixtureId,
      reason,
      onchainEnabled
    );
    log.warn(
      { fixtureId, markets: voided.length, reason },
      "unverified result refused; active stakes made refundable"
    );
    return { status: "voided", reason };
  };

  if (!txlineCfg?.apiToken) {
    return await refundUnverified("TxLINE result verification unavailable");
  }

  let canonicalHome: number;
  let canonicalAway: number;
  try {
    const historical = await fetchHistoricalScores(txlineCfg, fixtureId);
    const finals = historical
      .map((raw) => ({ raw, update: normalizeScoreUpdate(raw) }))
      .filter(
        (item) =>
          item.update &&
          (item.update.status === "finished" ||
            isFinalScoreRecord({
              action: item.update.action,
              statusId: item.update.statusId,
              period: item.update.period,
            }))
      )
      .sort((a, b) => sequenceOrder(a.raw) - sequenceOrder(b.raw));
    const final = finals[finals.length - 1];
    const seq = final ? sequenceFrom(final.raw) : null;
    if (!final?.update || seq === null) {
      log.warn({ fixtureId }, "TxLINE final record/sequence not available yet");
      return await refundUnverified("TxLINE final record unavailable");
    }

    const validation = await fetchStatValidationV2(txlineCfg, fixtureId, seq, [
      "home_score",
      "away_score",
      "final_outcome",
    ]);
    if (!validationPresent(validation)) {
      log.warn({ fixtureId, seq }, "TxLINE validation payload empty");
      return await refundUnverified("TxLINE validation unavailable");
    }

    canonicalHome = final.update.homeScore;
    canonicalAway = final.update.awayScore;
    if (canonicalHome !== homeScore || canonicalAway !== awayScore) {
      log.warn(
        {
          fixtureId,
          received: [homeScore, awayScore],
          canonical: [canonicalHome, canonicalAway],
          seq,
        },
        "incoming score differed from verified TxLINE final; canonical score used"
      );
    }
  } catch (err) {
    log.warn({ err, fixtureId }, "TxLINE settlement verification failed");
    return await refundUnverified("TxLINE validation unavailable");
  }

  for (const market of markets) {
    await settleMarketVerified(
      market.id,
      canonicalHome,
      canonicalAway,
      onchainEnabled
    );
    markSettle();
    log.info(
      {
        marketId: market.id,
        fixtureId,
        mode: onchainEnabled ? "verified-onchain" : "verified-ledger",
      },
      "settled market from verified TxLINE final"
    );
  }
  return { status: "settled" };
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

  for (const f of Object.values(state.fixtures)) {
    if (f.status === "finished" && f.score) {
      await maybeSettleFixture(f.id, f.score.home, f.score.away);
    }
  }
}

export function startKeeperLoop(intervalMs = 20_000) {
  const tick = () => {
    void runKeeperPass().catch((e) =>
      getLogger().warn({ err: e }, "keeper pass error")
    );
  };
  tick();
  return setInterval(tick, intervalMs);
}
