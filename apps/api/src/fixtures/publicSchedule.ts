import type { Fixture } from "@whistle/shared";
import { getLogger } from "../observability";
import { parseZonedTimestamp } from "../time";

/**
 * Free public football schedule via TheSportsDB (no API key required).
 * Used when TxLINE credentials are placeholder / unreachable so the product stays alive.
 * This is NOT demo mode — real public match metadata from an open sports API.
 */
const TSDB = "https://www.thesportsdb.com/api/v1/json/123";

export type TsdbEvent = {
  idEvent?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  strEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  strLeague?: string;
  strSeason?: string;
  strTimestamp?: string;
  dateEvent?: string;
  strTime?: string;
  strStatus?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strGroup?: string;
  strRound?: string;
  strVenue?: string;
};

function statusFrom(raw?: string, hasScore?: boolean): Fixture["status"] {
  const s = (raw || "").toLowerCase();
  if (s.includes("match finished") || s === "ft" || s.includes("finished")) return "finished";
  if (s.includes("not started") || s.includes("ns") || !s) {
    return hasScore ? "finished" : "scheduled";
  }
  if (s.includes("live") || s.includes("in play") || s.includes("1h") || s.includes("2h") || s.includes("ht")) {
    return "live";
  }
  if (s.includes("postpon")) return "postponed";
  if (s.includes("cancel")) return "cancelled";
  return hasScore ? "finished" : "scheduled";
}

function validUtcDate(
  ms: number,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): boolean {
  const parsed = new Date(ms);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    parsed.getUTCHours() === hour &&
    parsed.getUTCMinutes() === minute &&
    parsed.getUTCSeconds() === second
  );
}

function kickoffTs(event: TsdbEvent): number | null {
  const timestamp = event.strTimestamp?.trim();
  if (timestamp) {
    const ms = parseZonedTimestamp(timestamp);
    if (ms !== null) return ms;
  }

  const date = event.dateEvent?.trim();
  const time = event.strTime?.trim();
  const dateParts = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeParts = time?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (!dateParts || !timeParts) return null;

  const [, yearText, monthText, dayText] = dateParts;
  const [, hourText, minuteText, secondText = "0"] = timeParts;
  const values = [yearText, monthText, dayText, hourText, minuteText, secondText].map(
    Number
  );
  const [year, month, day, hour, minute, second] = values;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  return validUtcDate(ms, year, month, day, hour, minute, second) ? ms : null;
}

export function publicEventToFixture(ev: TsdbEvent): Fixture | null {
  if (!ev.idEvent || !ev.strHomeTeam || !ev.strAwayTeam) return null;
  const kickoff = kickoffTs(ev);
  if (kickoff === null) return null;
  const homeScore =
    ev.intHomeScore != null && ev.intHomeScore !== "" ? Number(ev.intHomeScore) : undefined;
  const awayScore =
    ev.intAwayScore != null && ev.intAwayScore !== "" ? Number(ev.intAwayScore) : undefined;
  const hasScore =
    homeScore !== undefined &&
    awayScore !== undefined &&
    !Number.isNaN(homeScore) &&
    !Number.isNaN(awayScore);

  return {
    id: `tsdb-${ev.idEvent}`,
    competition: ev.strLeague || "International",
    round: ev.strRound || undefined,
    group: ev.strGroup || undefined,
    kickoffTs: kickoff,
    status: statusFrom(ev.strStatus, hasScore),
    home: {
      id: ev.idHomeTeam || undefined,
      name: ev.strHomeTeam,
      shortName: ev.strHomeTeam.slice(0, 3).toUpperCase(),
      logo: ev.strHomeTeamBadge || undefined,
    },
    away: {
      id: ev.idAwayTeam || undefined,
      name: ev.strAwayTeam,
      shortName: ev.strAwayTeam.slice(0, 3).toUpperCase(),
      logo: ev.strAwayTeamBadge || undefined,
    },
    score: hasScore ? { home: homeScore!, away: awayScore! } : undefined,
    venue: ev.strVenue || undefined,
    raw: ev,
  };
}

export function isCurrentWorldCupPublicFixture(
  fixture: Fixture,
  currentYear = new Date().getUTCFullYear()
): boolean {
  return (
    fixture.id.startsWith("tsdb-") &&
    (fixture.competition || "").toLowerCase().includes("world cup") &&
    new Date(fixture.kickoffTs).getUTCFullYear() === currentYear
  );
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`TheSportsDB ${res.status} ${url}`);
  return res.json();
}

/** Current World Cup fixtures from TheSportsDB's free endpoint. */
export async function fetchPublicFixtures(): Promise<Fixture[]> {
  const log = getLogger().child({ module: "thesportsdb" });
  const urls = [
    // FIFA World Cup league id on TheSportsDB
    `${TSDB}/eventsseason.php?id=4429&s=2026`,
    `${TSDB}/eventsnextleague.php?id=4429`,
    `${TSDB}/eventspastleague.php?id=4429`,
  ];

  const byId = new Map<string, Fixture>();
  const batches = await Promise.allSettled(
    urls.map(async (url) => ({
      url,
      data: (await getJson(url)) as { events?: TsdbEvent[] | null },
    }))
  );
  for (const batch of batches) {
    if (batch.status === "rejected") {
      log.warn({ err: batch.reason }, "TheSportsDB fetch failed");
      continue;
    }
    for (const ev of batch.value.data.events || []) {
      const f = publicEventToFixture(ev);
      if (f) byId.set(f.id, f);
    }
  }

  let fixtures = [...byId.values()].filter((fixture) =>
    isCurrentWorldCupPublicFixture(fixture)
  );
  if (!fixtures.length) {
    // Last-resort: search recent soccer events
    try {
      const data = (await getJson(`${TSDB}/searchevents.php?e=World_Cup`)) as {
        event?: TsdbEvent[] | null;
      };
      for (const ev of data.event || []) {
        const f = publicEventToFixture(ev);
        if (f) byId.set(f.id, f);
      }
      fixtures = [...byId.values()].filter((fixture) =>
        isCurrentWorldCupPublicFixture(fixture)
      );
    } catch (err) {
      log.warn({ err }, "TheSportsDB search failed");
    }
  }

  fixtures.sort((a, b) => a.kickoffTs - b.kickoffTs);
  log.info({ count: fixtures.length }, "loaded public fixtures");
  if (!fixtures.length) {
    throw new Error("TheSportsDB returned no fixtures");
  }
  return fixtures.slice(0, 80);
}
