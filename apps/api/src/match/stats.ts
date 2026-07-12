import type { Fixture, MatchEvent, MatchStats } from "@whistle/shared";
import { getState, mutate } from "../store";
import { getLogger } from "../observability";

const TSDB = "https://www.thesportsdb.com/api/v1/json/123";

type TimelineRow = {
  strTimeline?: string;
  strTimelineDetail?: string;
  strPlayer?: string;
  strEvent?: string;
  intTime?: string;
  strHomeAway?: string;
};

type EventStatRow = {
  strStat?: string;
  intHome?: string;
  intAway?: string;
};

function emptySide() {
  return { home: 0, away: 0 };
}

function sidePair(home: number, away: number) {
  return { home, away };
}

function teamSide(raw?: string): "home" | "away" | undefined {
  const s = (raw || "").toLowerCase();
  if (s.startsWith("h") || s === "home") return "home";
  if (s.startsWith("a") || s === "away") return "away";
  return undefined;
}

function classifyEvent(label: string): string {
  const t = label.toLowerCase();
  if (t.includes("goal") && !t.includes("own")) return "goal";
  if (t.includes("own goal")) return "own_goal";
  if (t.includes("penalty")) return "penalty";
  if (t.includes("yellow")) return "yellow_card";
  if (t.includes("red")) return "red_card";
  if (t.includes("subst")) return "substitution";
  if (t.includes("var")) return "var";
  if (t.includes("corner")) return "corner";
  return label || "event";
}

function applyEventCounters(stats: MatchStats, ev: MatchEvent) {
  if (!ev.team) return;
  const bump = (key: "yellowCards" | "redCards" | "corners") => {
    const cur = stats[key] || emptySide();
    cur[ev.team!] += 1;
    stats[key] = cur;
  };
  if (ev.type === "yellow_card") bump("yellowCards");
  if (ev.type === "red_card") bump("redCards");
  if (ev.type === "corner") bump("corners");
}

function tsdbId(fixture: Fixture): string | null {
  if (fixture.id.startsWith("tsdb-")) return fixture.id.slice(5);
  const raw = fixture.raw as { idEvent?: string } | undefined;
  return raw?.idEvent ? String(raw.idEvent) : null;
}

function parseIntSafe(v?: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function matchStatName(name: string): keyof MatchStats | "shotsOff" | "blocked" | null {
  const n = name.toLowerCase().replace(/\s+/g, " ").trim();
  if (n === "ball possession" || n === "possession" || n.includes("possession")) return "possession";
  if (n === "total shots" || n === "shots") return "shots";
  if (n === "shots on goal" || n === "shots on target" || n.includes("on target") || n.includes("on goal"))
    return "shotsOnTarget";
  if (n === "corner kicks" || n === "corners" || n.includes("corner")) return "corners";
  if (n === "fouls" || n.includes("foul")) return "fouls";
  if (n.includes("yellow")) return "yellowCards";
  if (n.includes("red")) return "redCards";
  if (n.includes("offside")) return "offsides";
  return null;
}

async function fetchTimeline(eventId: string): Promise<MatchEvent[]> {
  const res = await fetch(`${TSDB}/lookuptimeline.php?id=${encodeURIComponent(eventId)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { timeline?: TimelineRow[] | null };
  const events: MatchEvent[] = [];
  for (const row of data.timeline || []) {
    const label = row.strTimeline || row.strEvent || row.strTimelineDetail || "event";
    events.push({
      type: classifyEvent(label),
      minute: row.intTime ? Number(row.intTime) : undefined,
      team: teamSide(row.strHomeAway),
      player: row.strPlayer || undefined,
      detail: row.strTimelineDetail || label,
    });
  }
  return events.sort((a, b) => (a.minute || 0) - (b.minute || 0));
}

async function fetchEventStats(eventId: string): Promise<Partial<MatchStats> & { found: boolean }> {
  const res = await fetch(`${TSDB}/lookupeventstats.php?id=${encodeURIComponent(eventId)}`);
  if (!res.ok) return { found: false };
  const data = (await res.json()) as { eventstats?: EventStatRow[] | null };
  const rows = data.eventstats || [];
  if (!rows.length) return { found: false };

  const out: Partial<MatchStats> = {};
  let shotsOffHome = 0;
  let shotsOffAway = 0;
  let blockedHome = 0;
  let blockedAway = 0;

  for (const row of rows) {
    const key = matchStatName(row.strStat || "");
    const home = parseIntSafe(row.intHome);
    const away = parseIntSafe(row.intAway);
    const label = (row.strStat || "").toLowerCase();
    if (label.includes("shots off")) {
      shotsOffHome = home;
      shotsOffAway = away;
      continue;
    }
    if (label.includes("blocked")) {
      blockedHome = home;
      blockedAway = away;
      continue;
    }
    if (!key || key === "shotsOff" || key === "blocked") continue;
    out[key] = sidePair(home, away) as never;
  }

  // Compose total shots if provider only gave on/off/blocked
  if (!out.shots && (out.shotsOnTarget || shotsOffHome || shotsOffAway || blockedHome || blockedAway)) {
    out.shots = sidePair(
      (out.shotsOnTarget?.home || 0) + shotsOffHome + blockedHome,
      (out.shotsOnTarget?.away || 0) + shotsOffAway + blockedAway
    );
  }

  return { ...out, found: true };
}

/** Build / refresh match statistics for a fixture from TheSportsDB stats + timeline (+ TxLINE events). */
export async function refreshMatchStats(fixtureId: string): Promise<MatchStats | null> {
  const fixture = getState().fixtures[fixtureId];
  if (!fixture) return null;
  const live = getState().live[fixtureId];
  const log = getLogger().child({ module: "stats" });

  const stats: MatchStats = {
    fixtureId,
    updatedAt: Date.now(),
    events: [...(live?.events || [])],
    source: "pending",
  };

  const id = tsdbId(fixture);
  let gotProviderStats = false;

  if (id) {
    try {
      const [timeline, provider] = await Promise.all([fetchTimeline(id), fetchEventStats(id)]);
      if (timeline.length) {
        stats.events = timeline;
        stats.source = "thesportsdb";
      }
      if (provider.found) {
        gotProviderStats = true;
        stats.source = "thesportsdb";
        if (provider.possession) stats.possession = provider.possession;
        if (provider.shots) stats.shots = provider.shots;
        if (provider.shotsOnTarget) stats.shotsOnTarget = provider.shotsOnTarget;
        if (provider.corners) stats.corners = provider.corners;
        if (provider.fouls) stats.fouls = provider.fouls;
        if (provider.yellowCards) stats.yellowCards = provider.yellowCards;
        if (provider.redCards) stats.redCards = provider.redCards;
        if (provider.offsides) stats.offsides = provider.offsides;
      }
    } catch (err) {
      log.warn({ err, fixtureId }, "stats/timeline fetch failed");
    }
  }

  // Merge TxLINE live events if present
  if (live?.events?.length) {
    const seen = new Set(stats.events.map((e) => `${e.minute}-${e.type}-${e.player}`));
    for (const e of live.events) {
      const k = `${e.minute}-${e.type}-${e.player}`;
      if (!seen.has(k)) stats.events.push(e);
    }
    stats.events.sort((a, b) => (a.minute || 0) - (b.minute || 0));
    if (stats.source === "pending") stats.source = "txline";
  }

  // Card/corner counts from event tape when provider didn't publish them
  for (const ev of stats.events) applyEventCounters(stats, ev);

  if (!gotProviderStats && stats.source === "pending") {
    stats.source = stats.events.length ? "events" : "waiting";
  }

  mutate((s) => {
    s.matchStats[fixtureId] = stats;
  }, "stats", stats);

  return stats;
}

export async function refreshLiveFixtureStats() {
  const fixtures = Object.values(getState().fixtures).filter(
    (f) => f.status === "live" || f.status === "finished" || f.status === "scheduled"
  );
  const ordered = [
    ...fixtures.filter((f) => f.status === "live"),
    ...fixtures.filter((f) => f.status === "scheduled").slice(0, 8),
    ...fixtures.filter((f) => f.status === "finished").slice(0, 6),
  ];
  for (const f of ordered.slice(0, 16)) {
    await refreshMatchStats(f.id).catch(() => undefined);
  }
}

export function getMatchStats(fixtureId: string): MatchStats | null {
  return getState().matchStats[fixtureId] || null;
}
