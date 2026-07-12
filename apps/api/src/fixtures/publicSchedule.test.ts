import assert from "node:assert/strict";
import test from "node:test";
import type { Fixture } from "@whistle/shared";
import { isCurrentWorldCupPublicFixture } from "./publicSchedule";

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: "tsdb-2026-final",
    competition: "FIFA World Cup",
    kickoffTs: Date.UTC(2026, 6, 19, 19),
    status: "scheduled",
    home: { name: "France", shortName: "FRA" },
    away: { name: "Brazil", shortName: "BRA" },
    ...overrides,
  };
}

test("accepts only current-year TheSportsDB World Cup fixtures", () => {
  assert.equal(isCurrentWorldCupPublicFixture(fixture(), 2026), true);
  assert.equal(
    isCurrentWorldCupPublicFixture(
      fixture({ kickoffTs: Date.UTC(2022, 11, 18, 15) }),
      2026
    ),
    false
  );
  assert.equal(
    isCurrentWorldCupPublicFixture(fixture({ competition: "UEFA Champions League" }), 2026),
    false
  );
  assert.equal(
    isCurrentWorldCupPublicFixture(fixture({ id: "txline-2026-final" }), 2026),
    false
  );
});
