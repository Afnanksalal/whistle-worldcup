import assert from "node:assert/strict";
import test from "node:test";
import {
  filterMatchEventTape,
  formatMatchEventMeta,
  preferRicherEventTape,
} from "./matchEvents";

test("filters TxLINE possession noise but keeps goals and named players", () => {
  const tape = filterMatchEventTape([
    { type: "safe_possession", detail: "safe_possession" },
    { type: "action_amend", detail: "action_amend" },
    { type: "goal", team: "away", player: "Bukayo Saka", detail: "Normal Goal" },
    { type: "substitution", team: "home", detail: "substitution" },
  ]);
  assert.deepEqual(
    tape.map((event) => event.type),
    ["goal", "substitution"]
  );
});

test("merges rich timeline rows with newer live-only events", () => {
  const richer = preferRicherEventTape(
    [{ type: "goal", minute: 3, team: "away", teamName: "England", player: "Declan Rice" }],
    [
      { type: "goal", detail: "goal" },
      { type: "penalty", minute: 86, team: "away", player: "Bukayo Saka", detail: "Scored" },
    ]
  );
  assert.equal(
    richer.some((event) => event.player === "Declan Rice"),
    true
  );
  assert.equal(
    richer.some((event) => event.player === "Bukayo Saka"),
    true
  );
});

test("formats team names instead of home/away literals", () => {
  assert.equal(
    formatMatchEventMeta(
      { type: "goal", team: "away", player: "Ezri Konsa", assist: "Declan Rice" },
      "France",
      "England"
    ),
    "England · Ezri Konsa · assist Declan Rice"
  );
});
