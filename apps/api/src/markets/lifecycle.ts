import type { Fixture, MarketPool } from "@whistle/shared";
import type { AppState } from "../store";

export type MarketReconcileOptions = {
  now?: number;
  /** True only while the active fixture source is TxLINE and validation is reachable. */
  resultVerificationAvailable: boolean;
  /** Keep funded pools locked until their on-chain state can be changed first. */
  deferStakedVoids?: boolean;
};

export type MarketReconcileSummary = {
  deleted: number;
  voided: number;
  locked: number;
  preservedWithStake: number;
};

function normalizedLine(market: Pick<MarketPool, "marketType" | "line">): string {
  if (market.marketType === "total_goals") return String(market.line ?? 2.5);
  if (market.marketType === "total_corners") return String(market.line ?? 9.5);
  return "";
}

export function marketIdentityKey(
  market: Pick<MarketPool, "fixtureId" | "marketType" | "line" | "squadId">
): string {
  return [
    market.fixtureId,
    market.marketType,
    normalizedLine(market),
    market.squadId || "public",
  ].join("\u0000");
}

export function isFixtureStakeable(fixture: Fixture | undefined, now = Date.now()): boolean {
  return Boolean(
    fixture &&
      fixture.status === "scheduled" &&
      Number.isFinite(fixture.kickoffTs) &&
      fixture.kickoffTs > now
  );
}

function stakeIndex(state: AppState): Set<string> {
  const ids = new Set<string>();
  for (const position of Object.values(state.positions)) {
    ids.add(position.marketId);
  }
  for (const market of Object.values(state.markets)) {
    if (
      market.totalPool > 0 ||
      Object.values(market.outcomes).some((amount) => amount > 0)
    ) {
      ids.add(market.id);
    }
  }
  return ids;
}

function statusRank(market: MarketPool): number {
  return market.status === "settled"
    ? 5
    : market.status === "open"
      ? 4
    : market.status === "locked"
      ? 3
      : 1;
}

function deleteMarket(state: AppState, marketId: string) {
  delete state.markets[marketId];
  delete state.priceHistory[marketId];
}

function voidActiveMarket(market: MarketPool, now: number): boolean {
  if (market.status !== "open" && market.status !== "locked") return false;
  market.status = "void";
  market.settledAt = now;
  return true;
}

function lockOpenMarket(market: MarketPool): boolean {
  if (market.status !== "open") return false;
  market.status = "locked";
  return true;
}

/**
 * Repairs legacy state without ever deleting a market that has liquidity or a position.
 * The function mutates the provided state so it can be persisted in one atomic write.
 */
export function reconcileStateMarkets(
  state: AppState,
  options: MarketReconcileOptions
): MarketReconcileSummary {
  const now = options.now ?? Date.now();
  const summary: MarketReconcileSummary = {
    deleted: 0,
    voided: 0,
    locked: 0,
    preservedWithStake: 0,
  };
  const stakedIds = stakeIndex(state);
  const groups = new Map<string, MarketPool[]>();

  for (const market of Object.values(state.markets)) {
    const key = marketIdentityKey(market);
    const list = groups.get(key) || [];
    list.push(market);
    groups.set(key, list);
  }

  for (const markets of groups.values()) {
    const fixture = state.fixtures[markets[0].fixtureId];
    const stakeable = isFixtureStakeable(fixture, now);

    if (stakeable) {
      // Keep exactly one canonical identity. A staked market always outranks an empty one.
      const canonical = [...markets].sort((a, b) => {
        const stakeDiff = Number(stakedIds.has(b.id)) - Number(stakedIds.has(a.id));
        if (stakeDiff) return stakeDiff;
        const stateDiff = statusRank(b) - statusRank(a);
        if (stateDiff) return stateDiff;
        const poolDiff = b.totalPool - a.totalPool;
        return poolDiff || a.createdAt - b.createdAt;
      })[0];

      for (const market of markets) {
        const hasStake = stakedIds.has(market.id);
        if (market.id === canonical.id) {
          if (hasStake) summary.preservedWithStake += 1;
          continue;
        }
        if (hasStake) {
          summary.preservedWithStake += 1;
          if (options.deferStakedVoids) {
            if (lockOpenMarket(market)) summary.locked += 1;
          } else if (voidActiveMarket(market, now)) {
            summary.voided += 1;
          }
        } else {
          deleteMarket(state, market.id);
          summary.deleted += 1;
        }
      }
      continue;
    }

    for (const market of markets) {
      const hasStake = stakedIds.has(market.id);
      if (!hasStake) {
        deleteMarket(state, market.id);
        summary.deleted += 1;
        continue;
      }

      summary.preservedWithStake += 1;
      if (market.status === "settled" || market.status === "void") continue;

      const canAwaitVerifiedResult =
        fixture &&
        (fixture.status === "live" || fixture.status === "finished") &&
        options.resultVerificationAvailable;
      const reachedCutoff =
        fixture &&
        (fixture.status === "live" ||
          (fixture.status === "scheduled" && fixture.kickoffTs <= now));

      if (canAwaitVerifiedResult || reachedCutoff) {
        if (lockOpenMarket(market)) summary.locked += 1;
      } else if (options.deferStakedVoids) {
        if (lockOpenMarket(market)) summary.locked += 1;
      } else if (voidActiveMarket(market, now)) {
        // Orphaned, cancelled, postponed, unknown, or non-TxLINE finished markets refund.
        summary.voided += 1;
      }
    }
  }

  return summary;
}

/** Lock all open markets at kickoff even if a live provider update is late. */
export function enforceStateMarketCutoffs(state: AppState, now = Date.now()): number {
  let locked = 0;
  for (const market of Object.values(state.markets)) {
    if (market.status !== "open") continue;
    const fixture = state.fixtures[market.fixtureId];
    if (
      fixture &&
      (fixture.status === "live" ||
        fixture.status === "finished" ||
        (fixture.status === "scheduled" && fixture.kickoffTs <= now))
    ) {
      market.status = "locked";
      locked += 1;
    }
  }
  return locked;
}
