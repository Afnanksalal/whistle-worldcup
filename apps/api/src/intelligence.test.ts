import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Fixture, InsightCard, MarketPool } from "@whistle/shared";
import { getWorldCupNews, parseRss, type NewsArticle } from "./news";
import { isCurrentWorldCupArticle } from "./newsRelevance";
import {
  engineInsights,
  extractOpenAIText,
  hasMeaningfulLlmEvidence,
  selectRelevantArticles,
} from "./insights";

const NOW = Date.parse("2026-07-13T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const BBC_WORLD_CUP_FEED =
  "https://feeds.bbci.co.uk/sport/football/world-cup/rss.xml";
const GUARDIAN_WORLD_CUP_FEED =
  "https://www.theguardian.com/football/world-cup-2026/rss";

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

function rssItem(
  title: string,
  url: string,
  publishedAt: number,
  description = ""
) {
  return `<item>
    <title><![CDATA[${title}]]></title>
    <link>${url}</link>
    <description><![CDATA[${description}]]></description>
    <pubDate>${new Date(publishedAt).toUTCString()}</pubDate>
  </item>`;
}

describe("current World Cup news gate", () => {
  it("accepts current semifinal, tactics, and match-report coverage", () => {
    const accepted = [
      article({ title: "France face Spain in World Cup semi-final" }),
      article({
        title: "World Cup tactics: how Argentina can break down Portugal",
        description: "Analysis from the current tournament.",
      }),
      article({
        title: "World Cup match report: Brazil 2-1 Germany",
        description: "Brazil advance to the 2026 quarter-finals.",
      }),
    ];

    assert.equal(
      accepted.every((item) => isCurrentWorldCupArticle(item, NOW)),
      true
    );
  });

  it("accepts targeted current-tournament context and historical comparisons", () => {
    const accepted = [
      article({ title: "Five tactical trends from the World Cup so far" }),
      article({ title: "Meet the four World Cup semi-finalists" }),
      article({ title: "Morocco's remarkable World Cup run continues" }),
      article({ title: "Inside Japan's World Cup journey and campaign" }),
      article({ title: "Germany react to their World Cup exit" }),
      article({ title: "The decisive World Cup knockout matches" }),
      article({ title: "France's bid to win the World Cup" }),
      article({
        title: "World Cup final tactics: how France can stop Spain",
        description: "The approach differs from the 2018 and 2022 World Cups.",
      }),
      article({ title: "Signs of fatigue emerge before World Cup final" }),
      article({ title: "Signs point to a tense World Cup final" }),
    ];

    assert.equal(
      accepted.every((item) => isCurrentWorldCupArticle(item, NOW)),
      true
    );
  });

  it("rejects club, transfer, excluded competition, edition, and archive stories", () => {
    const rejected = [
      article({
        title: "PSG agree deal for new midfielder",
        description: "He impressed at the 2026 World Cup semi-final.",
      }),
      article({ title: "PSG plot move for 2026 World Cup star" }),
      article({
        title: "Everton agree deal for midfielder",
        description: "He featured in the 2026 World Cup final.",
      }),
      article({ title: "Bournemouth eye World Cup midfielder" }),
      article({ title: "Brighton target a 2026 World Cup winger" }),
      article({ title: "Brentford pursue World Cup 2026 talent" }),
      article({ title: "A World Cup star's release clause is revealed" }),
      article({
        title: "Marseille and Manchester United hold talks",
        description: "The player starred in the World Cup semi-final.",
      }),
      article({
        title: "Villa working on a deal",
        description: "The target impressed at the World Cup final.",
      }),
      article({
        title: "Manchester United receive Youri Tielemans transfer boost",
        description: "The midfielder is preparing for the 2026 World Cup final.",
      }),
      article({ title: "Premier League clubs eye World Cup 2026 stars" }),
      article({ title: "Club World Cup 2026 semi-final: Chelsea v Palmeiras" }),
      article({ title: "USWNT World Cup 2026 qualifying tactics explained" }),
      article({ title: "Women's World Cup 2027 final hosts confirmed" }),
      article({ title: "FIFA U-20 World Cup 2026 final preview" }),
      article({ title: "Cricket World Cup 2026 semi-final match report" }),
      article({ title: "Spain and Portugal reveal 2030 FIFA World Cup plans" }),
      article({ title: "World Cup 2022 match report: Argentina lift trophy" }),
      article({ title: "World Cup rewind: France's 1998 triumph" }),
      article({ title: "Quiz: remember the greatest World Cup finals?" }),
      article({
        title: "World Cup final tactical trends",
        description: "Explore the archive and take our quiz.",
      }),
      article({
        title: "A general World Cup football story",
        description: "This publisher note was updated in 2026.",
      }),
    ];

    assert.deepEqual(
      rejected.map((item) => isCurrentWorldCupArticle(item, NOW)),
      rejected.map(() => false)
    );
  });

  it("enforces valid publication dates and the seven-day/two-hour window", () => {
    assert.equal(
      isCurrentWorldCupArticle(
        article({ publishedAt: new Date(NOW - 7 * DAY_MS).toISOString() }),
        NOW
      ),
      true
    );
    assert.equal(
      isCurrentWorldCupArticle(
        article({
          publishedAt: new Date(NOW + 2 * 60 * 60 * 1000).toISOString(),
        }),
        NOW
      ),
      true
    );
    assert.equal(
      isCurrentWorldCupArticle(
        article({ publishedAt: new Date(NOW - 7 * DAY_MS - 1).toISOString() }),
        NOW
      ),
      false
    );
    assert.equal(
      isCurrentWorldCupArticle(
        article({
          publishedAt: new Date(
            NOW + 2 * 60 * 60 * 1000 + 1
          ).toISOString(),
        }),
        NOW
      ),
      false
    );
    assert.equal(
      isCurrentWorldCupArticle(article({ publishedAt: "not-a-date" }), NOW),
      false
    );
  });
});

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

  it("prefers the largest declared image across feed and description candidates", () => {
    const xml = `
      <rss><channel><item>
        <title>World Cup final preview</title>
        <link>https://example.com/final-preview</link>
        <media:thumbnail url="https://img.example.com/thumb.jpg" width="140" height="84" />
        <media:content url="https://img.example.com/medium.jpg" type="image/jpeg" width="460" height="276" />
        <enclosure url="https://img.example.com/enclosure.jpg" type="image/jpeg" width="600" height="360" />
        <media:content url="https://img.example.com/guardian-700.jpg" type="image/jpeg" width="700" height="420" />
        <description><![CDATA[
          <p>Match preview.</p>
          <img src="https://img.example.com/inline.jpg" width="320" height="180" />
        ]]></description>
      </item></channel></rss>`;

    const articles = parseRss(xml, "Test Wire");
    assert.equal(
      articles[0].imageUrl,
      "https://img.example.com/guardian-700.jpg"
    );
  });

  it("rejects insecure and non-image media and stays null without an image", () => {
    const xml = `
      <rss><channel>
        <item>
          <title>Video analysis</title>
          <link>https://example.com/video-analysis</link>
          <media:content url="https://media.example.com/analysis.mp4" type="video/mp4" width="1920" height="1080" />
          <enclosure url="https://media.example.com/podcast.mp3" type="audio/mpeg" />
          <media:thumbnail url="http://img.example.com/insecure.jpg" width="1200" height="800" />
          <description><![CDATA[
            <img src="ftp://img.example.com/invalid.jpg" />
            <img src="https://img.example.com/valid-report.webp" width="640" height="360" />
          ]]></description>
        </item>
        <item>
          <title>Plain match report</title>
          <link>https://example.com/plain-report</link>
          <description>No publisher artwork supplied.</description>
        </item>
        <item>
          <title>Encoded image report</title>
          <link>https://example.com/encoded-report</link>
          <description>&lt;p&gt;Preview&lt;/p&gt;&lt;img src=&quot;https://img.example.com/encoded-report.jpg&quot; width=&quot;720&quot; height=&quot;405&quot; /&gt;</description>
        </item>
      </channel></rss>`;

    const articles = parseRss(xml, "Test Wire");
    assert.equal(articles.length, 3);
    assert.equal(
      articles[0].imageUrl,
      "https://img.example.com/valid-report.webp"
    );
    assert.equal(articles[1].imageUrl, null);
    assert.equal(
      articles[2].imageUrl,
      "https://img.example.com/encoded-report.jpg"
    );
  });

  it("parses up to sixty publisher items before relevance filtering", () => {
    const items = Array.from({ length: 61 }, (_, index) =>
      rssItem(
        `World Cup 2026 report ${index}`,
        `https://example.com/report-${index}`,
        NOW
      )
    ).join("");
    const articles = parseRss(
      `<rss><channel>${items}</channel></rss>`,
      "Test Wire"
    );

    assert.equal(articles.length, 60);
    assert.equal(articles.at(-1)?.url, "https://example.com/report-59");
  });

  it("uses scoped feeds and treats a partial zero-item 200 as a cacheable failure", async () => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    const publishedAt = Date.now() - 60 * 60 * 1000;
    try {
      globalThis.fetch = (async (input) => {
        const url = String(input);
        requested.push(url);
        const item =
          url === BBC_WORLD_CUP_FEED
            ? rssItem(
                "World Cup 2026 semi-final tactics: France v Spain",
                "https://example.com/bbc-semifinal",
                publishedAt
              )
            : rssItem(
                "World Cup match report: Argentina reach the 2026 final",
                "https://example.com/guardian-report",
                publishedAt
              );
        return new Response(`<rss><channel>${item}</channel></rss>`, {
          status: 200,
        });
      }) as typeof fetch;

      const fresh = await getWorldCupNews({ force: true });
      assert.deepEqual(
        [...new Set(requested)].sort(),
        [BBC_WORLD_CUP_FEED, GUARDIAN_WORLD_CUP_FEED].sort()
      );
      assert.deepEqual(
        fresh.articles.map((item) => item.url).sort(),
        [
          "https://example.com/bbc-semifinal",
          "https://example.com/guardian-report",
        ]
      );

      globalThis.fetch = (async (input) => {
        const url = String(input);
        if (url === GUARDIAN_WORLD_CUP_FEED) {
          return new Response("<rss><channel></channel></rss>", {
            status: 200,
            headers: { "content-type": "application/rss+xml" },
          });
        }
        const clubStory = rssItem(
          "PSG agree transfer deal for World Cup star",
          "https://example.com/psg-transfer",
          publishedAt,
          "The player appeared in the 2026 World Cup semi-final."
        );
        return new Response(`<rss><channel>${clubStory}</channel></rss>`, {
          status: 200,
        });
      }) as typeof fetch;

      const partial = await getWorldCupNews({ force: true });
      assert.equal(partial.stale, true);
      assert.deepEqual(
        partial.articles.map((item) => item.url),
        ["https://example.com/guardian-report"]
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns a successful empty result when feeds contain no relevant news", async () => {
    const originalFetch = globalThis.fetch;
    const publishedAt = Date.now() - 60 * 60 * 1000;
    const unrelated = rssItem(
      "Manchester United make Youri Tielemans transfer enquiry",
      "https://example.com/united-transfer",
      publishedAt,
      "The midfielder previously played at a World Cup."
    );
    try {
      globalThis.fetch = (async () =>
        new Response(`<rss><channel>${unrelated}</channel></rss>`, {
          status: 200,
        })) as typeof fetch;

      const result = await getWorldCupNews({ force: true });
      assert.equal(result.cached, false);
      assert.equal(result.stale, false);
      assert.deepEqual(result.articles, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("treats malformed all-feed 200 responses as failures and re-filters stale cache", async () => {
    const originalFetch = globalThis.fetch;
    const originalNow = Date.now;
    let now = NOW;
    const item = rssItem(
      "France face Spain in World Cup semi-final",
      "https://example.com/cached-story",
      NOW - 60 * 60 * 1000
    );
    const xml = `<rss><channel>${item}</channel></rss>`;
    try {
      Date.now = () => now;
      globalThis.fetch = (async () =>
        new Response(xml, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        })) as typeof fetch;
      const fresh = await getWorldCupNews({ force: true });
      assert.equal(fresh.cached, false);
      assert.equal(fresh.stale, false);
      assert.equal(fresh.articles.length, 1);

      globalThis.fetch = (async (input) => {
        if (String(input) === BBC_WORLD_CUP_FEED) {
          return new Response("<!doctype html><html><body>blocked</body></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
        return new Response("<rss><channel><item></channel></rss>", {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      }) as typeof fetch;
      const stale = await getWorldCupNews({ force: true });
      assert.equal(stale.cached, true);
      assert.equal(stale.stale, true);
      assert.equal(stale.articles[0].url, "https://example.com/cached-story");

      now = NOW + 8 * DAY_MS;
      const expired = await getWorldCupNews({ force: true });
      assert.equal(expired.cached, true);
      assert.equal(expired.stale, true);
      assert.deepEqual(expired.articles, []);
    } finally {
      Date.now = originalNow;
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
