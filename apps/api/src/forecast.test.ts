import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Fixture, MarketPool } from "@whistle/shared";
import {
  buildDeterministicForecast,
  createForecastService,
  parseGroqForecastNote,
  type ForecastInput,
} from "./forecast";

const NOW = Date.parse("2026-07-13T12:00:00Z");

const target: Fixture = {
  id: "france-spain",
  competition: "FIFA World Cup",
  kickoffTs: NOW + 24 * 60 * 60 * 1000,
  status: "scheduled",
  home: { id: "fr", name: "France" },
  away: { id: "es", name: "Spain" },
};

function completed(
  id: string,
  daysAgo: number,
  home: Fixture["home"],
  away: Fixture["away"],
  homeScore: number,
  awayScore: number
): Fixture {
  return {
    id,
    competition: target.competition,
    kickoffTs: NOW - daysAgo * 24 * 60 * 60 * 1000,
    status: "finished",
    home,
    away,
    score: { home: homeScore, away: awayScore },
  };
}

const history: Fixture[] = [
  completed("fr-1", 2, { id: "fr", name: "France" }, { id: "de", name: "Germany" }, 3, 0),
  completed("fr-2", 5, { id: "br", name: "Brazil" }, { id: "fr", name: "France" }, 1, 2),
  completed("fr-3", 8, { id: "fr", name: "France" }, { id: "ar", name: "Argentina" }, 2, 1),
  completed("es-1", 3, { id: "es", name: "Spain" }, { id: "pt", name: "Portugal" }, 0, 2),
  completed("es-2", 6, { id: "nl", name: "Netherlands" }, { id: "es", name: "Spain" }, 2, 0),
  completed("es-3", 9, { id: "es", name: "Spain" }, { id: "uy", name: "Uruguay" }, 1, 1),
  completed("h2h-1", 12, { id: "fr", name: "France" }, { id: "es", name: "Spain" }, 2, 1),
];

function market(outcomes: Record<string, number>): MarketPool {
  return {
    id: "market-1x2",
    fixtureId: target.id,
    marketType: "match_result",
    status: "open",
    outcomes,
    totalPool: Object.values(outcomes).reduce((sum, value) => sum + value, 0),
    createdAt: NOW - 60_000,
  };
}

function input(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    fixture: target,
    fixtures: [target, ...history],
    fixtureSource: "txline",
    fixtureFeedAsOf: NOW - 30_000,
    ...overrides,
  };
}

function probabilitySum(values: { home: number; draw: number; away: number }) {
  return values.home + values.draw + values.away;
}

describe("deterministic match forecast", () => {
  it("normalizes probabilities and exposes the underlying team evidence", () => {
    const forecast = buildDeterministicForecast(input(), NOW);
    assert.ok(Math.abs(probabilitySum(forecast.probabilities) - 1) < 1e-12);
    assert.equal(forecast.likelyOutcome, "home");
    assert.ok(forecast.probabilities.home > forecast.probabilities.away);
    assert.equal(forecast.evidence.filter((item) => item.kind === "team_form").length, 2);
    assert.equal(forecast.evidence.filter((item) => item.kind === "head_to_head").length, 1);
    assert.ok(
      forecast.confidence.reasons.some((reason) => reason.includes("Player availability"))
    );
    assert.equal(forecast.version, "whistle-poisson-v2");
    assert.ok(forecast.factors?.length);
    assert.ok(forecast.factors?.some((factor) => factor.id === "recent_form" && factor.available));
    assert.ok(forecast.factors?.some((factor) => factor.id === "injuries" && !factor.available));
    // H2H sample is 1 in fixture history — available for evidence, blend needs 2+.
    assert.equal(
      forecast.factors?.find((factor) => factor.id === "head_to_head")?.appliedWeight,
      0
    );
  });

  it("uses a transparent low-confidence prior when team history is absent", () => {
    const forecast = buildDeterministicForecast(
      input({ fixtures: [target], fixtureSource: "thesportsdb" }),
      NOW
    );
    assert.ok(Math.abs(probabilitySum(forecast.probabilities) - 1) < 1e-12);
    assert.equal(forecast.probabilities.home, forecast.probabilities.away);
    assert.equal(forecast.confidence.level, "low");
    assert.ok(forecast.evidence.some((item) => item.kind === "model_prior"));
  });

  it("uses recent cross-competition team form without treating it as the competition baseline", () => {
    const external = history.slice(0, 2).map((fixture) => ({
      ...fixture,
      competition: "UEFA Nations League",
    }));
    const forecast = buildDeterministicForecast(
      input({ fixtures: [target, ...external], fixtureSource: "thesportsdb" }),
      NOW
    );
    assert.ok(forecast.evidence.some((item) => item.kind === "team_form"));
    assert.ok(forecast.evidence.some((item) => item.kind === "model_prior"));
    assert.equal(
      forecast.evidence.some((item) => item.kind === "competition_history"),
      false
    );
  });

  it("incorporates a live score without manufacturing a match minute", () => {
    const liveFixture: Fixture = {
      ...target,
      status: "live",
      score: { home: 0, away: 2 },
    };
    const forecast = buildDeterministicForecast(
      input({ fixture: liveFixture, fixtures: [liveFixture, ...history] }),
      NOW
    );
    assert.equal(forecast.phase, "live");
    assert.ok(forecast.probabilities.away > forecast.probabilities.home);
    assert.ok(
      forecast.evidence.some(
        (item) => item.kind === "live_score" && item.label.includes("minute unavailable")
      )
    );
  });
});

describe("forecast service boundaries", () => {
  it("accepts only the strict Groq note schema", () => {
    assert.equal(
      parseGroqForecastNote(
        JSON.stringify({
          note: "Recent results add context, but the available sample remains limited and uncertain.",
        })
      ),
      "Recent results add context, but the available sample remains limited and uncertain."
    );
    assert.equal(parseGroqForecastNote("not json"), null);
    assert.equal(parseGroqForecastNote(JSON.stringify({ note: "too short" })), null);
    assert.equal(
      parseGroqForecastNote(
        JSON.stringify({ note: "A sufficiently long note for validation.", extra: true })
      ),
      null
    );
  });

  it("keeps model probabilities independent from pool-implied crowd prices", async () => {
    const service = createForecastService({ now: () => NOW, groq: null });
    const homeCrowd = await service.forecast(
      input({ publicMarket: market({ home: 90, draw: 5, away: 5 }) })
    );
    const awayCrowd = await service.forecast(
      input({ publicMarket: market({ home: 5, draw: 5, away: 90 }) })
    );

    assert.deepEqual(homeCrowd.model.probabilities, awayCrowd.model.probabilities);
    assert.notDeepEqual(homeCrowd.crowd.probabilities, awayCrowd.crowd.probabilities);
    assert.ok(Math.abs(probabilitySum(homeCrowd.crowd.probabilities!) - 1) < 1e-12);
    assert.equal(homeCrowd.crowd.label, "pool_implied");
  });

  it("marks public fallback evidence as forecast-only and never settlement-eligible", async () => {
    const service = createForecastService({ now: () => NOW, groq: null });
    const forecast = await service.forecast(input({ fixtureSource: "thesportsdb" }));
    assert.equal(forecast.dataContext.fixtureSource, "thesportsdb");
    assert.equal(forecast.dataContext.settlementUse, "not_eligible");
    assert.match(forecast.dataContext.disclaimer, /never verify or settle/i);
  });

  it("caches Groq notes and refreshes them after the forecast TTL", async () => {
    let now = NOW;
    let calls = 0;
    const service = createForecastService({
      now: () => now,
      cacheTtlMs: 1_000,
      groq: async () => {
        calls += 1;
        return {
          text: "Recent results provide context, but the evidence sample remains limited and the outcome is uncertain.",
          model: "test-model",
        };
      },
    });

    const first = await service.forecast(input());
    const cached = await service.forecast(input());
    assert.equal(first.narrative.source, "groq");
    assert.equal(cached.narrative.source, "groq");
    assert.equal(calls, 1);

    now += 1_001;
    await service.forecast(input());
    assert.equal(calls, 2);
  });

  it("falls back deterministically when Groq fails or times out", async () => {
    const failing = createForecastService({
      now: () => NOW,
      groq: async () => {
        throw new Error("provider unavailable");
      },
    });
    assert.equal((await failing.forecast(input())).narrative.source, "deterministic");

    const timingOut = createForecastService({
      now: () => NOW,
      aiTimeoutMs: 5,
      groq: async () => new Promise(() => undefined),
    });
    assert.equal((await timingOut.forecast(input())).narrative.source, "deterministic");

    const unsafe = createForecastService({
      now: () => NOW,
      groq: async () => ({
        text: "You should bet on France because an unavailable player makes the result certain.",
        model: "test-model",
      }),
    });
    assert.equal((await unsafe.forecast(input())).narrative.source, "deterministic");
  });
});
