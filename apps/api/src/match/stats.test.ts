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

    const liveReads = await Promise.all([
      refreshMatchStats(live.id),
      refreshMatchStats(live.id),
      refreshMatchStats(live.id),
    ]);
    assert.equal(requests.length, 2, "concurrent reads should share one request pair");
    assert.strictEqual(liveReads[0], liveReads[1]);
    assert.deepEqual(liveReads[0]?.yellowCards, { home: 2, away: 1 });

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
    assert.equal(requests.length, 2, "TxLINE merges must not bypass the live provider TTL");
    assert.equal(merged?.events.some((event) => event.player === "B Player"), true);
    assert.deepEqual(merged?.redCards, { home: 0, away: 1 });

    await refreshMatchStats(finished.id);
    await refreshMatchStats(finished.id);
    assert.equal(requests.length, 4, "a successful finished snapshot should be immutable");

    await refreshMatchStats(limited.id);
    assert.equal(requests.length, 6);
    await refreshMatchStats(blocked.id);
    assert.equal(requests.length, 6, "Retry-After should pause new calls without sleeping");
    assert.equal(getState().matchStats[blocked.id]?.source, "waiting");
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((resolve) => setTimeout(resolve, 75));
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
