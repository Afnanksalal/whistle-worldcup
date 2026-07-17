import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeEpochMs,
  normalizeFixture,
  normalizeScoreUpdate,
  pickBestScoreRecord,
  pickTxlineGoals,
  txlineCompetitionIds,
  txlineFixtureLookbackDays,
} from "./client";

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

  it("maps native TxLINE participants and honors the home flag", () => {
    const kickoff = Date.UTC(2026, 6, 19, 19);
    const home = normalizeFixture({
      FixtureId: 18257865,
      Competition: "World Cup",
      StartTime: kickoff,
      Participant1: "Brazil",
      Participant1Id: 1634,
      Participant2: "Argentina",
      Participant2Id: 1635,
      Participant1IsHome: true,
    });
    assert.ok(home);
    assert.equal(home.id, "18257865");
    assert.equal(home.home.name, "Brazil");
    assert.equal(home.away.name, "Argentina");
    assert.equal(home.kickoffTs, kickoff);

    const swapped = normalizeFixture({
      FixtureId: 18257866,
      StartTime: kickoff,
      Participant1: "Brazil",
      Participant2: "Argentina",
      Participant1IsHome: false,
    });
    assert.ok(swapped);
    assert.equal(swapped.home.name, "Argentina");
    assert.equal(swapped.away.name, "Brazil");
  });

  it("accepts explicit seconds, milliseconds, and zoned ISO timestamps", () => {
    const instant = Date.UTC(2026, 6, 19, 19);
    assert.equal(normalizeEpochMs(instant / 1000), instant);
    assert.equal(normalizeEpochMs(String(instant)), instant);
    assert.equal(normalizeEpochMs("2026-07-19T15:00:00-04:00"), instant);
  });

  it("rejects ambiguous or implausible timestamp units and zones", () => {
    for (const value of [
      0,
      -1,
      Number.NaN,
      1_774_118_800_000_000,
      1_774_118_800_000_000_000,
      "2026-07-19T19:00:00",
      "2026-02-30T19:00:00Z",
      "2026-07-19T25:00:00Z",
      "2026-07-19T19:00:00+14:30",
      "2200-01-01T00:00:00Z",
    ]) {
      assert.equal(normalizeEpochMs(value), null);
    }
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

  it("marks kickoffs older than ~2.5h as finished when TxLINE omits status", () => {
    const past = normalizeFixture({
      FixtureId: 17588223,
      Competition: "World Cup",
      StartTime: Date.now() - 5 * 60 * 60 * 1000,
      Participant1: "Mexico",
      Participant2: "South Korea",
      Participant1IsHome: true,
    });
    assert.ok(past);
    assert.equal(past.status, "finished");
  });

  it("reads native TxLINE Stats/Score goals and prefers game_finalised rows", () => {
    const goals = pickTxlineGoals({
      Participant1IsHome: true,
      Stats: { "1": 3, "2": 2 },
      Score: {
        Participant1: { Total: { Goals: 3 } },
        Participant2: { Total: { Goals: 2 } },
      },
    });
    assert.deepEqual(goals, { home: 3, away: 2 });

    const best = pickBestScoreRecord([
      {
        FixtureId: 1,
        Action: "yellow_card",
        Stats: { "1": 1, "2": 0 },
        Participant1IsHome: true,
      },
      {
        FixtureId: 1,
        Action: "game_finalised",
        Stats: { "1": 2, "2": 1 },
        Participant1IsHome: true,
      },
    ]);
    const update = normalizeScoreUpdate(best);
    assert.ok(update);
    assert.equal(update.status, "finished");
    assert.equal(update.homeScore, 2);
    assert.equal(update.awayScore, 1);
  });

  it("defaults fixture lookback/competition env helpers for the WC board", () => {
    const prevLookback = process.env.TXLINE_FIXTURE_LOOKBACK_DAYS;
    const prevComps = process.env.TXLINE_COMPETITION_IDS;
    delete process.env.TXLINE_FIXTURE_LOOKBACK_DAYS;
    delete process.env.TXLINE_COMPETITION_IDS;
    assert.equal(txlineFixtureLookbackDays(), 50);
    assert.deepEqual(txlineCompetitionIds(), ["72"]);
    process.env.TXLINE_COMPETITION_IDS = "*";
    assert.equal(txlineCompetitionIds(), null);
    if (prevLookback === undefined) delete process.env.TXLINE_FIXTURE_LOOKBACK_DAYS;
    else process.env.TXLINE_FIXTURE_LOOKBACK_DAYS = prevLookback;
    if (prevComps === undefined) delete process.env.TXLINE_COMPETITION_IDS;
    else process.env.TXLINE_COMPETITION_IDS = prevComps;
  });
});
