import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountToBaseUnits,
  impliedShares,
  isFinalScoreRecord,
  marketIdentitySeed,
  outcomeToU8,
  payoutForPosition,
  resolveCorners,
  resolveFirstScorer,
  resolveMatchResult,
  resolveTotals,
  teamOutcomeSlug,
} from "./index";

describe("resolveMatchResult", () => {
  it("picks home / draw / away", () => {
    assert.equal(resolveMatchResult(2, 1), "home");
    assert.equal(resolveMatchResult(1, 1), "draw");
    assert.equal(resolveMatchResult(0, 3), "away");
  });
});

describe("resolveTotals", () => {
  it("uses strict greater-than for the line", () => {
    assert.equal(resolveTotals(1, 1, 2.5), "under");
    assert.equal(resolveTotals(2, 1, 2.5), "over");
    assert.equal(resolveTotals(1, 1, 2), "under");
    assert.equal(resolveTotals(2, 1, 2), "over");
  });
});

describe("resolveFirstScorer", () => {
  it("uses event tape then score fallback", () => {
    assert.equal(resolveFirstScorer(0, 0), "none");
    assert.equal(resolveFirstScorer(2, 1, "away"), "away");
    assert.equal(resolveFirstScorer(1, 0), "home");
  });
});

describe("resolveCorners", () => {
  it("compares total corners to the line", () => {
    assert.equal(resolveCorners(4, 5, 9.5), "under");
    assert.equal(resolveCorners(6, 5, 9.5), "over");
  });
});

describe("teamOutcomeSlug", () => {
  it("normalizes team names", () => {
    assert.equal(teamOutcomeSlug("Côte d'Ivoire"), "c-te-d-ivoire");
    assert.equal(teamOutcomeSlug("  France  "), "france");
  });
});

describe("parimutuel math", () => {
  it("computes implied shares and payouts", () => {
    const implied = impliedShares({ home: 25, draw: 0, away: 15 });
    assert.ok(Math.abs(implied.home - 0.625) < 1e-9);
    assert.ok(Math.abs(implied.away - 0.375) < 1e-9);
    assert.equal(payoutForPosition(25, 25, 40), 40);
    assert.equal(payoutForPosition(15, 15, 40), 40);
  });
});

describe("on-chain encodings", () => {
  it("uses stable, scope-specific market seeds", () => {
    const publicSeed = Buffer.from(marketIdentitySeed("fixture-1"));
    const samePublicSeed = Buffer.from(marketIdentitySeed("fixture-1"));
    const squadSeed = Buffer.from(marketIdentitySeed("fixture-1", "squad-1"));
    assert.equal(publicSeed.length, 32);
    assert.deepEqual(publicSeed, samePublicSeed);
    assert.notDeepEqual(publicSeed, squadSeed);
  });

  it("converts decimal stake amounts exactly", () => {
    assert.equal(amountToBaseUnits(10.25), 10_250_000n);
    assert.throws(() => amountToBaseUnits(0.0000001), /decimal places/);
    assert.throws(() => amountToBaseUnits(0), /positive/);
  });

  it("rejects outcomes from the wrong market type", () => {
    assert.equal(outcomeToU8("total_goals", "over"), 0);
    assert.throws(() => outcomeToU8("total_goals", "home"), /Invalid outcome/);
  });
});

describe("isFinalScoreRecord", () => {
  it("detects TxLINE finalisation signals", () => {
    assert.equal(isFinalScoreRecord({ action: "game_finalised" }), true);
    assert.equal(isFinalScoreRecord({ statusId: 100 }), true);
    assert.equal(isFinalScoreRecord({ period: 100 }), true);
    assert.equal(isFinalScoreRecord({ action: "score_update", statusId: 2 }), false);
  });
});
