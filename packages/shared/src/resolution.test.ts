import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  impliedShares,
  isFinalScoreRecord,
  payoutForPosition,
  resolveMatchResult,
  resolveTotals,
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

describe("parimutuel math", () => {
  it("computes implied shares and payouts", () => {
    const implied = impliedShares({ home: 25, draw: 0, away: 15 });
    assert.ok(Math.abs(implied.home - 0.625) < 1e-9);
    assert.ok(Math.abs(implied.away - 0.375) < 1e-9);
    assert.equal(payoutForPosition(25, 25, 40), 40);
    assert.equal(payoutForPosition(15, 15, 40), 40);
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
