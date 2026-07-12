import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Fixture, InsightCard, MarketPool } from "@whistle/shared";
import { getWorldCupNews, parseRss, type NewsArticle } from "./news";
import {
  engineInsights,
  extractOpenAIText,
  hasMeaningfulLlmEvidence,
  selectRelevantArticles,
} from "./insights";

const NOW = Date.parse("2026-07-13T12:00:00Z");

const fixture: Fixture = {
  id: "france-spain",
  competition: "FIFA World Cup",
  round: "Semi-final",
  kickoffTs: NOW + 24 * 60 * 60 * 1000,
  status: "scheduled",
  home: { name: "France" },
  away: { name: "Spain" },
};

function article(overrides: Partial<NewsArticle>): NewsArticle {
  return {
    id: "article",
    title: "France face Spain in World Cup semi-final",
    description: "Team news before the football match.",
    url: "https://example.com/current",
    source: "Test Wire",
    imageUrl: null,
    publishedAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe("RSS parsing", () => {
  it("extracts images, strips markup, and canonicalizes tracking URLs", () => {
    const xml = `
      <rss><channel><item>
        <title><![CDATA[France &amp; Spain preview]]></title>
        <link>https://example.com/story?id=1&amp;utm_source=rss#top</link>
        <description><![CDATA[<p>Latest <strong>team</strong> news.</p>]]></description>
        <media:content url="https://img.example.com/match.jpg" type="image/jpeg" />
        <pubDate>Mon, 13 Jul 2026 10:00:00 GMT</pubDate>
      </item></channel></rss>`;

    const articles = parseRss(xml, "Test Wire");
    assert.equal(articles.length, 1);
    assert.equal(articles[0].url, "https://example.com/story?id=1");
    assert.equal(articles[0].imageUrl, "https://img.example.com/match.jpg");
    assert.equal(articles[0].description, "Latest team news.");
    assert.equal(articles[0].publishedAt, "2026-07-13T10:00:00.000Z");
  });

  it("serves stale cache when every feed is temporarily unavailable", async () => {
    const originalFetch = globalThis.fetch;
    const xml = `
      <rss><channel><item>
        <title>France face Spain in World Cup semi-final</title>
        <link>https://example.com/cached-story</link>
        <pubDate>Mon, 13 Jul 2026 10:00:00 GMT</pubDate>
      </item></channel></rss>`;
    try {
      globalThis.fetch = (async () =>
        new Response(xml, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        })) as typeof fetch;
      const fresh = await getWorldCupNews({ force: true });
      assert.equal(fresh.cached, false);
      assert.equal(fresh.stale, false);
      assert.equal(fresh.articles.length, 1);

      globalThis.fetch = (async () => {
        throw new Error("provider unavailable");
      }) as typeof fetch;
      const stale = await getWorldCupNews({ force: true });
      assert.equal(stale.cached, true);
      assert.equal(stale.stale, true);
      assert.equal(stale.articles[0].url, "https://example.com/cached-story");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("match-news relevance", () => {
  it("requires exact, recent, current-context headlines", () => {
    const current = article({});
    const historical = article({
      id: "old-context",
      title: "'Written off as too old' - France beat Spain in 2006",
      url: "https://example.com/history",
    });
    const stale = article({
      id: "stale",
      url: "https://example.com/stale",
      publishedAt: new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const substring = article({
      id: "substring",
      title: "French club prepares for football final",
      url: "https://example.com/substring",
    });

    const selected = selectRelevantArticles(
      fixture,
      [historical, stale, substring, current],
      NOW
    );
    assert.deepEqual(selected.map((item) => item.id), ["article"]);
  });
});

describe("engine evidence gates", () => {
  const emptyMarket: MarketPool = {
    id: "market",
    fixtureId: fixture.id,
    marketType: "match_result",
    status: "open",
    outcomes: { home: 0, draw: 0, away: 0 },
    totalPool: 0,
    createdAt: NOW,
  };

  it("does not manufacture a pool lean from an empty market", () => {
    const cards = engineInsights({
      fixture,
      markets: [emptyMarket],
      stats: null,
      history: {},
      articles: [],
      now: NOW,
    });
    assert.equal(cards.some((card) => card.title.toLowerCase().includes("pool share")), false);
    assert.equal(cards[0].reason, "insufficient_evidence");
    assert.equal(hasMeaningfulLlmEvidence(cards), false);
  });

  it("emits provenance only after the pool clears the funding floor", () => {
    const funded = {
      ...emptyMarket,
      outcomes: { home: 60, draw: 25, away: 15 },
      totalPool: 100,
    };
    const cards = engineInsights({
      fixture,
      markets: [funded],
      stats: null,
      history: {},
      articles: [],
      now: NOW,
    });
    const pool = cards.find((card) => card.tags.includes("1x2"));
    assert.ok(pool);
    assert.equal(pool.evidence?.[0]?.kind, "pool");
    assert.equal(pool.confidence, "low");
    assert.equal(hasMeaningfulLlmEvidence(cards), false);
  });
});

describe("OpenAI Responses parsing", () => {
  it("aggregates output_text across message items", () => {
    const text = extractOpenAIText({
      output: [
        { type: "reasoning", summary: [] },
        {
          type: "message",
          content: [{ type: "output_text", text: "First sentence." }],
        },
        {
          type: "message",
          content: [
            { type: "refusal", refusal: "" },
            { type: "output_text", text: "Second sentence." },
          ],
        },
      ],
    });
    assert.equal(text, "First sentence.\nSecond sentence.");
  });

  it("requires either strong live evidence or multiple evidence kinds", () => {
    const cards: InsightCard[] = [
      {
        id: "pool",
        severity: "info",
        title: "Pool",
        body: "Funded pool",
        tags: ["pool"],
        ts: NOW,
        source: "engine",
        evidence: [
          { kind: "pool", label: "pool", source: "ledger", asOf: NOW },
        ],
      },
      {
        id: "news",
        severity: "info",
        title: "News",
        body: "Recent match report",
        tags: ["news"],
        ts: NOW,
        source: "engine",
        evidence: [
          { kind: "news", label: "report", source: "wire", asOf: NOW },
        ],
      },
    ];
    assert.equal(hasMeaningfulLlmEvidence(cards.slice(0, 1)), false);
    assert.equal(hasMeaningfulLlmEvidence(cards), true);
  });
});
