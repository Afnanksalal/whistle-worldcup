import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Fixture } from "@whistle/shared";

function fixture(id: string, status: Fixture["status"]): Fixture {
  return {
    id: `tsdb-${id}`,
    competition: "FIFA World Cup",
    kickoffTs: Date.UTC(2026, 6, 13, 18),
    status,
    home: { name: "France" },
    away: { name: "Spain" },
  };
}

test("stats polling is status-aware, deduplicated, and rate-limit safe", async () => {
  const originalCwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "whistle-stats-"));
  process.chdir(tempDir);
  process.env.STATE_SAVE_DEBOUNCE_MS = "50";

  try {
    const [{ getState, mutate }, { refreshMatchStats }] = await Promise.all([
      import("../store"),
      import("./stats"),
    ]);
    const scheduled = fixture("scheduled", "scheduled");
    const live = fixture("live", "live");
    const finished = fixture("finished", "finished");
    const limited = fixture("429", "live");
    const blocked = fixture("blocked", "live");

    mutate((state) => {
      for (const item of [scheduled, live, finished, limited, blocked]) {
        state.fixtures[item.id] = item;
      }
    });

    const requests: string[] = [];
    globalThis.fetch = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push(url);
      if (url.includes("id=429")) {
        return new Response(null, {
          status: 429,
          headers: { "Retry-After": "60" },
        });
      }
      if (url.includes("lookuptimeline.php")) {
        return Response.json({
          timeline: [
            {
              strTimeline: "Yellow Card",
              strPlayer: "A Player",
              intTime: "12",
              strHomeAway: "Home",
            },
            {
              strTimeline: "Goal",
              strTimelineDetail: "Normal Goal",
              strPlayer: "Bukayo Saka",
              strAssist: "Declan Rice",
              strTeam: "England",
              strHome: "No",
              intTime: "37",
            },
          ],
        });
      }
      return Response.json({
        eventstats: [
          { strStat: "Ball Possession", intHome: "54", intAway: "46" },
          { strStat: "Yellow Cards", intHome: "2", intAway: "1" },
        ],
      });
    };

    await refreshMatchStats(scheduled.id);
    assert.equal(requests.length, 0, "scheduled fixtures must not poll the provider");

    // TxLINE may leave fixture.status=scheduled while live tape is active.
    mutate((state) => {
      state.live[scheduled.id] = {
        fixtureId: scheduled.id,
        homeScore: 1,
        awayScore: 0,
        status: "scheduled",
        statusId: 4,
        events: [{ type: "goal", detail: "goal" }],
        ts: Date.now(),
      };
    });
    const scheduledLive = await refreshMatchStats(scheduled.id);
    assert.equal(requests.length, 2, "in-play live tape should poll TheSportsDB timeline");
    assert.equal(
      scheduledLive?.events.some((event) => event.player === "Bukayo Saka"),
      true
    );

    const liveReads = await Promise.all([
      refreshMatchStats(live.id),
      refreshMatchStats(live.id),
      refreshMatchStats(live.id),
    ]);
    assert.equal(requests.length, 4, "concurrent reads should share one request pair");
    assert.strictEqual(liveReads[0], liveReads[1]);
    assert.deepEqual(liveReads[0]?.yellowCards, { home: 2, away: 1 });
    const saka = liveReads[0]?.events.find((event) => event.player === "Bukayo Saka");
    assert.ok(saka);
    assert.equal(saka?.team, "away");
    assert.equal(saka?.teamName, "England");
    assert.equal(saka?.assist, "Declan Rice");

    mutate((state) => {
      state.live[live.id] = {
        fixtureId: live.id,
        homeScore: 0,
        awayScore: 0,
        status: "live",
        events: [{ type: "red_card", minute: 30, team: "away", player: "B Player" }],
        ts: Date.now(),
      };
    });
    const merged = await refreshMatchStats(live.id);
    assert.equal(requests.length, 4, "TxLINE merges must not bypass the live provider TTL");
    assert.equal(merged?.events.some((event) => event.player === "B Player"), true);
    assert.deepEqual(merged?.redCards, { home: 0, away: 1 });

    await refreshMatchStats(finished.id);
    await refreshMatchStats(finished.id);
    assert.equal(requests.length, 6, "a successful finished snapshot should be immutable");

    await refreshMatchStats(limited.id);
    assert.equal(requests.length, 8);
    await refreshMatchStats(blocked.id);
    assert.equal(requests.length, 8, "Retry-After should pause new calls without sleeping");
    assert.equal(getState().matchStats[blocked.id]?.source, "waiting");
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((resolve) => setTimeout(resolve, 75));
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
