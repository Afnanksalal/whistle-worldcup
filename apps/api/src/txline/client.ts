import {
  Fixture,
  LiveScoreUpdate,
  MatchEvent,
  TXLINE_DEVNET,
  TXLINE_MAINNET,
  isFinalScoreRecord,
} from "@whistle/shared";
import { parseZonedTimestamp } from "../time";

export type TxlineConfig = {
  apiOrigin: string;
  guestJwt: string;
  apiToken: string;
};

const REQUEST_TIMEOUT_MS = Math.max(
  2_000,
  Number(process.env.TXLINE_REQUEST_TIMEOUT_MS || 8_000)
);

function headers(cfg: TxlineConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.guestJwt}`,
    "X-Api-Token": cfg.apiToken,
    Accept: "application/json",
  };
}

export function networkConfig(network: string) {
  return network === "mainnet" ? TXLINE_MAINNET : TXLINE_DEVNET;
}

export async function refreshGuestJwt(apiOrigin: string): Promise<string> {
  const res = await fetch(`${apiOrigin}/auth/guest/start`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`guest/start failed: ${res.status}`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("guest/start missing token");
  return data.token;
}

async function getJson<T>(url: string, cfg: TxlineConfig): Promise<T> {
  let res = await fetch(url, {
    headers: headers(cfg),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 401) {
    const jwt = await refreshGuestJwt(cfg.apiOrigin);
    cfg.guestJwt = jwt;
    res = await fetch(url, {
      headers: headers(cfg),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${url} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

function asArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["fixtures", "data", "items", "results", "scores", "odds"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return [];
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

const MIN_EVENT_TS = Date.UTC(2000, 0, 1);
const MAX_EVENT_TS = Date.UTC(2100, 0, 1);

export function normalizeEpochMs(value: unknown): number | null {
  let ms: number;

  if (typeof value === "string" && value.trim() && !Number.isFinite(Number(value))) {
    const timestamp = value.trim();
    const parsed = parseZonedTimestamp(timestamp);
    if (parsed === null) return null;
    ms = parsed;
  } else {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    ms = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
  }

  if (!Number.isFinite(ms) || !Number.isInteger(ms)) return null;
  if (ms < MIN_EVENT_TS || ms > MAX_EVENT_TS) return null;
  return ms;
}

function pickTimestamp(
  obj: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const timestamp = normalizeEpochMs(obj[key]);
    if (timestamp !== null) return timestamp;
  }
  return null;
}

function teamFrom(raw: unknown, fallback: string): Fixture["home"] {
  if (!raw || typeof raw !== "object") return { name: fallback };
  const o = raw as Record<string, unknown>;
  return {
    id: pickString(o, ["id", "teamId", "Id"]) ?? pickNumber(o, ["id", "teamId"]),
    name: pickString(o, ["name", "teamName", "Name", "shortName"]) ?? fallback,
    shortName: pickString(o, ["shortName", "abbr", "code"]),
    logo: pickString(o, ["logo", "logoUrl", "image"]),
  };
}

export function normalizeFixture(raw: unknown): Fixture | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = pickString(o, ["fixtureId", "id", "FixtureId", "fixture_id"]);
  if (!id) return null;

  const nestedHome = o.home ?? o.homeTeam ?? o.HomeTeam ?? o.team1;
  const nestedAway = o.away ?? o.awayTeam ?? o.AwayTeam ?? o.team2;

  let home: Fixture["home"];
  let away: Fixture["away"];

  const participant1 = pickString(o, ["Participant1", "participant1"]);
  const participant2 = pickString(o, ["Participant2", "participant2"]);

  if (nestedHome === undefined && nestedAway === undefined && participant1 && participant2) {
    // Native TxLINE payload: two participants plus a home/away flag.
    const p1: Fixture["home"] = {
      id: pickString(o, ["Participant1Id", "participant1Id"]),
      name: participant1,
    };
    const p2: Fixture["away"] = {
      id: pickString(o, ["Participant2Id", "participant2Id"]),
      name: participant2,
    };
    const p1IsHome = o.Participant1IsHome ?? o.participant1IsHome;
    if (p1IsHome === false) {
      home = p2;
      away = p1;
    } else {
      home = p1;
      away = p2;
    }
  } else {
    home = teamFrom(nestedHome, "Home");
    away = teamFrom(nestedAway, "Away");
  }

  const kickoff = pickTimestamp(o, [
      "kickoffTs",
      "kickoff",
      "startTs",
      "startTime",
      "StartTime",
      "ts",
      "scheduledTs",
    ]);
  // A fabricated "now" kickoff opens/closes markets at arbitrary times.
  if (kickoff === null) return null;

  const statusRaw = (pickString(o, ["status", "Status", "state"]) || "").toLowerCase();
  let status: Fixture["status"] = "scheduled";
  if (statusRaw.includes("live") || statusRaw.includes("inplay") || statusRaw.includes("progress")) {
    status = "live";
  } else if (statusRaw.includes("final") || statusRaw.includes("finished") || statusRaw.includes("ended")) {
    status = "finished";
  } else if (statusRaw.includes("postpon")) {
    status = "postponed";
  } else if (statusRaw.includes("cancel") || statusRaw.includes("abandon")) {
    status = "cancelled";
  }

  const homeScore = pickNumber(o, ["homeScore", "HomeScore", "scoreHome"]);
  const awayScore = pickNumber(o, ["awayScore", "AwayScore", "scoreAway"]);
  const nestedScore = o.score as Record<string, unknown> | undefined;
  const hs = homeScore ?? pickNumber(nestedScore || {}, ["home", "Home"]);
  const as = awayScore ?? pickNumber(nestedScore || {}, ["away", "Away"]);

  return {
    id,
    competition: pickString(o, ["competition", "Competition", "league", "competitionName"]),
    round: pickString(o, ["round", "Round", "stage"]),
    group: pickString(o, ["group", "Group", "groupName"]),
    kickoffTs: kickoff,
    status,
    home,
    away,
    score:
      hs !== undefined && as !== undefined
        ? { home: hs, away: as }
        : undefined,
    period: pickString(o, ["period", "Period"]) ?? pickNumber(o, ["period", "Period"]),
    venue: pickString(o, ["venue", "Venue", "stadium"]),
    raw,
  };
}

function teamSideFromParticipant(
  value: unknown
): "home" | "away" | undefined {
  if (typeof value === "number") {
    if (value === 1) return "home";
    if (value === 2) return "away";
  }
  const text = String(value || "").toLowerCase();
  if (!text) return undefined;
  if (
    text === "1" ||
    text === "home" ||
    text === "participant1" ||
    text === "team1" ||
    text.includes("home")
  ) {
    return "home";
  }
  if (
    text === "2" ||
    text === "away" ||
    text === "participant2" ||
    text === "team2" ||
    text.includes("away")
  ) {
    return "away";
  }
  return undefined;
}

function normalizeActionType(action: string): string {
  const a = action.toLowerCase().replace(/[\s-]+/g, "_");
  if (a.includes("yellow")) return "yellow_card";
  if (a.includes("red") && a.includes("card")) return "red_card";
  if (a.includes("corner")) return "corner";
  if (a.includes("substitut")) return "substitution";
  if (a.includes("penalty")) return "penalty";
  if (a === "goal" || a.includes("goal_scored") || a === "score") return "goal";
  if (a.includes("shot")) return "shot";
  if (a.includes("free_kick") || a.includes("freekick")) return "free_kick";
  if (a.includes("var")) return "var";
  if (a.includes("offside")) return "offside";
  return a || "event";
}

/** Extract MatchEvent(s) from a raw TxLINE soccer score record. */
export function extractScoreEvents(raw: unknown): MatchEvent[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const action = pickString(o, ["action", "Action", "event", "EventType", "type"]);
  const data =
    (o.Data as Record<string, unknown> | undefined) ||
    (o.data as Record<string, unknown> | undefined) ||
    (o.payload as Record<string, unknown> | undefined) ||
    {};
  const nestedEvents = asArray(o.events || o.Events || data.events);
  const out: MatchEvent[] = [];

  for (const item of nestedEvents) {
    if (!item || typeof item !== "object") continue;
    const ev = item as Record<string, unknown>;
    const type = normalizeActionType(
      pickString(ev, ["type", "Type", "action", "Action"]) || "event"
    );
    out.push({
      type,
      minute: pickNumber(ev, ["minute", "Minute", "clock", "Clock"]),
      team: teamSideFromParticipant(
        ev.participant ?? ev.Participant ?? ev.team ?? ev.Team
      ),
      player: pickString(ev, [
        "player",
        "Player",
        "playerName",
        "PlayerName",
        "PlayerFullName",
      ]),
      detail: pickString(ev, ["detail", "Detail", "text", "Text", "outcome", "Outcome"]),
    });
  }

  if (!action) return out;
  const type = normalizeActionType(action);
  // Skip pure status / heartbeat actions unless they carry player detail.
  const skip =
    type.includes("game_") ||
    type.includes("period_") ||
    type === "comment" ||
    type === "heartbeat";
  if (skip && !pickString(data, ["PlayerName", "playerName", "Player"])) {
    return out;
  }

  out.push({
    type,
    minute:
      pickNumber(data, ["Minute", "minute", "Clock", "clock"]) ??
      pickNumber(o, ["minute", "Minute", "clock", "Clock"]),
    team: teamSideFromParticipant(
      data.Participant ?? data.participant ?? data.Team ?? o.participant
    ),
    player: pickString(data, [
      "PlayerName",
      "playerName",
      "Player",
      "player",
      "PlayerFullName",
    ]),
    detail:
      pickString(data, ["Text", "text", "Outcome", "outcome", "Type", "FreeKickType"]) ||
      action,
  });
  return out;
}

export function normalizeScoreUpdate(raw: unknown): LiveScoreUpdate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fixtureId = pickString(o, ["fixtureId", "id", "FixtureId", "fixture_id"]);
  if (!fixtureId) return null;

  const homeScore =
    pickNumber(o, ["homeScore", "HomeScore", "scoreHome", "home"]) ??
    pickNumber((o.score as Record<string, unknown>) || {}, ["home", "Home"]);
  const awayScore =
    pickNumber(o, ["awayScore", "AwayScore", "scoreAway", "away"]) ??
    pickNumber((o.score as Record<string, unknown>) || {}, ["away", "Away"]);

  const statusId = pickNumber(o, ["statusId", "StatusId", "status_id"]);
  const action = pickString(o, ["action", "Action", "event"]);
  const period = pickString(o, ["period", "Period"]) ?? pickNumber(o, ["period", "Period"]);

  let status: Fixture["status"] = "unknown";
  const statusRaw = (pickString(o, ["status", "Status"]) || "").toLowerCase();
  if (statusRaw.includes("cancel") || statusRaw.includes("abandon")) {
    status = "cancelled";
  } else if (statusRaw.includes("postpon")) {
    status = "postponed";
  } else if (
    statusRaw.includes("final") ||
    statusRaw.includes("finished") ||
    isFinalScoreRecord({ action, statusId, period })
  ) {
    status = "finished";
  } else if (statusRaw.includes("schedul") || statusRaw.includes("pre")) {
    status = "scheduled";
  } else if (
    statusRaw.includes("live") ||
    statusRaw.includes("inplay") ||
    statusRaw.includes("progress") ||
    action?.toLowerCase().includes("score") ||
    action?.toLowerCase().includes("goal")
  ) {
    status = "live";
  }

  const scoreOptional = status === "cancelled" || status === "postponed";
  if (!scoreOptional && (homeScore === undefined || awayScore === undefined)) {
    return null;
  }

  const eventTs = pickTimestamp(o, ["ts", "timestamp", "Timestamp"]) ?? Date.now();
  const events = extractScoreEvents(raw);

  return {
    fixtureId,
    homeScore: homeScore ?? 0,
    awayScore: awayScore ?? 0,
    status,
    statusId,
    action,
    period,
    clock: pickString(o, ["clock", "Clock", "minute", "time"]),
    events: events.length ? events : undefined,
    ts: eventTs,
  };
}

export async function fetchFixtures(cfg: TxlineConfig): Promise<Fixture[]> {
  const paths = [
    `/api/fixtures`,
    `/api/fixtures/snapshot`,
    `/api/fixtures/current`,
  ];
  const errors: string[] = [];
  for (const p of paths) {
    try {
      const data = await getJson<unknown>(`${cfg.apiOrigin}${p}`, cfg);
      const fixtures = asArray(data)
        .map(normalizeFixture)
        .filter((f): f is Fixture => !!f);
      if (fixtures.length) return fixtures;
    } catch (e) {
      errors.push(String(e));
    }
  }
  throw new Error(`fixtures fetch failed: ${errors.join(" | ")}`);
}

export async function fetchScoresSnapshot(cfg: TxlineConfig): Promise<LiveScoreUpdate[]> {
  const paths = [`/api/scores`, `/api/scores/snapshot`, `/api/scores/current`];
  for (const p of paths) {
    try {
      const data = await getJson<unknown>(`${cfg.apiOrigin}${p}`, cfg);
      return asArray(data)
        .map(normalizeScoreUpdate)
        .filter((s): s is LiveScoreUpdate => !!s);
    } catch {
      // try next
    }
  }
  return [];
}

export async function fetchHistoricalScores(
  cfg: TxlineConfig,
  fixtureId: string
): Promise<unknown[]> {
  const paths = [
    `/api/scores/historical?fixtureId=${encodeURIComponent(fixtureId)}`,
    `/api/scores/by-fixture/${encodeURIComponent(fixtureId)}`,
    `/api/scores/fixture/${encodeURIComponent(fixtureId)}`,
  ];
  for (const p of paths) {
    try {
      const data = await getJson<unknown>(`${cfg.apiOrigin}${p}`, cfg);
      return asArray(data);
    } catch {
      // next
    }
  }
  return [];
}

export async function fetchStatValidationV2(
  cfg: TxlineConfig,
  fixtureId: string,
  seq: number | string,
  statKeys: Array<string | number> = [1, 2]
): Promise<unknown> {
  const keyList = statKeys.map(String).join(",");
  const queryShapes = [
    new URLSearchParams({
      fixtureId: String(fixtureId),
      seq: String(seq),
      statKeys: keyList,
    }),
    new URLSearchParams({
      fixtureId: String(fixtureId),
      seq: String(seq),
      statKey: keyList,
    }),
    new URLSearchParams({
      fixtureId: String(fixtureId),
      seq: String(seq),
      statKey: String(statKeys[0] ?? 1),
      statKey2: String(statKeys[1] ?? 2),
    }),
  ];
  const bases = ["/api/scores/stat-validation-v2", "/api/scores/stat-validation"];
  for (const base of bases) {
    for (const qs of queryShapes) {
      try {
        return await getJson(`${cfg.apiOrigin}${base}?${qs}`, cfg);
      } catch {
        // next shape
      }
    }
  }
  throw new Error(`stat-validation failed for fixture ${fixtureId}`);
}

export function sseUrl(cfg: TxlineConfig, channel: "scores" | "odds"): string {
  return `${cfg.apiOrigin}/api/${channel}/stream`;
}

export { headers as txlineHeaders };
