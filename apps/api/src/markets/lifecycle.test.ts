import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Fixture, MarketPool, Position } from "@whistle/shared";
import type { AppState } from "../store";
import {
  isFixtureStakeable,
  reconcileStateMarkets,
} from "./lifecycle";

const NOW = 1_800_000_000_000;

function emptyState(): AppState {
  return {
    fixtures: {},
    live: {},
    odds: {},
    markets: {},
    positions: {},
    squads: {},
    priceHistory: {},
    matchStats: {},
    insights: {},
    notifications: [],
  };
}

function fixture(id: string, status: Fixture["status"], kickoffTs: number): Fixture {
  return {
    id,
    status,
    kickoffTs,
    home: { name: "Home" },
    away: { name: "Away" },
  };
}

function market(id: string, fixtureId: string, totalPool = 0): MarketPool {
  return {
    id,
    fixtureId,
    marketType: "match_result",
    status: "open",
    outcomes: { home: totalPool, draw: 0, away: 0 },
    totalPool,
    createdAt: NOW,
  };
}

function position(id: string, marketId: string, amount: number): Position {
  return {
    id,
    marketId,
    owner: "11111111111111111111111111111111",
    outcome: "home",
    amount,
    claimed: false,
    createdAt: NOW,
  };
}

describe("market lifecycle safety", () => {
  it("allows stakes only for scheduled fixtures strictly before kickoff", () => {
    assert.equal(isFixtureStakeable(fixture("a", "scheduled", NOW + 1), NOW), true);
    assert.equal(isFixtureStakeable(fixture("a", "scheduled", NOW), NOW), false);
    assert.equal(isFixtureStakeable(fixture("a", "live", NOW + 1), NOW), false);
    assert.equal(isFixtureStakeable(undefined, NOW), false);
  });

  it("keeps one canonical empty market for a future fixture", () => {
    const state = emptyState();
    state.fixtures.future = fixture("future", "scheduled", NOW + 60_000);
    state.markets.a = market("a", "future");
    state.markets.b = market("b", "future");
    state.markets.c = market("c", "future");

    const result = reconcileStateMarkets(state, {
      now: NOW,
      resultVerificationAvailable: false,
    });

    assert.equal(Object.keys(state.markets).length, 1);
    assert.equal(result.deleted, 2);
    assert.equal(Object.values(state.markets)[0].status, "open");
    const secondPass = reconcileStateMarkets(state, {
      now: NOW,
      resultVerificationAvailable: false,
    });
    assert.equal(Object.keys(state.markets).length, 1);
    assert.equal(secondPass.deleted, 0);
  });

  it("never deletes a duplicate that has a position and voids the unsafe copy", () => {
    const state = emptyState();
    state.fixtures.future = fixture("future", "scheduled", NOW + 60_000);
    state.markets.empty = market("empty", "future");
    state.markets.staked = market("staked", "future", 5);
    state.markets.secondStaked = market("secondStaked", "future", 3);
    state.positions.p1 = position("p1", "staked", 5);
    state.positions.p2 = position("p2", "secondStaked", 3);

    const result = reconcileStateMarkets(state, {
      now: NOW,
      resultVerificationAvailable: false,
    });

    assert.equal(state.markets.empty, undefined);
    assert.ok(state.markets.staked);
    assert.ok(state.markets.secondStaked);
    assert.equal(
      [state.markets.staked.status, state.markets.secondStaked.status].filter(
        (status) => status === "open"
      ).length,
      1
    );
    assert.equal(
      [state.markets.staked.status, state.markets.secondStaked.status].filter(
        (status) => status === "void"
      ).length,
      1
    );
    assert.deepEqual(Object.keys(state.positions).sort(), ["p1", "p2"]);
    assert.equal(result.voided, 1);
  });

  it("refunds fallback finished stakes but keeps TxLINE-verifiable stakes locked", () => {
    const fallback = emptyState();
    fallback.fixtures.done = fixture("done", "finished", NOW - 60_000);
    fallback.markets.m = market("m", "done", 10);
    fallback.positions.p = position("p", "m", 10);
    reconcileStateMarkets(fallback, {
      now: NOW,
      resultVerificationAvailable: false,
    });
    assert.equal(fallback.markets.m.status, "void");
    assert.ok(fallback.positions.p);

    const verified = emptyState();
    verified.fixtures.done = fixture("done", "finished", NOW - 60_000);
    verified.markets.m = market("m", "done", 10);
    verified.positions.p = position("p", "m", 10);
    reconcileStateMarkets(verified, {
      now: NOW,
      resultVerificationAvailable: true,
    });
    assert.equal(verified.markets.m.status, "locked");
    assert.ok(verified.positions.p);
  });

  it("deletes empty orphan markets and preserves staked orphans as refundable", () => {
    const state = emptyState();
    state.markets.empty = market("empty", "missing");
    state.markets.staked = market("staked", "missing", 7);
    state.positions.p = position("p", "staked", 7);

    reconcileStateMarkets(state, {
      now: NOW,
      resultVerificationAvailable: false,
    });

    assert.equal(state.markets.empty, undefined);
    assert.equal(state.markets.staked.status, "void");
    assert.ok(state.positions.p);
  });

  it("keeps funded on-chain pools locked until the chain is voided first", () => {
    const state = emptyState();
    state.fixtures.cancelled = fixture("cancelled", "cancelled", NOW - 1);
    state.markets.m = market("m", "cancelled", 12);
    state.positions.p = position("p", "m", 12);

    const result = reconcileStateMarkets(state, {
      now: NOW,
      resultVerificationAvailable: false,
      deferStakedVoids: true,
    });

    assert.equal(state.markets.m.status, "locked");
    assert.equal(result.voided, 0);
    assert.equal(result.locked, 1);
  });
});
