import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeFixture, normalizeScoreUpdate } from "./client";

describe("TxLINE normalization safety", () => {
  it("rejects fixtures without a real kickoff", () => {
    assert.equal(
      normalizeFixture({
        fixtureId: "fixture-1",
        home: { name: "A" },
        away: { name: "B" },
        status: "scheduled",
      }),
      null
    );
  });

  it("rejects final records with missing scores instead of fabricating 0-0", () => {
    assert.equal(
      normalizeScoreUpdate({
        fixtureId: "fixture-1",
        status: "finished",
        action: "game_finalised",
        seq: 10,
      }),
      null
    );
  });

  it("normalizes cancellation without requiring a score", () => {
    const update = normalizeScoreUpdate({
      fixtureId: "fixture-1",
      status: "cancelled",
      timestamp: 1_700_000_000,
    });
    assert.ok(update);
    assert.equal(update.status, "cancelled");
    assert.equal(update.ts, 1_700_000_000_000);
  });

  it("does not treat an unknown score-stream payload as live", () => {
    const update = normalizeScoreUpdate({
      fixtureId: "fixture-1",
      homeScore: 0,
      awayScore: 0,
      action: "heartbeat",
    });
    assert.ok(update);
    assert.equal(update.status, "unknown");
  });
});
