import type { Fixture, FixtureTeam } from "@whistle/shared";
import { getLogger } from "../observability";

/**
 * UI-only team crest / short-code enrichment.
 * TxLINE free fixture payloads do not include logos — fill missing
 * `FixtureTeam.logo` / `shortName` from TheSportsDB (display only).
 * Never used for scores, status, or settlement.
 */
const TSDB = "https://www.thesportsdb.com/api/v1/json/123";

export type TeamAssets = {
  logo?: string;
  shortName?: string;
  /** TheSportsDB numeric team id when resolved. */
  tsdbTeamId?: string;
};

type TsdbTeam = {
  idTeam?: string;
  strTeam?: string;
  strTeamAlternate?: string;
  strTeamShort?: string;
  strSport?: string;
  strGender?: string;
  strCountry?: string;
  strBadge?: string;
  strLogo?: string;
  strTeamBadge?: string;
};

const cache = new Map<string, TeamAssets | null>();

/** ISO-3166-1 alpha-2 flag fallback when TheSportsDB has no badge. */
const FLAG_BY_TEAM: Record<string, string> = {
  argentina: "ar",
  australia: "au",
  brazil: "br",
  england: "gb-eng",
  france: "fr",
  germany: "de",
  india: "in",
  mexico: "mx",
  myanmar: "mm",
  "new zealand": "nz",
  paraguay: "py",
  spain: "es",
  "south africa": "za",
  "south korea": "kr",
  "united states": "us",
  usa: "us",
  vietnam: "vn",
  canada: "ca",
  morocco: "ma",
  "czech republic": "cz",
  "bosnia-herzegovina": "ba",
  bosnia: "ba",
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function httpsUrl(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function flagFallback(name: string): string | undefined {
  const code = FLAG_BY_TEAM[normalizeName(name)];
  return code ? `https://flagcdn.com/w80/${code}.png` : undefined;
}

function scoreTeam(candidate: TsdbTeam, wanted: string): number {
  const team = normalizeName(candidate.strTeam || "");
  const alt = normalizeName(candidate.strTeamAlternate || "");
  let score = 0;
  if (candidate.strSport === "Soccer") score += 10;
  if ((candidate.strGender || "Male") === "Male") score += 3;
  if (team === wanted) score += 20;
  else if (alt.split(";").map((s) => s.trim()).includes(wanted)) score += 15;
  else if (team.includes(wanted) || wanted.includes(team)) score += 5;
  else return -1;
  return score;
}

export function pickTeamAssets(
  teams: TsdbTeam[] | null | undefined,
  teamName: string
): TeamAssets | null {
  const wanted = normalizeName(teamName);
  if (!wanted || !teams?.length) return null;

  let best: { team: TsdbTeam; score: number } | null = null;
  for (const team of teams) {
    const score = scoreTeam(team, wanted);
    if (score < 0) continue;
    if (!best || score > best.score) best = { team, score };
  }
  if (!best) return null;

  const logo =
    httpsUrl(best.team.strBadge) ||
    httpsUrl(best.team.strTeamBadge) ||
    httpsUrl(best.team.strLogo);
  const shortName = best.team.strTeamShort?.trim().slice(0, 3).toUpperCase() || undefined;
  const tsdbTeamId = best.team.idTeam?.trim() || undefined;
  if (!logo && !shortName && !tsdbTeamId) return null;
  return { logo, shortName, tsdbTeamId };
}

export function mergeTeamAssets(team: FixtureTeam, assets: TeamAssets | null): FixtureTeam {
  if (!assets) return team;
  return {
    ...team,
    logo: team.logo || assets.logo,
    shortName: team.shortName || assets.shortName,
  };
}

async function fetchTeamSearch(teamName: string): Promise<TsdbTeam[]> {
  const url = `${TSDB}/searchteams.php?t=${encodeURIComponent(teamName)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`TheSportsDB team search ${res.status}`);
  const data = (await res.json()) as { teams?: TsdbTeam[] | null };
  return data.teams || [];
}

export async function lookupTeamAssets(teamName: string): Promise<TeamAssets | null> {
  const key = normalizeName(teamName);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  let assets: TeamAssets | null = null;
  try {
    assets = pickTeamAssets(await fetchTeamSearch(teamName), teamName);
  } catch (err) {
    getLogger().child({ module: "team-assets" }).warn({ err, teamName }, "badge lookup failed");
  }

  if (!assets?.logo) {
    const flag = flagFallback(teamName);
    if (flag) {
      assets = { logo: flag, shortName: assets?.shortName };
    }
  }

  cache.set(key, assets);
  return assets;
}

/** Fill missing logos / short codes on fixtures (mutates copies, not settlement fields). */
export async function enrichFixturesWithTeamAssets(fixtures: Fixture[]): Promise<Fixture[]> {
  const names = new Set<string>();
  for (const fixture of fixtures) {
    if (!fixture.home.logo) names.add(fixture.home.name);
    if (!fixture.away.logo) names.add(fixture.away.name);
  }

  await Promise.all([...names].map((name) => lookupTeamAssets(name)));

  return fixtures.map((fixture) => ({
    ...fixture,
    home: mergeTeamAssets(fixture.home, cache.get(normalizeName(fixture.home.name)) ?? null),
    away: mergeTeamAssets(fixture.away, cache.get(normalizeName(fixture.away.name)) ?? null),
  }));
}

/** Resolve TheSportsDB team id by display name (for history lookups). */
export async function resolveTsdbTeamId(teamName: string): Promise<string | null> {
  const assets = await lookupTeamAssets(teamName);
  return assets?.tsdbTeamId || null;
}

/** Test helper — clear in-memory badge cache. */
export function clearTeamAssetCache() {
  cache.clear();
}
