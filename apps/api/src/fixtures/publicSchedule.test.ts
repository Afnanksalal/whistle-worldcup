import assert from "node:assert/strict";
import test from "node:test";
import type { Fixture } from "@whistle/shared";
import {
  isCurrentWorldCupPublicFixture,
  publicEventToFixture,
  type TsdbEvent,
} from "./publicSchedule";

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

function event(overrides: Partial<TsdbEvent> = {}): TsdbEvent {
  return {
    idEvent: "event-1",
    strHomeTeam: "France",
    strAwayTeam: "Brazil",
    strLeague: "FIFA World Cup",
    dateEvent: "2026-07-19",
    strTime: "19:30:00",
    ...overrides,
  };
}

test("parses canonical provider timestamps without inventing a kickoff", () => {
  assert.equal(
    publicEventToFixture(event())?.kickoffTs,
    Date.UTC(2026, 6, 19, 19, 30)
  );
  assert.equal(
    publicEventToFixture(
      event({ strTimestamp: "2026-07-19T15:00:00-04:00" })
    )?.kickoffTs,
    Date.UTC(2026, 6, 19, 19)
  );

  for (const invalid of [
    event({ dateEvent: undefined }),
    event({ strTime: undefined }),
    event({ dateEvent: "2026-02-30" }),
    event({ strTime: "25:00:00" }),
    event({ strTimestamp: "2026-07-19T19:00:00", dateEvent: undefined }),
    event({ strTimestamp: "2026-02-30T19:00:00Z", dateEvent: undefined }),
    event({ strTimestamp: "2026-07-19T25:00:00Z", dateEvent: undefined }),
    event({ strTimestamp: "2026-07-19T19:00:00+14:30", dateEvent: undefined }),
  ]) {
    assert.equal(publicEventToFixture(invalid), null);
  }
});
