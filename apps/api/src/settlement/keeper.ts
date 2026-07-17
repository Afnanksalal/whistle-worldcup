import {
  isFinalScoreRecord,
  isKnockoutMatchResult,
  teamOutcomeSlug,
  type SettlementReceipt,
} from "@whistle/shared";
import { getState, mutate } from "../store";
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
import { extractMerkleSummary, proofSummaryLine } from "./merkle";
import { verifyValidationAgainstChain } from "./txlineVerify";
import { getLogger, markSettle } from "../observability";

let txlineCfg: TxlineConfig | null = null;
let settleEnabled = true;
let onchainEnabled = false;
let network: "devnet" | "mainnet" = "devnet";
let keeperPassInFlight = false;

export function configureKeeper(
  cfg: TxlineConfig | null,
  enabled: boolean,
  useOnchain = false,
  net: "devnet" | "mainnet" = "devnet"
) {
  txlineCfg = cfg;
  settleEnabled = enabled;
  onchainEnabled = useOnchain;
  network = net;
}

export type SettlementAttempt = {
  status: "disabled" | "noop" | "pending" | "voided" | "settled";
  reason?: string;
  receipt?: SettlementReceipt;
};

function sequenceFrom(raw: unknown): number | string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  for (const key of ["seq", "sequence", "Sequence", "Seq"]) {
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

function firstScorerTeam(
  fixtureId: string
): "home" | "away" | null {
  const events = getState().live[fixtureId]?.events || [];
  const goal = events.find(
    (event) =>
      event.type === "goal" ||
      event.type === "penalty" ||
      (event.type.includes("goal") && !event.type.includes("disallowed"))
  );
  if (goal?.team === "home" || goal?.team === "away") return goal.team;
  return null;
}

function isWorldCupFinal(fixtureId: string): boolean {
  const fixture = getState().fixtures[fixtureId];
  if (!fixture) return false;
  const competition = (fixture.competition || "").toLowerCase();
  if (!competition.includes("world cup")) return false;
  const round = `${fixture.round || ""} ${fixture.group || ""}`.toLowerCase();
  return (
    round.includes("final") &&
    !round.includes("semi") &&
    !round.includes("quarter") &&
    !round.includes("group")
  );
}

/** Prefer waiting over voiding — temporary TxLINE/RPC gaps must not kill pools. */
function pending(reason: string): SettlementAttempt {
  getLogger()
    .child({ module: "keeper" })
    .info({ reason }, "settlement deferred until verification is complete");
  return { status: "pending", reason };
}

function advancingSideFromRaw(
  raw: unknown,
  fixtureId: string
): "home" | "away" | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const candidates = [
    obj.AdvancingParticipantId,
    obj.advancingParticipantId,
    obj.WinnerParticipantId,
    obj.winnerParticipantId,
    obj.WinnerId,
    obj.winnerId,
  ];
  const fixture = getState().fixtures[fixtureId];
  if (!fixture) return null;
  for (const candidate of candidates) {
    const id = candidate == null ? "" : String(candidate);
    if (!id) continue;
    if (id === fixture.home.id) return "home";
    if (id === fixture.away.id) return "away";
  }
  const side = String(
    obj.AdvancingSide || obj.advancingSide || obj.WinnerSide || obj.winnerSide || ""
  ).toLowerCase();
  if (side === "home" || side === "1" || side === "participant1") return "home";
  if (side === "away" || side === "2" || side === "participant2") return "away";
  return null;
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
      (m.fixtureId === fixtureId || m.marketType === "tournament_winner") &&
      (m.status === "open" || m.status === "locked")
  );
  const fixtureMarkets = markets.filter((m) => m.fixtureId === fixtureId);
  if (!fixtureMarkets.length && !markets.some((m) => m.marketType === "tournament_winner")) {
    return { status: "noop" };
  }

  const fixture = getState().fixtures[fixtureId];
  if (fixture?.status === "cancelled" || fixture?.status === "postponed") {
    const voided = await voidMarketsForFixtureWithRail(
      fixtureId,
      `fixture ${fixture.status}`,
      onchainEnabled
    );
    log.warn(
      { fixtureId, markets: voided.length, status: fixture.status },
      "fixture cancelled/postponed; stakes made refundable"
    );
    return { status: "voided", reason: `fixture ${fixture.status}` };
  }

  if (!txlineCfg?.apiToken) {
    return pending("TxLINE result verification unavailable");
  }

  let canonicalHome: number;
  let canonicalAway: number;
  let seq: number | string;
  let validation: unknown;
  let onchainProofVerified = false;
  let merkle: SettlementReceipt["merkle"] = {};
  let advancingSide: "home" | "away" | null = null;
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
    const finalSeq = final ? sequenceFrom(final.raw) : null;
    if (!final?.update || finalSeq === null) {
      log.warn({ fixtureId }, "TxLINE final record/sequence not available yet");
      return pending("TxLINE final record unavailable");
    }
    seq = finalSeq;
    advancingSide = advancingSideFromRaw(final.raw, fixtureId);

    validation = await fetchStatValidationV2(txlineCfg, fixtureId, seq, [1, 2]);
    if (!validationPresent(validation)) {
      log.warn({ fixtureId, seq }, "TxLINE validation payload empty");
      return pending("TxLINE validation unavailable");
    }

    merkle = extractMerkleSummary(validation, network);
    const hasOnchainStake = fixtureMarkets.some((market) => market.totalPool > 0);
    if (hasOnchainStake) {
      const chain = await verifyValidationAgainstChain(validation, {
        network,
        rpcUrl: process.env.SOLANA_RPC_URL?.trim(),
      });
      onchainProofVerified = chain.ok;
      if (!chain.ok) {
        log.warn(
          { fixtureId, seq, reason: chain.reason, pda: chain.dailyScoresPda },
          "on-chain Merkle root check did not pass; settling with REST validation + receipt"
        );
      }
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
    return pending("TxLINE validation unavailable");
  }

  const settledIds: string[] = [];
  let settleTxSig: string | undefined;
  const firstTeam = firstScorerTeam(fixtureId);
  const corners = getState().matchStats[fixtureId]?.corners;
  const knockout =
    fixture != null ? isKnockoutMatchResult(fixture) : false;

  if (knockout && canonicalHome === canonicalAway && !advancingSide) {
    return pending(
      "knockout level after regulation; waiting for advancing side (ET/pens)"
    );
  }

  for (const market of fixtureMarkets) {
    if (
      market.marketType === "total_corners" &&
      (corners?.home == null || corners?.away == null)
    ) {
      log.warn(
        { marketId: market.id, fixtureId },
        "corner market deferred — box-score corners not available yet"
      );
      continue;
    }
    if (
      market.marketType === "first_scorer" &&
      (canonicalHome > 0 || canonicalAway > 0) &&
      !firstTeam &&
      canonicalHome > 0 &&
      canonicalAway > 0
    ) {
      log.warn(
        { marketId: market.id, fixtureId },
        "first-scorer market deferred — both sides scored and event tape missing"
      );
      continue;
    }

    const settled = await settleMarketVerified(
      market.id,
      canonicalHome,
      canonicalAway,
      onchainEnabled,
      {
        firstTeam,
        homeCorners: corners?.home,
        awayCorners: corners?.away,
        advancingSide: advancingSide || undefined,
      }
    );
    if (settled.settleTxSig) settleTxSig = settled.settleTxSig;
    settledIds.push(market.id);
    markSettle();
    log.info(
      {
        marketId: market.id,
        fixtureId,
        marketType: market.marketType,
        mode: onchainEnabled ? "verified-onchain" : "verified-ledger",
        onchainProofVerified,
      },
      "settled market from verified TxLINE final"
    );
  }

  if (!settledIds.length) {
    return pending("no markets ready to settle yet");
  }

  if (isWorldCupFinal(fixtureId)) {
    const winnerName =
      canonicalHome > canonicalAway
        ? getState().fixtures[fixtureId]?.home.name
        : canonicalAway > canonicalHome
          ? getState().fixtures[fixtureId]?.away.name
          : null;
    if (winnerName) {
      const slug = teamOutcomeSlug(winnerName);
      for (const market of Object.values(getState().markets)) {
        if (
          market.marketType !== "tournament_winner" ||
          (market.status !== "open" && market.status !== "locked")
        ) {
          continue;
        }
        if (!(slug in market.outcomes)) continue;
        mutate((s) => {
          const m = s.markets[market.id];
          m.status = "settled";
          m.winningOutcome = slug;
          m.settledAt = Date.now();
        }, "settled", { marketId: market.id, winning: slug }, { durable: true });
        settledIds.push(market.id);
        markSettle();
      }
    }
  }

  const receipt: SettlementReceipt = {
    fixtureId,
    marketIds: settledIds,
    seq,
    homeScore: canonicalHome,
    awayScore: canonicalAway,
    validatedAt: Date.now(),
    validationOk: true,
    onchainProofVerified,
    mode: onchainEnabled ? "onchain" : "ledger",
    settleTxSig,
    merkle,
    proofSummary: proofSummaryLine(merkle, seq),
    rawValidation: validation,
  };

  mutate((s) => {
    s.receipts[fixtureId] = receipt;
  }, "receipt", receipt, { durable: true });

  return { status: "settled", receipt };
}

export async function runKeeperPass() {
  if (keeperPassInFlight) {
    getLogger().warn("keeper pass skipped — previous pass still running");
    return;
  }
  keeperPassInFlight = true;
  try {
    const state = getState();
    // Only touch fixtures that still have settleable markets. Sweeping every
    // finished World Cup score against public Solana RPC rate-limits create_market
    // / deposit prepare for live bettors.
    const pendingFixtureIds = new Set<string>();
    for (const market of Object.values(state.markets)) {
      if (
        (market.status === "open" || market.status === "locked") &&
        market.marketType !== "tournament_winner"
      ) {
        pendingFixtureIds.add(market.fixtureId);
      }
    }

    for (const fixtureId of pendingFixtureIds) {
      const live = state.live[fixtureId];
      if (
        live &&
        (live.status === "finished" ||
          isFinalScoreRecord({
            action: live.action,
            statusId: live.statusId,
            period: live.period,
          }))
      ) {
        await maybeSettleFixture(fixtureId, live.homeScore, live.awayScore);
        continue;
      }

      const fixture = state.fixtures[fixtureId];
      if (
        (fixture?.status === "finished" ||
          fixture?.status === "cancelled" ||
          fixture?.status === "postponed") &&
        (fixture.score ||
          fixture.status === "cancelled" ||
          fixture.status === "postponed")
      ) {
        await maybeSettleFixture(
          fixtureId,
          fixture.score?.home ?? 0,
          fixture.score?.away ?? 0
        );
      }
    }
  } finally {
    keeperPassInFlight = false;
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
