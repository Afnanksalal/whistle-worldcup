import { cache } from "react";
import type { Fixture, MarketPool } from "@whistle/shared";
import type { MatchDetail } from "./match-detail";

type FixturesResponse = {
  fixtures?: Fixture[];
  serverNow?: number;
};

type MarketsResponse = {
  markets?: MarketPool[];
};

export type StandingRow = {
  team: string;
  shortName?: string;
  logo?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

export type GroupTable = {
  group: string;
  standings: StandingRow[];
  fixtures: Fixture[];
};

type GroupsResponse = {
  groups?: GroupTable[];
};

export type NewsArticle = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  imageUrl: string | null;
  publishedAt: string;
};

type NewsResponse = {
  articles?: NewsArticle[];
  source?: string;
};

export type HomeInitialData = {
  fixtures: Fixture[];
  markets: MarketPool[];
  serverNow?: number;
};

export type TournamentInitialData = {
  groups: GroupTable[];
  fixtures: Fixture[];
  serverNow?: number;
};

export type NewsInitialData = {
  articles: NewsArticle[];
  source: string;
};

function internalApiUrl(path: string): string {
  const configured = process.env.INTERNAL_API_URL?.trim();
  const base = configured || "http://127.0.0.1:4000";
  return `${base.replace(/\/$/, "")}/api${path}`;
}

async function fetchInitialJson<T>(
  path: string,
  timeoutMs = 10_000
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(internalApiUrl(path), {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getHomeInitialData(): Promise<HomeInitialData | null> {
  const [fixtureResponse, marketResponse] = await Promise.all([
    fetchInitialJson<FixturesResponse>("/fixtures"),
    fetchInitialJson<MarketsResponse>("/markets"),
  ]);

  if (!fixtureResponse && !marketResponse) return null;

  return {
    fixtures: Array.isArray(fixtureResponse?.fixtures) ? fixtureResponse.fixtures : [],
    markets: Array.isArray(marketResponse?.markets) ? marketResponse.markets : [],
    serverNow: fixtureResponse?.serverNow,
  };
}

export async function getTournamentInitialData(): Promise<TournamentInitialData | null> {
  const [groupResponse, fixtureResponse] = await Promise.all([
    fetchInitialJson<GroupsResponse>("/groups"),
    fetchInitialJson<FixturesResponse>("/fixtures"),
  ]);

  if (!groupResponse && !fixtureResponse) return null;

  return {
    groups: Array.isArray(groupResponse?.groups) ? groupResponse.groups : [],
    fixtures: Array.isArray(fixtureResponse?.fixtures) ? fixtureResponse.fixtures : [],
    serverNow: fixtureResponse?.serverNow,
  };
}

export async function getNewsInitialData(
  timeoutMs = 10_000
): Promise<NewsInitialData | null> {
  const response = await fetchInitialJson<NewsResponse>("/news", timeoutMs);
  if (!response) return null;

  return {
    articles: Array.isArray(response.articles) ? response.articles : [],
    source: typeof response.source === "string" ? response.source : "",
  };
}

export const getMatchDetailForSeo = cache(
  async (id: string, squadId = ""): Promise<MatchDetail | null> => {
    const query = squadId ? `?squadId=${encodeURIComponent(squadId)}` : "";
    const response = await fetch(
      internalApiUrl(`/fixtures/${encodeURIComponent(id)}${query}`),
      { next: { revalidate: 15 } }
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Match detail request failed with ${response.status}`);
    }

    const payload = (await response.json()) as Partial<MatchDetail>;
    if (!payload.fixture) {
      throw new Error("Match detail response did not include a fixture");
    }

    return {
      fixture: payload.fixture,
      serverNow: payload.serverNow,
      live: payload.live,
      odds: Array.isArray(payload.odds) ? payload.odds : [],
      markets: Array.isArray(payload.markets) ? payload.markets : [],
      priceHistory: payload.priceHistory || {},
      stats: payload.stats || null,
      insights: Array.isArray(payload.insights) ? payload.insights : [],
      forecast: payload.forecast || null,
    };
  }
);

export const getFixtureForSeo = cache(async (id: string): Promise<Fixture | null> => {
  const detail = await getMatchDetailForSeo(id);
  return detail?.fixture || null;
});

export async function getFixturesForSeo(): Promise<Fixture[]> {
  try {
    const response = await fetch(internalApiUrl("/fixtures"), {
      next: { revalidate: 900 },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as FixturesResponse;
    return Array.isArray(payload.fixtures) ? payload.fixtures : [];
  } catch {
    return [];
  }
}
