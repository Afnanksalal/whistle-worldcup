import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveDailyScoresPda,
  epochDayFromMs,
  extractMerkleSummary,
  proofSummaryLine,
} from "./merkle";
import { extractScoreEvents } from "../txline/client";

describe("merkle helpers", () => {
  it("derives epoch day and PDA deterministically", () => {
    const ts = 1_784_300_000_000;
    const day = epochDayFromMs(ts);
    assert.equal(day, Math.floor(ts / 86_400_000));
    const pda = deriveDailyScoresPda(
      "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
      day
    );
    assert.equal(typeof pda, "string");
    assert.equal(pda.length > 30, true);
  });

  it("extracts proof summary fields from a V2-shaped payload", () => {
    const validation = {
      eventStatRoot: "abc",
      mainTreeProof: [{}, {}],
      subTreeProof: [{}],
      statsToProve: [{}, {}],
      summary: {
        fixtureId: 123,
        updateStats: {
          minTimestamp: 1_784_300_000_000,
          maxTimestamp: 1_784_300_100_000,
        },
      },
    };
    const merkle = extractMerkleSummary(validation, "devnet");
    assert.equal(merkle.mainTreeProofNodes, 2);
    assert.equal(merkle.subTreeProofNodes, 1);
    assert.equal(merkle.statsCount, 2);
    assert.equal(merkle.epochDay, epochDayFromMs(1_784_300_000_000));
    assert.ok(merkle.dailyScoresPda);
    assert.match(proofSummaryLine(merkle, 99), /seq 99/);
  });
});

describe("extractScoreEvents", () => {
  it("maps TxLINE soccer goal actions", () => {
    const events = extractScoreEvents({
      action: "goal",
      Data: {
        Participant: 1,
        PlayerName: "Mbappé",
        Minute: 12,
      },
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "goal");
    assert.equal(events[0].team, "home");
    assert.equal(events[0].player, "Mbappé");
    assert.equal(events[0].minute, 12);
  });
});
