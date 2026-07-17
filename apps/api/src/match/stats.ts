import type { Fixture, MatchEvent, MatchStats } from "@whistle/shared";
import { getState, mutate } from "../store";
import { getLogger } from "../observability";

const TSDB = "https://www.thesportsdb.com/api/v1/json/123";
function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const TSDB_REQUEST_TIMEOUT_MS = Math.min(
  30_000,
  Math.max(1_000, Math.floor(positiveEnv("TSDB_STATS_TIMEOUT_MS", 6_000)))
);
const TSDB_REQUESTS_PER_MINUTE = Math.min(
  20,
  Math.max(2, Math.floor(positiveEnv("TSDB_STATS_REQUESTS_PER_MIN", 18)))
);
const LIVE_PROVIDER_TTL_MS = 60_000;
const FINISHED_RETRY_TTL_MS = 30 * 60_000;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 30_000;
const MAX_RATE_LIMIT_BACKOFF_MS = 60_000;

type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; status?: number };

type ProviderPollState = {
  lastLiveAttemptAt?: number;
  lastFinishedAttemptAt?: number;
  finishedComplete?: boolean;
};

const requestWindow: number[] = [];
const providerPollState = new Map<string, ProviderPollState>();
const refreshesInFlight = new Map<string, Promise<MatchStats | null>>();
let providerBackoffUntil = 0;

function reserveProviderRequests(count: number, now = Date.now()): boolean {
  if (now < providerBackoffUntil) return false;
  while (requestWindow.length && now - requestWindow[0] >= 60_000) {
    requestWindow.shift();
  }
  if (requestWindow.length + count > TSDB_REQUESTS_PER_MINUTE) return false;
  for (let i = 0; i < count; i += 1) requestWindow.push(now);
  return true;
}

function retryAfterMs(raw: string | null, now = Date.now()): number {
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(MAX_RATE_LIMIT_BACKOFF_MS, Math.max(1_000, seconds * 1_000));
    }
    const retryAt = Date.parse(raw);
    if (Number.isFinite(retryAt)) {
      return Math.min(MAX_RATE_LIMIT_BACKOFF_MS, Math.max(1_000, retryAt - now));
    }
  }
  return DEFAULT_RATE_LIMIT_BACKOFF_MS;
}

async function fetchProviderJson<T>(
  path: string,
  eventId: string,
  fixtureId: string
): Promise<ProviderResult<T>> {
  const log = getLogger().child({ module: "stats", fixtureId });
  try {
    const res = await fetch(`${TSDB}/${path}?id=${encodeURIComponent(eventId)}`, {
      signal: AbortSignal.timeout(TSDB_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      if (res.status === 429) {
        const now = Date.now();
        const alreadyBackingOff = providerBackoffUntil > now;
        const backoffMs = retryAfterMs(res.headers.get("retry-after"), now);
        providerBackoffUntil = Math.max(providerBackoffUntil, now + backoffMs);
        if (!alreadyBackingOff) {
          log.warn({ backoffMs }, "TheSportsDB rate limited; stats polling paused");
        }
      }
      return { ok: false, status: res.status };
    }
    return { ok: true, value: (await res.json()) as T };
  } catch (err) {
    log.warn({ err }, "TheSportsDB stats request failed");
    return { ok: false };
  }
}

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

function applyEventCounters(
  stats: MatchStats,
  ev: MatchEvent,
  provider?: Partial<MatchStats>
) {
  if (!ev.team) return;
  const bump = (key: "yellowCards" | "redCards" | "corners") => {
    const cur = stats[key] || emptySide();
    cur[ev.team!] += 1;
    stats[key] = cur;
  };
  if (ev.type === "yellow_card" && !provider?.yellowCards) bump("yellowCards");
  if (ev.type === "red_card" && !provider?.redCards) bump("redCards");
  if (ev.type === "corner" && !provider?.corners) bump("corners");
}

function tsdbId(fixture: Fixture): string | null {
  if (fixture.id.startsWith("tsdb-")) return fixture.id.slice(5);
  const raw = fixture.raw as
    | { idEvent?: string; tsdbEventId?: string }
    | undefined;
  if (raw?.tsdbEventId) return String(raw.tsdbEventId);
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

async function fetchTimeline(
  eventId: string,
  fixtureId: string
): Promise<ProviderResult<MatchEvent[]>> {
  const response = await fetchProviderJson<{ timeline?: TimelineRow[] | null }>(
    "lookuptimeline.php",
    eventId,
    fixtureId
  );
  if (!response.ok) return response;
  const events: MatchEvent[] = [];
  for (const row of response.value.timeline || []) {
    const label = row.strTimeline || row.strEvent || row.strTimelineDetail || "event";
    events.push({
      type: classifyEvent(label),
      minute: row.intTime ? Number(row.intTime) : undefined,
      team: teamSide(row.strHomeAway),
      player: row.strPlayer || undefined,
      detail: row.strTimelineDetail || label,
    });
  }
  return {
    ok: true,
    value: events.sort((a, b) => (a.minute || 0) - (b.minute || 0)),
  };
}

async function fetchEventStats(
  eventId: string,
  fixtureId: string
): Promise<ProviderResult<Partial<MatchStats> & { found: boolean }>> {
  const response = await fetchProviderJson<{ eventstats?: EventStatRow[] | null }>(
    "lookupeventstats.php",
    eventId,
    fixtureId
  );
  if (!response.ok) return response;
  const rows = response.value.eventstats || [];
  if (!rows.length) return { ok: true, value: { found: false } };

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

  return { ok: true, value: { ...out, found: true } };
}

function cloneStats(stats: MatchStats): MatchStats {
  return {
    ...stats,
    possession: stats.possession ? { ...stats.possession } : undefined,
    shots: stats.shots ? { ...stats.shots } : undefined,
    shotsOnTarget: stats.shotsOnTarget ? { ...stats.shotsOnTarget } : undefined,
    corners: stats.corners ? { ...stats.corners } : undefined,
    fouls: stats.fouls ? { ...stats.fouls } : undefined,
    yellowCards: stats.yellowCards ? { ...stats.yellowCards } : undefined,
    redCards: stats.redCards ? { ...stats.redCards } : undefined,
    offsides: stats.offsides ? { ...stats.offsides } : undefined,
    events: stats.events.map((event) => ({ ...event })),
  };
}

function eventKey(event: MatchEvent): string {
  return `${event.minute}-${event.type}-${event.player}`;
}

function mergeEvents(stats: MatchStats, incoming: MatchEvent[]): MatchEvent[] {
  if (!incoming.length) return [];
  const seen = new Set(stats.events.map(eventKey));
  const added: MatchEvent[] = [];
  for (const event of incoming) {
    const key = eventKey(event);
    if (seen.has(key)) continue;
    const copy = { ...event };
    seen.add(key);
    stats.events.push(copy);
    added.push(copy);
  }
  if (added.length) {
    stats.events.sort((a, b) => (a.minute || 0) - (b.minute || 0));
  }
  return added;
}

function applyProviderStats(
  stats: MatchStats,
  provider: Partial<MatchStats> & { found: boolean }
) {
  if (provider.possession) stats.possession = provider.possession;
  if (provider.shots) stats.shots = provider.shots;
  if (provider.shotsOnTarget) stats.shotsOnTarget = provider.shotsOnTarget;
  if (provider.corners) stats.corners = provider.corners;
  if (provider.fouls) stats.fouls = provider.fouls;
  if (provider.yellowCards) stats.yellowCards = provider.yellowCards;
  if (provider.redCards) stats.redCards = provider.redCards;
  if (provider.offsides) stats.offsides = provider.offsides;
}

function providerRefreshDue(
  fixture: Fixture,
  state: ProviderPollState,
  now: number
): boolean {
  if (fixture.status === "live") {
    return !state.lastLiveAttemptAt || now - state.lastLiveAttemptAt >= LIVE_PROVIDER_TTL_MS;
  }
  if (fixture.status === "finished") {
    if (state.finishedComplete) return false;
    return (
      !state.lastFinishedAttemptAt ||
      now - state.lastFinishedAttemptAt >= FINISHED_RETRY_TTL_MS
    );
  }
  return false;
}

function markProviderAttempt(
  fixture: Fixture,
  state: ProviderPollState,
  now: number
) {
  if (fixture.status === "live") state.lastLiveAttemptAt = now;
  if (fixture.status === "finished") state.lastFinishedAttemptAt = now;
}

/** Build / refresh match statistics for a fixture from TheSportsDB stats + timeline (+ TxLINE events). */
async function refreshMatchStatsOnce(fixtureId: string): Promise<MatchStats | null> {
  const fixture = getState().fixtures[fixtureId];
  if (!fixture) return null;
  const now = Date.now();
  const id = tsdbId(fixture);
  const pollState = providerPollState.get(fixtureId) || {};
  let timelineResult: ProviderResult<MatchEvent[]> | undefined;
  let statsResult: ProviderResult<Partial<MatchStats> & { found: boolean }> | undefined;

  if (id && providerRefreshDue(fixture, pollState, now)) {
    // Timeline and match stats are a logical pair. Reserve both calls or make neither.
    if (reserveProviderRequests(2, now)) {
      markProviderAttempt(fixture, pollState, now);
      providerPollState.set(fixtureId, pollState);
      [timelineResult, statsResult] = await Promise.all([
        fetchTimeline(id, fixtureId),
        fetchEventStats(id, fixtureId),
      ]);
      if (fixture.status === "finished" && timelineResult.ok && statsResult.ok) {
        // A completed provider snapshot is immutable for the lifetime of this process.
        pollState.finishedComplete = true;
        providerPollState.set(fixtureId, pollState);
      }
    }
  }

  // Re-read after provider I/O so TxLINE events received in flight are not lost.
  const existing = getState().matchStats[fixtureId];
  const liveEvents = getState().live[fixtureId]?.events || [];
  const providerTimeline = timelineResult?.ok ? timelineResult.value : [];
  const providerStats =
    statsResult?.ok && statsResult.value.found ? statsResult.value : undefined;
  let stats: MatchStats;
  let changed = !existing;

  if (providerStats) {
    // Rebuild provider-owned counters so repeated live reads never accumulate totals.
    stats = {
      fixtureId,
      updatedAt: now,
      events: [],
      source: "thesportsdb",
    };
    mergeEvents(stats, providerTimeline.length ? providerTimeline : existing?.events || []);
    applyProviderStats(stats, providerStats);
    mergeEvents(stats, liveEvents);
    for (const event of stats.events) applyEventCounters(stats, event, providerStats);
    changed = true;
  } else {
    stats = existing
      ? cloneStats(existing)
      : { fixtureId, updatedAt: now, events: [], source: "pending" };
    const addedEvents: MatchEvent[] = [];

    if (providerTimeline.length) {
      addedEvents.push(...mergeEvents(stats, providerTimeline));
      if (stats.source !== "thesportsdb") {
        stats.source = "thesportsdb";
        changed = true;
      }
    }

    if (liveEvents.length) {
      addedEvents.push(...mergeEvents(stats, liveEvents));
      if (["pending", "waiting", "events"].includes(stats.source)) {
        stats.source = "txline";
        changed = true;
      }
    }

    if (addedEvents.length) {
      for (const event of addedEvents) applyEventCounters(stats, event);
      changed = true;
    }
  }

  if (stats.source === "pending") {
    stats.source = stats.events.length ? "events" : "waiting";
    changed = true;
  }

  if (!changed && existing) return existing;
  stats.updatedAt = Date.now();

  mutate((s) => {
    s.matchStats[fixtureId] = stats;
  }, "stats", stats);

  return stats;
}

export function refreshMatchStats(fixtureId: string): Promise<MatchStats | null> {
  const current = refreshesInFlight.get(fixtureId);
  if (current) return current;
  const refresh = refreshMatchStatsOnce(fixtureId).finally(() => {
    if (refreshesInFlight.get(fixtureId) === refresh) {
      refreshesInFlight.delete(fixtureId);
    }
  });
  refreshesInFlight.set(fixtureId, refresh);
  return refresh;
}

export async function refreshLiveFixtureStats() {
  const fixtures = Object.values(getState().fixtures);
  const now = Date.now();
  const ordered = [
    ...fixtures.filter((f) => f.status === "live").slice(0, 6),
    ...fixtures
      .filter(
        (f) =>
          f.status === "finished" &&
          Boolean(tsdbId(f)) &&
          providerRefreshDue(f, providerPollState.get(f.id) || {}, now)
      )
      .sort((a, b) => b.kickoffTs - a.kickoffTs)
      .slice(0, 4),
  ];
  for (const f of ordered.slice(0, 10)) {
    await refreshMatchStats(f.id).catch(() => undefined);
  }
}

export function getMatchStats(fixtureId: string): MatchStats | null {
  return getState().matchStats[fixtureId] || null;
}
