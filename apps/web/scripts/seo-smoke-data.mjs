export const SEO_FIXTURE_ID = "seo-smoke-france-spain";
export const SEO_UNKNOWN_FIXTURE_ID = "seo-smoke-unknown-fixture";
export const SEO_HOME_TEAM = "France";
export const SEO_AWAY_TEAM = "Spain";
export const SEO_ARTICLE_TITLE = "SEO Smoke: France and Spain prepare for kickoff";

export const seoFixture = {
  id: SEO_FIXTURE_ID,
  competition: "FIFA World Cup 2026",
  round: "Semi-final",
  group: "Group S",
  kickoffTs: Date.UTC(2026, 6, 18, 19, 0, 0),
  status: "scheduled",
  home: {
    id: "seo-france",
    name: SEO_HOME_TEAM,
    shortName: "FRA",
  },
  away: {
    id: "seo-spain",
    name: SEO_AWAY_TEAM,
    shortName: "ESP",
  },
  venue: "SEO Smoke Stadium",
};

export const seoMarket = {
  id: "seo-smoke-market-1x2",
  fixtureId: SEO_FIXTURE_ID,
  marketType: "match_result",
  status: "open",
  outcomes: { home: 12, draw: 5, away: 8 },
  totalPool: 25,
  createdAt: Date.UTC(2026, 6, 13, 9, 0, 0),
};

export const seoGroup = {
  group: "Group S",
  standings: [
    {
      team: SEO_HOME_TEAM,
      shortName: "FRA",
      played: 2,
      won: 2,
      drawn: 0,
      lost: 0,
      gf: 4,
      ga: 1,
      gd: 3,
      pts: 6,
    },
    {
      team: SEO_AWAY_TEAM,
      shortName: "ESP",
      played: 2,
      won: 1,
      drawn: 1,
      lost: 0,
      gf: 3,
      ga: 1,
      gd: 2,
      pts: 4,
    },
  ],
  fixtures: [seoFixture],
};

export const seoArticle = {
  id: "seo-smoke-article",
  title: SEO_ARTICLE_TITLE,
  description: "A deterministic article used only by the production SEO smoke test.",
  url: "https://example.com/seo-smoke-world-cup-preview",
  source: "SEO Smoke Sports",
  imageUrl: null,
  publishedAt: "2026-07-13T10:00:00.000Z",
};

export const seoMeta = {
  mode: "live",
  network: "devnet",
  settlementRail: "ledger",
  stakeAsset: "units",
  requireWalletAuth: true,
  txlineConfigured: true,
  fixtureSource: "txline",
  keepSettleEnabled: true,
  newsConfigured: true,
};
