import { createHash, randomBytes, randomUUID } from "crypto";
import {
  CreateMarketRequest,
  DepositRequest,
  MarketOutcome,
  MarketPool,
  MarketType,
  Position,
  Squad,
  amountToBaseUnits,
  impliedShares,
  payoutForPosition,
  resolveMatchResult,
  resolveTotals,
} from "@whistle/shared";
import { getState, mutate } from "../store";
import { recordMarketPrice } from "./prices";
import {
  enforceStateMarketCutoffs,
  isFixtureStakeable,
  marketIdentityKey,
  reconcileStateMarkets,
  type MarketReconcileOptions,
} from "./lifecycle";
import { settleMarketOnchain, voidMarketOnchain } from "../settlement/onchain";

function defaultOutcomes(marketType: MarketType): Record<string, number> {
  if (marketType === "match_result") return { home: 0, draw: 0, away: 0 };
  return { over: 0, under: 0 };
}

function stableMarketId(identity: string): string {
  const hex = createHash("sha256").update(identity).digest("hex");
  return `market-${hex.slice(0, 32)}`;
}

export function listMarkets(fixtureId?: string, squadId?: string): MarketPool[] {
  return Object.values(getState().markets).filter((m) => {
    if (fixtureId && m.fixtureId !== fixtureId) return false;
    if (squadId) return m.squadId === squadId;
    return !m.squadId; // public by default
  });
}

export function ensureMarket(
  req: CreateMarketRequest,
  opts?: { forcePublic?: boolean; durable?: boolean }
): MarketPool {
  const state = getState();
  const fixture = state.fixtures[req.fixtureId];
  if (!fixture) throw new Error("fixture not found");
  if (!isFixtureStakeable(fixture)) {
    throw new Error("markets can only be created before kickoff for scheduled fixtures");
  }

  const line =
    req.marketType === "total_goals"
      ? Math.round((req.line ?? 2.5) * 100) / 100
      : undefined;
  if (
    req.marketType === "total_goals" &&
    (!Number.isFinite(line) || line! <= 0 || !Number.isInteger(line! * 2))
  ) {
    throw new Error("total-goals line must be a positive half-goal line");
  }

  const squadId = opts?.forcePublic ? undefined : req.squadId;
  const identity = marketIdentityKey({
    fixtureId: req.fixtureId,
    marketType: req.marketType,
    line,
    squadId,
  });
  const existing = Object.values(state.markets).find(
    (market) => marketIdentityKey(market) === identity
  );
  if (existing) return existing;

  const market: MarketPool = {
    id: stableMarketId(identity),
    fixtureId: req.fixtureId,
    marketType: req.marketType,
    line,
    status: "open",
    outcomes: defaultOutcomes(req.marketType),
    totalPool: 0,
    createdAt: Date.now(),
    squadId,
  };
  mutate((s) => {
    s.markets[market.id] = market;
  }, "market", market, { durable: opts?.durable !== false });
  recordMarketPrice(market.id);

  return market;
}

export function deposit(req: DepositRequest): { market: MarketPool; position: Position } {
  if (req.amount <= 0) throw new Error("amount must be positive");
  const state = getState();
  const market = state.markets[req.marketId];
  if (!market) throw new Error("market not found");
  if (market.status !== "open") throw new Error("market not open");
  const fixture = state.fixtures[market.fixtureId];
  if (!isFixtureStakeable(fixture)) {
    throw new Error("market closed at kickoff");
  }
  if (!(req.outcome in market.outcomes)) throw new Error("invalid outcome");

  if (req.txSignature) {
    const replay = Object.values(state.positions).find((candidate) =>
      candidate.deposits?.some((entry) => entry.txSignature === req.txSignature) ||
      (!candidate.claimed && candidate.txSignature === req.txSignature)
    );
    if (replay) {
      const entry = replay.deposits?.find(
        (candidate) => candidate.txSignature === req.txSignature
      ) || { txSignature: replay.txSignature!, amount: replay.amount };
      if (
        replay.marketId !== market.id ||
        replay.owner !== req.owner ||
        replay.outcome !== req.outcome ||
        entry.amount !== req.amount
      ) {
        throw new Error("deposit transaction was already recorded with different details");
      }
      return { market: getState().markets[market.id], position: replay };
    }

    const existing = Object.values(state.positions).find(
      (candidate) =>
        candidate.marketId === market.id &&
        candidate.owner === req.owner &&
        !candidate.claimed &&
        Boolean(candidate.deposits?.length || candidate.txSignature)
    );
    if (existing) {
      if (existing.outcome !== req.outcome) {
        throw new Error("an on-chain position cannot switch outcomes after its first stake");
      }
      mutate((next) => {
        const nextMarket = next.markets[req.marketId];
        nextMarket.outcomes[req.outcome] += req.amount;
        nextMarket.totalPool += req.amount;
        const nextPosition = next.positions[existing.id];
        const previousDeposits = nextPosition.deposits ||
          (nextPosition.txSignature
            ? [{ txSignature: nextPosition.txSignature, amount: nextPosition.amount }]
            : []);
        nextPosition.amount += req.amount;
        nextPosition.deposits = [
          ...previousDeposits,
          { txSignature: req.txSignature!, amount: req.amount },
        ];
        delete nextPosition.txSignature;
      }, "deposit", { marketId: market.id, positionId: existing.id }, { durable: true });
      recordMarketPrice(req.marketId);
      return {
        market: getState().markets[req.marketId],
        position: getState().positions[existing.id],
      };
    }
  }

  const position: Position = {
    id: randomUUID(),
    marketId: market.id,
    owner: req.owner,
    outcome: req.outcome,
    amount: req.amount,
    claimed: false,
    deposits: req.txSignature
      ? [{ txSignature: req.txSignature, amount: req.amount }]
      : undefined,
    createdAt: Date.now(),
  };

  mutate((s) => {
    const m = s.markets[req.marketId];
    m.outcomes[req.outcome] = (m.outcomes[req.outcome] || 0) + req.amount;
    m.totalPool += req.amount;
    s.positions[position.id] = position;
  }, "deposit", { marketId: market.id, position }, { durable: true });

  recordMarketPrice(req.marketId);

  return { market: getState().markets[req.marketId], position };
}

export function marketImplied(marketId: string) {
  const market = getState().markets[marketId];
  if (!market) throw new Error("market not found");
  return { market, implied: impliedShares(market.outcomes) };
}

export function settleMarketOffchain(
  marketId: string,
  homeScore: number,
  awayScore: number,
  settleTxSig?: string
) {
  const market = getState().markets[marketId];
  if (!market) throw new Error("market not found");
  if (market.status === "settled" || market.status === "void") return market;
  if (market.status !== "open" && market.status !== "locked") {
    throw new Error(`cannot settle market in status ${market.status}`);
  }

  let winning: MarketOutcome;
  if (market.marketType === "match_result") {
    winning = resolveMatchResult(homeScore, awayScore);
  } else {
    winning = resolveTotals(homeScore, awayScore, market.line ?? 2.5);
  }

  mutate((s) => {
    const m = s.markets[marketId];
    m.status = "settled";
    m.winningOutcome = winning;
    m.settledAt = Date.now();
    m.settleTxSig = settleTxSig;
  }, "settled", { marketId, winning }, { durable: true });

  return getState().markets[marketId];
}

export async function settleMarketVerified(
  marketId: string,
  homeScore: number,
  awayScore: number,
  onchainEnabled: boolean
) {
  const market = getState().markets[marketId];
  if (!market) throw new Error("market not found");
  let signature: string | undefined;
  if (onchainEnabled && market.totalPool > 0) {
    signature = (await settleMarketOnchain(market, homeScore, awayScore)).signature;
  }
  return settleMarketOffchain(marketId, homeScore, awayScore, signature);
}

export function voidMarket(marketId: string, reason = "match abandoned") {
  const market = getState().markets[marketId];
  if (!market) throw new Error("market not found");
  if (market.status === "settled" || market.status === "void") return market;

  mutate((s) => {
    const m = s.markets[marketId];
    m.status = "void";
    m.settledAt = Date.now();
  }, "void", { marketId, reason }, { durable: true });

  return getState().markets[marketId];
}

export async function voidMarketWithRail(
  marketId: string,
  reason: string,
  onchainEnabled: boolean
) {
  const market = getState().markets[marketId];
  if (!market) throw new Error("market not found");
  if (onchainEnabled && market.totalPool > 0) {
    await voidMarketOnchain(market);
  }
  return voidMarket(marketId, reason);
}

export function voidMarketsForFixture(fixtureId: string, reason?: string) {
  const marketIds = Object.values(getState().markets)
    .filter(
    (m) =>
      m.fixtureId === fixtureId && (m.status === "open" || m.status === "locked")
    )
    .map((market) => market.id);
  if (!marketIds.length) return [];

  const settledAt = Date.now();
  mutate(
    (s) => {
      for (const marketId of marketIds) {
        const market = s.markets[marketId];
        if (!market || (market.status !== "open" && market.status !== "locked")) continue;
        market.status = "void";
        market.settledAt = settledAt;
      }
    },
    "fixture_markets_voided",
    { fixtureId, marketIds, reason: reason || "match abandoned" },
    { durable: true }
  );
  return marketIds.map((marketId) => getState().markets[marketId]).filter(Boolean);
}

export async function voidMarketsForFixtureWithRail(
  fixtureId: string,
  reason: string,
  onchainEnabled: boolean
) {
  const markets = Object.values(getState().markets).filter(
    (market) =>
      market.fixtureId === fixtureId &&
      (market.status === "open" || market.status === "locked")
  );
  if (onchainEnabled) {
    for (const market of markets) {
      if (market.totalPool > 0) await voidMarketOnchain(market);
    }
  }
  return voidMarketsForFixture(fixtureId, reason);
}

export function lockMarket(marketId: string) {
  const market = getState().markets[marketId];
  if (!market) throw new Error("market not found");
  if (market.status !== "open") return market;
  mutate((s) => {
    s.markets[marketId].status = "locked";
  }, "locked", { marketId }, { durable: true });
  return getState().markets[marketId];
}

export function claimPosition(
  positionId: string,
  owner: string,
  txSignature?: string,
  feeBps = 0
) {
  const state = getState();
  const position = state.positions[positionId];
  if (!position) throw new Error("position not found");
  if (position.owner !== owner) throw new Error("not your position");
  if (position.claimed) throw new Error("already claimed");
  const market = state.markets[position.marketId];
  if (!market) throw new Error("market not found");

  if (market.status === "void") {
    const payout = position.amount;
    mutate((s) => {
      s.positions[positionId].claimed = true;
      s.positions[positionId].claimTxSignature = txSignature;
    }, "claim", { positionId, payout, refund: true }, { durable: true });
    return { position: getState().positions[positionId], payout, won: false, refund: true };
  }

  if (market.status !== "settled") throw new Error("market not settled");
  if (!market.winningOutcome) throw new Error("no winning outcome");

  const won = position.outcome === market.winningOutcome;
  const grossPayout = won
    ? payoutForPosition(
        position.amount,
        market.outcomes[market.winningOutcome] || 0,
        market.totalPool
      )
    : 0;
  // Match on-chain integer fee math: fee = floor(gross_base * bps / 10_000).
  const fee =
    feeBps > 0 && grossPayout > 0
      ? Number((amountToBaseUnits(grossPayout) * BigInt(feeBps)) / 10_000n) /
        1_000_000
      : 0;
  const payout = grossPayout - fee;

  mutate((s) => {
    s.positions[positionId].claimed = true;
    s.positions[positionId].claimTxSignature = txSignature;
  }, "claim", { positionId, payout, grossPayout, fee }, { durable: true });

  return {
    position: getState().positions[positionId],
    payout,
    grossPayout,
    fee,
    won,
    refund: false,
  };
}

export function createSquad(name: string, creator: string): Squad {
  const inviteCode = randomBytes(4).toString("hex").toUpperCase();
  const squad: Squad = {
    id: randomUUID(),
    name,
    inviteCode,
    createdAt: Date.now(),
    members: [creator],
  };
  mutate((s) => {
    s.squads[squad.id] = squad;
  }, "squad", squad, { durable: true });
  return squad;
}

export function joinSquad(inviteCode: string, member: string): Squad {
  const squad = Object.values(getState().squads).find(
    (s) => s.inviteCode.toLowerCase() === inviteCode.toLowerCase()
  );
  if (!squad) throw new Error("squad not found");
  mutate((s) => {
    const sq = s.squads[squad.id];
    if (!sq.members.includes(member)) sq.members.push(member);
  }, "squad", squad, { durable: true });
  return getState().squads[squad.id];
}

export function reconcileMarkets(options: MarketReconcileOptions) {
  let summary = reconcileStateMarkets(structuredClone(getState()), options);
  if (!summary.deleted && !summary.voided && !summary.locked) return summary;

  mutate(
    (s) => {
      summary = reconcileStateMarkets(s, options);
    },
    "markets_reconciled",
    { reason: "lifecycle safety reconciliation" },
    { durable: true }
  );
  return summary;
}

export function enforceMarketCutoffs(now = Date.now()): number {
  let locked = 0;
  const state = getState();
  const shouldLock = Object.values(state.markets).some((market) => {
    if (market.status !== "open") return false;
    const fixture = state.fixtures[market.fixtureId];
    return Boolean(
      fixture &&
        (fixture.status === "live" ||
          fixture.status === "finished" ||
          (fixture.status === "scheduled" && fixture.kickoffTs <= now))
    );
  });
  if (!shouldLock) return 0;

  mutate(
    (s) => {
      locked = enforceStateMarketCutoffs(s, now);
    },
    "markets_locked",
    { reason: "kickoff cutoff" },
    { durable: true }
  );
  return locked;
}

export function squadLeaderboard(squadId: string) {
  const state = getState();
  const squad = state.squads[squadId];
  if (!squad) throw new Error("squad not found");
  const marketIds = new Set(
    Object.values(state.markets)
      .filter((m) => m.squadId === squadId)
      .map((m) => m.id)
  );
  const scores: Record<string, { staked: number; won: number; pnl: number }> = {};
  for (const m of squad.members) {
    scores[m] = { staked: 0, won: 0, pnl: 0 };
  }
  for (const p of Object.values(state.positions)) {
    if (!marketIds.has(p.marketId)) continue;
    if (!scores[p.owner]) scores[p.owner] = { staked: 0, won: 0, pnl: 0 };
    scores[p.owner].staked += p.amount;
    const market = state.markets[p.marketId];
    if (market?.status === "settled" && market.winningOutcome) {
      if (p.outcome === market.winningOutcome) {
        const payout = payoutForPosition(
          p.amount,
          market.outcomes[market.winningOutcome] || 0,
          market.totalPool
        );
        scores[p.owner].won += payout;
        scores[p.owner].pnl += payout - p.amount;
      } else {
        scores[p.owner].pnl -= p.amount;
      }
    }
  }
  return Object.entries(scores)
    .map(([owner, stats]) => ({ owner, ...stats }))
    .sort((a, b) => b.pnl - a.pnl);
}

export function positionsForOwner(owner: string) {
  const state = getState();
  return Object.values(state.positions)
    .filter((p) => p.owner === owner)
    .map((p) => {
      const market = state.markets[p.marketId];
      const fixture = market ? state.fixtures[market.fixtureId] : undefined;
      return {
        ...p,
        market,
        fixture,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}
