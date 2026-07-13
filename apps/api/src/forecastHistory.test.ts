import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Fixture } from "@whistle/shared";
import { createForecastHistoryProvider } from "./forecastHistory";

const NOW = Date.parse("2026-07-13T12:00:00Z");

function target(homeId = "133913", awayId = "133909"): Fixture {
  return {
    id: `target-${homeId}-${awayId}`,
    competition: "FIFA World Cup",
    kickoffTs: NOW + 24 * 60 * 60_000,
    status: "scheduled",
    home: { id: homeId, name: "France" },
    away: { id: awayId, name: "Spain" },
  };
}

function historyEvent(id: string, homeId: string, awayId: string) {
  return {
    idEvent: id,
    idHomeTeam: homeId,
    idAwayTeam: awayId,
    strHomeTeam: homeId === "133913" ? "France" : "Spain",
    strAwayTeam: awayId === "133909" ? "Spain" : "Portugal",
    strLeague: "UEFA Nations League",
    dateEvent: "2026-07-10",
    strTime: "18:00:00",
    strStatus: "Match Finished",
    intHomeScore: "2",
    intAwayScore: "1",
  };
}

describe("public forecast team-history adapter", () => {
  it("fetches each team once, shares concurrent work, and serves the cache", async () => {
    let now = NOW;
    const calls: string[] = [];
    const provider = createForecastHistoryProvider({
      now: () => now,
      requestsPerMinute: 6,
      successTtlMs: 10_000,
      fetcher: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("searchevents.php")) {
          return Response.json({
            event: [historyEvent("france-spain-h2h", "133913", "133909")],
          });
        }
        const id = new URL(url).searchParams.get("id")!;
        return Response.json({
          results: [
            id === "133913"
              ? historyEvent("france-last", "133913", "133908")
              : historyEvent("spain-last", "133909", "133908"),
          ],
        });
      },
    });

    const fixture = target();
    const [first, concurrent] = await Promise.all([
      provider.get(fixture),
      provider.get(fixture),
    ]);
    assert.equal(calls.length, 3);
    assert.deepEqual(first, concurrent);
    assert.equal(first.length, 3);
    assert.equal(provider.peek(fixture).length, 3);

    now += 5_000;
    assert.equal((await provider.get(fixture)).length, 3);
    assert.equal(calls.length, 3, "unexpired team history should not refetch");
  });

  it("reserves a two-team refresh atomically and honors provider backoff", async () => {
    let now = NOW;
    const calls: string[] = [];
    const constrained = createForecastHistoryProvider({
      now: () => now,
      requestsPerMinute: 1,
      fetcher: async (input) => {
        calls.push(String(input));
        return Response.json({ results: [] });
      },
    });
    assert.deepEqual(await constrained.get(target()), []);
    assert.equal(calls.length, 0, "a partial two-team refresh must not start");

    const backedOff = createForecastHistoryProvider({
      now: () => now,
      requestsPerMinute: 8,
      fetcher: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("id=133913")) {
          return new Response(null, {
            status: 429,
            headers: { "Retry-After": "60" },
          });
        }
        return Response.json({ results: [] });
      },
    });
    await backedOff.get(target());
    const afterRateLimit = calls.length;
    now += 1_000;
    await backedOff.get(target("134497", "136482"));
    assert.equal(calls.length, afterRateLimit, "Retry-After should pause new history calls");
  });
});
