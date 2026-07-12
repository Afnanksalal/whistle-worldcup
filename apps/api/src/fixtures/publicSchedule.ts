import type { Fixture } from "@whistle/shared";
import { getLogger } from "../observability";

/**
 * Free public football schedule via TheSportsDB (no API key required).
 * Used when TxLINE credentials are placeholder / unreachable so the product stays alive.
 * This is NOT demo mode — real public match metadata from an open sports API.
 */
const TSDB = "https://www.thesportsdb.com/api/v1/json/123";

type TsdbEvent = {
  idEvent?: string;
  strEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strLeague?: string;
  strSeason?: string;
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

function kickoffTs(dateEvent?: string, strTime?: string): number {
  if (!dateEvent) return Date.now() + 3600_000;
  const t = (strTime || "12:00:00").slice(0, 8);
  const ms = Date.parse(`${dateEvent}T${t}Z`);
  return Number.isFinite(ms) ? ms : Date.now() + 3600_000;
}

function toFixture(ev: TsdbEvent): Fixture | null {
  if (!ev.idEvent || !ev.strHomeTeam || !ev.strAwayTeam) return null;
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
    kickoffTs: kickoffTs(ev.dateEvent, ev.strTime),
    status: statusFrom(ev.strStatus, hasScore),
    home: { name: ev.strHomeTeam, shortName: ev.strHomeTeam.slice(0, 3).toUpperCase() },
    away: { name: ev.strAwayTeam, shortName: ev.strAwayTeam.slice(0, 3).toUpperCase() },
    score: hasScore ? { home: homeScore!, away: awayScore! } : undefined,
    venue: ev.strVenue || undefined,
    raw: ev,
  };
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`TheSportsDB ${res.status} ${url}`);
  return res.json();
}

/** World Cup + major international windows from TheSportsDB free endpoint. */
export async function fetchPublicFixtures(): Promise<Fixture[]> {
  const log = getLogger().child({ module: "thesportsdb" });
  const urls = [
    // FIFA World Cup league id on TheSportsDB
    `${TSDB}/eventsseason.php?id=4429&s=2026`,
    `${TSDB}/eventsseason.php?id=4429&s=2022`,
    `${TSDB}/eventsnextleague.php?id=4429`,
    `${TSDB}/eventspastleague.php?id=4429`,
    // International friendlies / UEFA as density if WC empty
    `${TSDB}/eventsnextleague.php?id=4480`,
  ];

  const byId = new Map<string, Fixture>();
  for (const url of urls) {
    try {
      const data = (await getJson(url)) as { events?: TsdbEvent[] | null };
      for (const ev of data.events || []) {
        const f = toFixture(ev);
        if (f) byId.set(f.id, f);
      }
    } catch (err) {
      log.warn({ err, url }, "TheSportsDB fetch failed");
    }
  }

  let fixtures = [...byId.values()];
  if (!fixtures.length) {
    // Last-resort: search recent soccer events
    try {
      const data = (await getJson(`${TSDB}/searchevents.php?e=World_Cup`)) as {
        event?: TsdbEvent[] | null;
      };
      for (const ev of data.event || []) {
        const f = toFixture(ev);
        if (f) byId.set(f.id, f);
      }
      fixtures = [...byId.values()];
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
