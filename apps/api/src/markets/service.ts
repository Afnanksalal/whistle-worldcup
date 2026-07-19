import { createHash, randomBytes, randomUUID } from "crypto";
import {
  CreateMarketRequest,
  DepositRequest,
  MarketOutcome,
  MarketPool,
  MarketType,
  Position,
  Squad,
  baseUnitsToAmount,
  impliedShares,
  isKnockoutMatchResult,
  payoutBaseUnits,
  payoutForPosition,
  resolveCorners,
  resolveFirstScorer,
  resolveMatchResult,
  resolveTotals,
  teamOutcomeSlug,
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
import {
  settleMarketOnchain,
  voidMarketOnchain,
  type SettleOnchainProof,
} from "../settlement/onchain";

function defaultOutcomes(
  marketType: MarketType,
  teams?: string[],
  opts?: { knockout?: boolean }
): Record<string, number> {
  if (marketType === "match_result") {
    // FIFA knockout ties always produce a winner (ET / pens). No draw leg.
    return opts?.knockout ? { home: 0, away: 0 } : { home: 0, draw: 0, away: 0 };
  }
  if (marketType === "first_scorer") return { home: 0, away: 0, none: 0 };
  if (marketType === "tournament_winner") {
    const outcomes: Record<string, number> = {};
    for (const name of teams || []) {
      outcomes[teamOutcomeSlug(name)] = 0;
    }
    return outcomes;
  }
  return { over: 0, under: 0 };
}

function syncMatchResultOutcomes(market: MarketPool, knockout: boolean): MarketPool {
  if (market.marketType !== "match_result") return market;
  const wantsDraw = !knockout;
  const hasDraw = "draw" in market.outcomes;
  if (wantsDraw === hasDraw) return market;

  // Only reshape empty markets so live stakes are never rewritten.
  if (market.totalPool > 0 || Object.values(market.outcomes).some((v) => v > 0)) {
    return market;
  }

  const nextOutcomes: Record<string, number> = wantsDraw
    ? { home: market.outcomes.home || 0, draw: 0, away: market.outcomes.away || 0 }
    : { home: market.outcomes.home || 0, away: market.outcomes.away || 0 };

  mutate((s) => {
    s.markets[market.id].outcomes = nextOutcomes;
  }, "market", { id: market.id, outcomes: nextOutcomes }, { durable: true });
  return getState().markets[market.id];
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

  const needsLine =
    req.marketType === "total_goals" || req.marketType === "total_corners";
  const defaultLine = req.marketType === "total_corners" ? 9.5 : 2.5;
  const line = needsLine
    ? Math.round((req.line ?? defaultLine) * 100) / 100
    : undefined;
  if (
    needsLine &&
    (!Number.isFinite(line) || line! <= 0 || !Number.isInteger(line! * 2))
  ) {
    throw new Error("line must be a positive half-unit line");
  }

  const squadId = opts?.forcePublic ? undefined : req.squadId;
  const identity = marketIdentityKey({
    fixtureId: req.fixtureId,
    marketType: req.marketType,
    line,
    squadId,
  });
  const knockout =
    req.marketType === "match_result" ? isKnockoutMatchResult(fixture) : false;

  const existing = Object.values(state.markets).find(
    (market) => marketIdentityKey(market) === identity
  );
  if (existing) {
    return req.marketType === "match_result"
      ? syncMatchResultOutcomes(existing, knockout)
      : existing;
  }

  const market: MarketPool = {
    id: stableMarketId(identity),
    fixtureId: req.fixtureId,
    marketType: req.marketType,
    line,
    status: "open",
    outcomes: defaultOutcomes(req.marketType, undefined, { knockout }),
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
  if (
    market.marketType === "match_result" &&
    req.outcome === "draw" &&
    fixture &&
    isKnockoutMatchResult(fixture)
  ) {
    throw new Error("knockout markets have no draw — pick a side to advance");
  }

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

export type SettleContext = {
  firstTeam?: "home" | "away" | null;
  homeCorners?: number;
  awayCorners?: number;
  winningOutcome?: MarketOutcome;
  /** Knockout advancer after ET/pens when regulation is level. */
  advancingSide?: "home" | "away" | null;
  /** Required for on-chain settle of match_result / total_goals (validate_stat_v2). */
  onchainProof?: SettleOnchainProof;
};

export function settleMarketOffchain(
  marketId: string,
  homeScore: number,
  awayScore: number,
  settleTxSig?: string,
  ctx: SettleContext = {}
) {
  const market = getState().markets[marketId];
  if (!market) throw new Error("market not found");
  if (market.status === "settled" || market.status === "void") return market;
  if (market.status !== "open" && market.status !== "locked") {
    throw new Error(`cannot settle market in status ${market.status}`);
  }

  let winning: MarketOutcome;
  if (ctx.winningOutcome) {
    winning = ctx.winningOutcome;
  } else if (market.marketType === "match_result") {
    const fixture = getState().fixtures[market.fixtureId];
    const knockout = fixture ? isKnockoutMatchResult(fixture) : !("draw" in market.outcomes);
    if (knockout && homeScore === awayScore) {
      if (ctx.advancingSide === "home" || ctx.advancingSide === "away") {
        winning = ctx.advancingSide;
      } else {
        throw new Error(
          "knockout match is level after regulation; needs an advancing side (ET/pens)"
        );
      }
    } else {
      winning = resolveMatchResult(homeScore, awayScore);
    }
    if (winning === "draw" && !("draw" in market.outcomes)) {
      throw new Error(
        "knockout match-result market has no draw outcome; needs an advancing side"
      );
    }
  } else if (market.marketType === "first_scorer") {
    winning = resolveFirstScorer(homeScore, awayScore, ctx.firstTeam);
  } else if (market.marketType === "total_corners") {
    const homeCorners = ctx.homeCorners ?? 0;
    const awayCorners = ctx.awayCorners ?? 0;
    winning = resolveCorners(homeCorners, awayCorners, market.line ?? 9.5);
  } else if (market.marketType === "tournament_winner") {
    throw new Error("tournament_winner requires an explicit winningOutcome");
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
  onchainEnabled: boolean,
  ctx: SettleContext = {}
) {
  const market = getState().markets[marketId];
  if (!market) throw new Error("market not found");
  const fixture = getState().fixtures[market.fixtureId];
  const knockout =
    market.marketType === "match_result" &&
    (fixture ? isKnockoutMatchResult(fixture) : !("draw" in market.outcomes));

  // On-chain settle maps equal scores to draw — void instead for 2-way knockout markets.
  if (
    knockout &&
    homeScore === awayScore &&
    !(ctx.advancingSide === "home" || ctx.advancingSide === "away" || ctx.winningOutcome)
  ) {
    if (onchainEnabled && market.totalPool > 0) {
      await voidMarketOnchain(market);
    }
    return voidMarket(marketId, "knockout level after regulation without advancing side");
  }

  let signature: string | undefined;
  // Only market types whose winning outcome is fully determined by TxLINE
  // home/away goal stats can hard-settle on-chain with validate_stat_v2.
  const onchainProvable =
    market.marketType === "match_result" || market.marketType === "total_goals";
  if (onchainEnabled && market.totalPool > 0 && onchainProvable) {
    // When a knockout is settled via advancingSide after a level score, keep
    // ledger settlement only — on-chain program cannot encode "advancer".
    const skipOnchain =
      knockout &&
      homeScore === awayScore &&
      (ctx.advancingSide === "home" || ctx.advancingSide === "away");
    if (!skipOnchain) {
      if (!ctx.onchainProof?.proofIxData?.length) {
        throw new Error("on-chain settle requires validate_stat_v2 proof");
      }
      signature = (
        await settleMarketOnchain(market, homeScore, awayScore, ctx.onchainProof)
      ).signature;
    }
  } else if (
    onchainEnabled &&
    market.totalPool > 0 &&
    market.marketType === "total_corners"
  ) {
    // Corner counts are not covered by soccer goal-stat Merkle proofs.
    throw new Error(
      "on-chain total_corners settle requires corner-stat proofs (not yet available)"
    );
  }
  return settleMarketOffchain(marketId, homeScore, awayScore, signature, ctx);
}

/** Create or refresh the global World Cup tournament-winner market. */
export function ensureTournamentWinnerMarket(opts?: { durable?: boolean }): MarketPool | null {
  const teams = new Set<string>();
  for (const fixture of Object.values(getState().fixtures)) {
    const competition = (fixture.competition || "").toLowerCase();
    if (!competition.includes("world cup")) continue;
    if (fixture.home?.name) teams.add(fixture.home.name);
    if (fixture.away?.name) teams.add(fixture.away.name);
  }
  if (teams.size < 2) return null;

  const existing = Object.values(getState().markets).find(
    (market) => market.marketType === "tournament_winner" && !market.squadId
  );
  const outcomes = defaultOutcomes("tournament_winner", [...teams]);
  if (existing) {
    mutate((s) => {
      const market = s.markets[existing.id];
      for (const key of Object.keys(outcomes)) {
        if (!(key in market.outcomes)) market.outcomes[key] = 0;
      }
    }, "market", existing, { durable: opts?.durable !== false });
    return getState().markets[existing.id];
  }

  const identity = marketIdentityKey({
    fixtureId: "tournament-world-cup-2026",
    marketType: "tournament_winner",
    squadId: undefined,
  });
  const market: MarketPool = {
    id: stableMarketId(identity),
    fixtureId: "tournament-world-cup-2026",
    marketType: "tournament_winner",
    status: "open",
    outcomes,
    totalPool: 0,
    createdAt: Date.now(),
  };
  mutate((s) => {
    s.markets[market.id] = market;
  }, "market", market, { durable: opts?.durable !== false });
  recordMarketPrice(market.id);
  return market;
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

function settledClaimAmounts(
  position: Position,
  market: MarketPool,
  feeBps: number
) {
  const won = position.outcome === market.winningOutcome;
  const grossBase = won
    ? payoutBaseUnits(
        position.amount,
        market.outcomes[market.winningOutcome!] || 0,
        market.totalPool
      )
    : 0n;
  // Match on-chain integer fee math: fee = floor(gross_base * bps / 10_000).
  const feeBase =
    feeBps > 0 && grossBase > 0n ? (grossBase * BigInt(feeBps)) / 10_000n : 0n;
  return {
    won,
    grossPayout: baseUnitsToAmount(grossBase),
    fee: baseUnitsToAmount(feeBase),
    payout: baseUnitsToAmount(grossBase - feeBase),
  };
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
  const market = state.markets[position.marketId];
  if (!market) throw new Error("market not found");

  if (market.status === "void") {
    const payout = position.amount;
    if (!position.claimed) {
      mutate((s) => {
        s.positions[positionId].claimed = true;
        s.positions[positionId].claimTxSignature =
          txSignature || s.positions[positionId].claimTxSignature;
      }, "claim", { positionId, payout, refund: true }, { durable: true });
    }
    return {
      position: getState().positions[positionId],
      payout,
      won: false,
      refund: true,
    };
  }

  if (market.status !== "settled") throw new Error("market not settled");
  if (!market.winningOutcome) throw new Error("no winning outcome");

  const { won, grossPayout, fee, payout } = settledClaimAmounts(
    position,
    market,
    feeBps
  );

  if (!position.claimed) {
    mutate((s) => {
      s.positions[positionId].claimed = true;
      s.positions[positionId].claimTxSignature =
        txSignature || s.positions[positionId].claimTxSignature;
    }, "claim", { positionId, payout, grossPayout, fee }, { durable: true });
  }

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
    (s) => (s.inviteCode || "").toLowerCase() === inviteCode.toLowerCase()
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
