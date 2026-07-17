import type { Fixture, MatchInfo } from "@whistle/shared";
import { publicEventToFixture, type TsdbEvent } from "./publicSchedule";
import { getLogger } from "../observability";
import { mutate, getState } from "../store";

/**
 * Resolve TheSportsDB event metadata for a fixture (venue, media, formations).
 * Display / stats linking only — never used for settlement.
 */
const TSDB = "https://www.thesportsdb.com/api/v1/json/123";
const SUCCESS_TTL_MS = 6 * 60 * 60_000;
const FAILURE_TTL_MS = 30 * 60_000;
const KICKOFF_MATCH_WINDOW_MS = 36 * 60 * 60_000;

type CacheEntry = { expiresAt: number; info: MatchInfo | null };

const cache = new Map<string, CacheEntry>();

function normalizedName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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

function eventKickoffMs(event: TsdbEvent): number | null {
  const fixture = publicEventToFixture(event);
  return fixture?.kickoffTs ?? null;
}

function matchupScore(event: TsdbEvent, fixture: Fixture): number {
  const home = normalizedName(event.strHomeTeam || "");
  const away = normalizedName(event.strAwayTeam || "");
  const wantHome = normalizedName(fixture.home.name);
  const wantAway = normalizedName(fixture.away.name);
  let score = 0;
  if (home === wantHome && away === wantAway) score += 10;
  else if (home === wantAway && away === wantHome) score += 8;
  else if (
    (home === wantHome || home === wantAway) &&
    (away === wantHome || away === wantAway)
  ) {
    score += 4;
  } else return -1;

  const kickoff = eventKickoffMs(event);
  if (kickoff !== null) {
    const delta = Math.abs(kickoff - fixture.kickoffTs);
    if (delta <= KICKOFF_MATCH_WINDOW_MS) score += 5;
    else if (delta <= 7 * 24 * 60 * 60_000) score += 1;
    else score -= 3;
  }
  return score;
}

function toMatchInfo(fixtureId: string, event: TsdbEvent, now: number): MatchInfo {
  return {
    fixtureId,
    venue: event.strVenue || undefined,
    round: event.strRound || undefined,
    city: (event as { strCity?: string }).strCity || undefined,
    thumb: httpsUrl((event as { strThumb?: string }).strThumb),
    poster: httpsUrl((event as { strPoster?: string }).strPoster),
    banner: httpsUrl((event as { strBanner?: string }).strBanner),
    homeFormation: (event as { strHomeFormation?: string }).strHomeFormation || undefined,
    awayFormation: (event as { strAwayFormation?: string }).strAwayFormation || undefined,
    homeCoach: (event as { strHomeCoach?: string }).strHomeCoach || undefined,
    awayCoach: (event as { strAwayCoach?: string }).strAwayCoach || undefined,
    tsdbEventId: event.idEvent ? String(event.idEvent) : undefined,
    source: "TheSportsDB",
    asOf: now,
  };
}

async function searchEvents(fixture: Fixture): Promise<TsdbEvent[]> {
  const query = `${fixture.home.name}_vs_${fixture.away.name}`.replace(/\s+/g, "_");
  const res = await fetch(`${TSDB}/searchevents.php?e=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`searchevents ${res.status}`);
  const data = (await res.json()) as { event?: TsdbEvent[] | null };
  return data.event || [];
}

async function lookupEvent(id: string): Promise<TsdbEvent | null> {
  const res = await fetch(`${TSDB}/lookupevent.php?id=${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { events?: TsdbEvent[] | null };
  return data.events?.[0] || null;
}

function applyInfoToFixture(fixtureId: string, info: MatchInfo) {
  mutate((state) => {
    const fixture = state.fixtures[fixtureId];
    if (!fixture) return;
    if (info.venue && !fixture.venue) fixture.venue = info.venue;
    if (info.round && !fixture.round) fixture.round = info.round;
    const raw =
      fixture.raw && typeof fixture.raw === "object"
        ? { ...(fixture.raw as Record<string, unknown>) }
        : {};
    if (info.tsdbEventId) {
      raw.tsdbEventId = info.tsdbEventId;
      raw.idEvent = info.tsdbEventId;
    }
    if (info.thumb) raw.strThumb = info.thumb;
    if (info.poster) raw.strPoster = info.poster;
    if (info.banner) raw.strBanner = info.banner;
    if (info.homeFormation) raw.strHomeFormation = info.homeFormation;
    if (info.awayFormation) raw.strAwayFormation = info.awayFormation;
    if (info.homeCoach) raw.strHomeCoach = info.homeCoach;
    if (info.awayCoach) raw.strAwayCoach = info.awayCoach;
    if (info.city) raw.strCity = info.city;
    fixture.raw = raw;
  });
}

export function getCachedMatchInfo(fixtureId: string): MatchInfo | null {
  const entry = cache.get(fixtureId);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.info;
}

export async function resolveMatchInfo(fixtureId: string): Promise<MatchInfo | null> {
  const now = Date.now();
  const cached = cache.get(fixtureId);
  if (cached && cached.expiresAt > now) return cached.info;

  const fixture = getState().fixtures[fixtureId];
  if (!fixture) return null;

  const existingId =
    (fixture.id.startsWith("tsdb-") && fixture.id.slice(5)) ||
    String((fixture.raw as { tsdbEventId?: string; idEvent?: string } | undefined)?.tsdbEventId ||
      (fixture.raw as { idEvent?: string } | undefined)?.idEvent ||
      "").trim() ||
    null;

  try {
    let event: TsdbEvent | null = null;
    if (existingId) {
      event = await lookupEvent(existingId);
    }
    if (!event) {
      const candidates = await searchEvents(fixture);
      let best: { event: TsdbEvent; score: number } | null = null;
      for (const candidate of candidates) {
        const score = matchupScore(candidate, fixture);
        if (score < 0) continue;
        if (!best || score > best.score) best = { event: candidate, score };
      }
      event = best && best.score >= 8 ? best.event : null;
      if (event?.idEvent) {
        const detailed = await lookupEvent(String(event.idEvent));
        if (detailed) event = detailed;
      }
    }

    const info = event ? toMatchInfo(fixtureId, event, now) : null;
    cache.set(fixtureId, {
      info,
      expiresAt: now + (info ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
    });
    if (info) applyInfoToFixture(fixtureId, info);
    return info;
  } catch (err) {
    getLogger().child({ module: "match-info" }).warn({ err, fixtureId }, "match info resolve failed");
    cache.set(fixtureId, { info: null, expiresAt: now + FAILURE_TTL_MS });
    return null;
  }
}
