import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  competitionPhase,
  enrichCompetitionPhases,
  isKnockoutMatchResult,
  roundLabelFromFixtureGroupSize,
} from "./competition";
import type { Fixture } from "./index";

function fixture(partial: Partial<Fixture> & Pick<Fixture, "id">): Fixture {
  return {
    kickoffTs: Date.now(),
    status: "scheduled",
    home: { id: "h", name: "Home" },
    away: { id: "a", name: "Away" },
    competition: "World Cup",
    ...partial,
  };
}

describe("competitionPhase", () => {
  it("treats World Cup group fixtures as group stage", () => {
    assert.equal(
      competitionPhase({ competition: "World Cup", group: "A", round: "Matchday 1" }),
      "group"
    );
    assert.equal(
      isKnockoutMatchResult({ competition: "World Cup", group: "C", round: "Group C" }),
      false
    );
  });

  it("detects knockout rounds from round labels", () => {
    for (const round of [
      "Round of 32",
      "Round of 16",
      "Quarter-finals",
      "Semi-final",
      "Final",
      "3rd Place",
    ]) {
      assert.equal(
        competitionPhase({ competition: "World Cup", round }),
        "knockout",
        round
      );
    }
  });

  it("treats unlabeled World Cup ties without FixtureGroupId as knockout", () => {
    assert.equal(
      competitionPhase({ competition: "FIFA World Cup", round: undefined, group: undefined }),
      "knockout"
    );
    assert.equal(isKnockoutMatchResult({ competition: "World Cup" }), true);
  });

  it("does not force knockout when only FixtureGroupId is present", () => {
    assert.equal(
      competitionPhase({
        competition: "World Cup",
        fixtureGroupId: "10115674",
      }),
      "unknown"
    );
  });
});

describe("enrichCompetitionPhases", () => {
  it("labels large FixtureGroupId cohorts as group stage", () => {
    const fixtures = Array.from({ length: 24 }, (_, i) =>
      fixture({ id: `g${i}`, fixtureGroupId: "group-big" })
    );
    const enriched = enrichCompetitionPhases(fixtures);
    assert.equal(enriched[0].round, "Group stage");
    assert.equal(enriched[0].group, "group");
    assert.equal(isKnockoutMatchResult(enriched[0]), false);
  });

  it("labels 16-team cohorts as Round of 32 knockout", () => {
    const fixtures = Array.from({ length: 16 }, (_, i) =>
      fixture({ id: `r${i}`, fixtureGroupId: "r32" })
    );
    const enriched = enrichCompetitionPhases(fixtures);
    assert.equal(enriched[0].round, "Round of 32");
    assert.equal(isKnockoutMatchResult(enriched[0]), true);
  });

  it("labels singleton finals as knockout", () => {
    const enriched = enrichCompetitionPhases([
      fixture({ id: "final", fixtureGroupId: "final-only" }),
    ]);
    assert.equal(enriched[0].round, "Final");
    assert.equal(isKnockoutMatchResult(enriched[0]), true);
  });
});

describe("roundLabelFromFixtureGroupSize", () => {
  it("maps WC board sizes", () => {
    assert.equal(roundLabelFromFixtureGroupSize(74).phase, "group");
    assert.equal(roundLabelFromFixtureGroupSize(16).round, "Round of 32");
    assert.equal(roundLabelFromFixtureGroupSize(8).round, "Round of 16");
    assert.equal(roundLabelFromFixtureGroupSize(4).round, "Quarter-finals");
    assert.equal(roundLabelFromFixtureGroupSize(2).round, "Semi-finals");
    assert.equal(roundLabelFromFixtureGroupSize(1).round, "Final");
  });
});
