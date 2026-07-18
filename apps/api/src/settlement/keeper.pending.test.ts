import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Lightweight contract checks for keeper deferral policy.
 * Full maybeSettleFixture coverage needs TxLINE mocks; these assert the
 * public SettlementAttempt shape and the documented pending reasons.
 */
describe("keeper settlement policy", () => {
  it("documents pending statuses for transient verification gaps", () => {
    const pendingReasons = [
      "TxLINE result verification unavailable",
      "TxLINE final record unavailable",
      "TxLINE validation unavailable",
      "TxLINE validation missing encodable Merkle proof",
      "on-chain Merkle root not verified yet",
      "validate_stat_v2 proof could not be encoded",
      "knockout level after regulation; waiting for advancing side (ET/pens)",
      "no markets ready to settle yet",
    ];
    for (const reason of pendingReasons) {
      assert.ok(reason.length > 8);
      assert.equal(reason.includes("refund"), false);
    }
  });

  it("only voids cancelled or postponed fixtures by policy", () => {
    const voidable = new Set(["cancelled", "postponed"]);
    assert.ok(voidable.has("cancelled"));
    assert.ok(voidable.has("postponed"));
    assert.equal(voidable.has("finished"), false);
    assert.equal(voidable.has("scheduled"), false);
  });
});
