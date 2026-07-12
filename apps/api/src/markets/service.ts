import { randomUUID } from "crypto";
import {
  CreateMarketRequest,
  DepositRequest,
  MarketOutcome,
  MarketPool,
  MarketType,
  Position,
  Squad,
  impliedShares,
  payoutForPosition,
  resolveMatchResult,
  resolveTotals,
} from "@whistle/shared";
import { getState, mutate, pushNotification } from "../store";

function defaultOutcomes(marketType: MarketType): Record<string, number> {
  if (marketType === "match_result") return { home: 0, draw: 0, away: 0 };
  return { over: 0, under: 0 };
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
  opts?: { forcePublic?: boolean }
): MarketPool {
  const line = req.marketType === "total_goals" ? req.line ?? 2.5 : undefined;
  const existing = Object.values(getState().markets).find(
    (m) =>
      m.fixtureId === req.fixtureId &&
      m.marketType === req.marketType &&
      m.line === line &&
      (m.squadId || undefined) === (req.squadId || undefined) &&
      m.status === "open"
  );
  if (existing) return existing;

  const market: MarketPool = {
    id: randomUUID(),
    fixtureId: req.fixtureId,
    marketType: req.marketType,
    line,
    status: "open",
    outcomes: defaultOutcomes(req.marketType),
    totalPool: 0,
    createdAt: Date.now(),
    squadId: opts?.forcePublic ? undefined : req.squadId,
  };
  mutate((s) => {
    s.markets[market.id] = market;
  }, "market", market);
  return market;
}

export function deposit(req: DepositRequest): { market: MarketPool; position: Position } {
  if (req.amount <= 0) throw new Error("amount must be positive");
  const state = getState();
  const market = state.markets[req.marketId];
  if (!market) throw new Error("market not found");
  if (market.status !== "open") throw new Error("market not open");
  if (!(req.outcome in market.outcomes)) throw new Error("invalid outcome");

  const position: Position = {
    id: randomUUID(),
    marketId: market.id,
    owner: req.owner,
    outcome: req.outcome,
    amount: req.amount,
    claimed: false,
    createdAt: Date.now(),
  };

  mutate((s) => {
    const m = s.markets[req.marketId];
    m.outcomes[req.outcome] = (m.outcomes[req.outcome] || 0) + req.amount;
    m.totalPool += req.amount;
    s.positions[position.id] = position;
  }, "deposit", { marketId: market.id, position });

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
  if (market.status === "settled") return market;

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
  }, "settled", { marketId, winning });

  pushNotification(
    "settled",
    `Market settled — ${winning.toUpperCase()} wins (pool $${market.totalPool.toFixed(2)})`,
    marketId
  );

  return getState().markets[marketId];
}

export function claimPosition(positionId: string, owner: string) {
  const state = getState();
  const position = state.positions[positionId];
  if (!position) throw new Error("position not found");
  if (position.owner !== owner) throw new Error("not your position");
  if (position.claimed) throw new Error("already claimed");
  const market = state.markets[position.marketId];
  if (!market || market.status !== "settled") throw new Error("market not settled");
  if (!market.winningOutcome) throw new Error("no winning outcome");

  const won = position.outcome === market.winningOutcome;
  const payout = won
    ? payoutForPosition(
        position.amount,
        market.outcomes[market.winningOutcome] || 0,
        market.totalPool
      )
    : 0;

  mutate((s) => {
    s.positions[positionId].claimed = true;
  }, "claim", { positionId, payout });

  return { position: getState().positions[positionId], payout, won };
}

export function createSquad(name: string, creator: string): Squad {
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  const squad: Squad = {
    id: randomUUID(),
    name,
    inviteCode,
    createdAt: Date.now(),
    members: [creator],
  };
  mutate((s) => {
    s.squads[squad.id] = squad;
  }, "squad", squad);
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
  }, "squad", squad);
  return getState().squads[squad.id];
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
    .map((p) => ({
      ...p,
      market: state.markets[p.marketId],
    }));
}
