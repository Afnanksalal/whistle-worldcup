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

/** Home/away goals from native TxLINE Score / Stats payloads. */
export function pickTxlineGoals(raw: Record<string, unknown>): {
  home?: number;
  away?: number;
} {
  const stats = (raw.Stats ?? raw.stats) as Record<string, unknown> | undefined;
  const score = (raw.Score ?? raw.score) as Record<string, unknown> | undefined;

  let p1 = stats ? pickNumber(stats, ["1"]) : undefined;
  let p2 = stats ? pickNumber(stats, ["2"]) : undefined;

  if (score) {
    const p1Node = (score.Participant1 ?? score.participant1) as
      | Record<string, unknown>
      | undefined;
    const p2Node = (score.Participant2 ?? score.participant2) as
      | Record<string, unknown>
      | undefined;
    const p1Total = (p1Node?.Total ?? p1Node?.total ?? p1Node) as
      | Record<string, unknown>
      | undefined;
    const p2Total = (p2Node?.Total ?? p2Node?.total ?? p2Node) as
      | Record<string, unknown>
      | undefined;
    p1 = p1 ?? pickNumber(p1Total || {}, ["Goals", "goals"]);
    p2 = p2 ?? pickNumber(p2Total || {}, ["Goals", "goals"]);
  }

  if (p1 === undefined && p2 === undefined) return {};
  const p1IsHome = raw.Participant1IsHome ?? raw.participant1IsHome;
  if (p1IsHome === false) return { home: p2, away: p1 };
  return { home: p1, away: p2 };
}

function utcEpochDay(ms = Date.now()): number {
  return Math.floor(ms / 86_400_000);
}

/** Comma-separated competition ids; default World Cup (72). Use * for all. */
export function txlineCompetitionIds(): string[] | null {
  const raw = (process.env.TXLINE_COMPETITION_IDS ?? "72").trim();
  if (!raw || raw === "*") return null;
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Days to walk `startEpochDay` backward so finished WC fixtures stay on the board. */
export function txlineFixtureLookbackDays(): number {
  const n = Number(process.env.TXLINE_FIXTURE_LOOKBACK_DAYS ?? 50);
  if (!Number.isFinite(n) || n < 0) return 50;
  return Math.min(Math.floor(n), 180);
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

  const statusRaw = (pickString(o, ["status", "Status", "state", "GameState"]) || "").toLowerCase();
  const gameState = pickNumber(o, ["GameState", "gameState", "game_state"]);
  let status: Fixture["status"] = "scheduled";
  if (statusRaw.includes("live") || statusRaw.includes("inplay") || statusRaw.includes("progress") || gameState === 2) {
    status = "live";
  } else if (
    statusRaw.includes("final") ||
    statusRaw.includes("finished") ||
    statusRaw.includes("ended") ||
    gameState === 3
  ) {
    status = "finished";
  } else if (statusRaw.includes("postpon")) {
    status = "postponed";
  } else if (statusRaw.includes("cancel") || statusRaw.includes("abandon")) {
    status = "cancelled";
  } else if (
    // TxLINE free-tier snapshots often omit status for completed WC matches.
    status === "scheduled" &&
    kickoff + 2.5 * 60 * 60 * 1000 < Date.now()
  ) {
    status = "finished";
  }

  const homeScore = pickNumber(o, ["homeScore", "HomeScore", "scoreHome"]);
  const awayScore = pickNumber(o, ["awayScore", "AwayScore", "scoreAway"]);
  const nestedScore = o.score as Record<string, unknown> | undefined;
  const fromTxline = pickTxlineGoals(o);
  const hs =
    homeScore ??
    pickNumber(nestedScore || {}, ["home", "Home"]) ??
    fromTxline.home;
  const as =
    awayScore ??
    pickNumber(nestedScore || {}, ["away", "Away"]) ??
    fromTxline.away;

  const fixtureGroupIdRaw =
    pickString(o, ["fixtureGroupId", "FixtureGroupId"]) ??
    pickNumber(o, ["fixtureGroupId", "FixtureGroupId"]);

  return {
    id,
    competition: pickString(o, ["competition", "Competition", "league", "competitionName"]),
    round: pickString(o, ["round", "Round", "stage"]),
    group: pickString(o, ["group", "Group", "groupName"]),
    fixtureGroupId:
      fixtureGroupIdRaw === undefined || fixtureGroupIdRaw === null
        ? undefined
        : String(fixtureGroupIdRaw),
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
  value: unknown,
  participant1IsHome: boolean | undefined = true
): "home" | "away" | undefined {
  const p1Home = participant1IsHome !== false;
  if (typeof value === "number") {
    if (value === 1) return p1Home ? "home" : "away";
    if (value === 2) return p1Home ? "away" : "home";
  }
  const text = String(value || "").toLowerCase();
  if (!text) return undefined;
  if (text === "1" || text === "participant1" || text === "team1") {
    return p1Home ? "home" : "away";
  }
  if (text === "2" || text === "participant2" || text === "team2") {
    return p1Home ? "away" : "home";
  }
  if (text === "home" || text.includes("home")) return "home";
  if (text === "away" || text.includes("away")) return "away";
  return undefined;
}

function normalizeActionType(action: string): string {
  const a = action.toLowerCase().replace(/[\s-]+/g, "_");
  if (a.includes("yellow")) return "yellow_card";
  if (a.includes("red") && a.includes("card")) return "red_card";
  if (a.includes("corner")) return "corner";
  if (a.includes("substitut")) return "substitution";
  if (a === "penalty_outcome") return "penalty";
  if (a.includes("penalty")) return "penalty";
  if (a === "goal" || a.includes("goal_scored") || a === "score") return "goal";
  if (a.includes("shot")) return "shot";
  if (a.includes("free_kick") || a.includes("freekick")) return "free_kick";
  if (a.includes("var")) return "var";
  if (a.includes("offside")) return "offside";
  if (a.includes("injur")) return "injury";
  return a || "event";
}

/** TxLINE sends "Surname, Forename" — normalize to "Forename Surname" for UI. */
export function formatPlayerDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes(",")) return trimmed;
  const [last, ...rest] = trimmed.split(",").map((part) => part.trim());
  const first = rest.join(" ").trim();
  return first && last ? `${first} ${last}` : trimmed;
}

/** Walk a TxLINE lineups / players payload for normativeId → display name. */
export function extractPlayerDirectory(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (node: unknown, depth: number) => {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const id =
      pickNumber(o, ["normativeId", "NormativeId", "playerId", "PlayerId", "id"]) ??
      (o.player && typeof o.player === "object"
        ? pickNumber(o.player as Record<string, unknown>, [
            "normativeId",
            "NormativeId",
            "playerId",
            "PlayerId",
            "id",
          ])
        : undefined);
    const nameRaw =
      pickString(o, ["preferredName", "PreferredName", "displayName", "name"]) ||
      (o.player && typeof o.player === "object"
        ? pickString(o.player as Record<string, unknown>, [
            "preferredName",
            "PreferredName",
            "displayName",
            "name",
          ])
        : undefined);
    if (id != null && nameRaw) {
      // Skip team-level labels accidentally picked up as players.
      const name = formatPlayerDisplayName(nameRaw);
      if (name && !/^(france|england|home|away)$/i.test(name)) {
        out[String(id)] = name;
      }
    }
    for (const value of Object.values(o)) visit(value, depth + 1);
  };
  visit(raw, 0);
  return out;
}

export function resolvePlayerName(
  directory: Record<string, string> | undefined,
  ...ids: Array<number | string | undefined | null>
): string | undefined {
  if (!directory) return undefined;
  for (const id of ids) {
    if (id == null || id === "") continue;
    const name = directory[String(id)];
    if (name) return name;
  }
  return undefined;
}

/** Parse TxLINE Clock `{ Running, Seconds }` or plain minute fields. */
export function extractClockSeconds(raw: unknown): number | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const clock = o.Clock ?? o.clock;
  if (clock && typeof clock === "object") {
    const seconds = pickNumber(clock as Record<string, unknown>, [
      "Seconds",
      "seconds",
      "Value",
      "value",
    ]);
    if (seconds != null) return seconds;
  }
  // Only true elapsed seconds — never Data.Minute (already a minute value).
  return (
    pickNumber(o, ["clockSeconds", "ClockSeconds"]) ??
    pickNumber((o.Data as Record<string, unknown>) || {}, ["Seconds", "seconds"])
  );
}

export function clockSecondsToMinute(seconds: number | undefined): number | undefined {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.min(120, Math.floor(seconds / 60));
}

function playerIdsFromData(data: Record<string, unknown>): {
  playerId?: number;
  playerInId?: number;
  playerOutId?: number;
} {
  return {
    playerId: pickNumber(data, ["PlayerId", "playerId", "Player", "player"]),
    playerInId: pickNumber(data, ["PlayerInId", "playerInId", "PlayerIn"]),
    playerOutId: pickNumber(data, ["PlayerOutId", "playerOutId", "PlayerOut"]),
  };
}

/** Extract MatchEvent(s) from a raw TxLINE soccer score record. */
export function extractScoreEvents(
  raw: unknown,
  directory?: Record<string, string>
): MatchEvent[] {
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
  const minuteFromClock = clockSecondsToMinute(extractClockSeconds(o));
  const p1IsHome = (o.Participant1IsHome ??
    o.participant1IsHome ??
    data.Participant1IsHome ??
    data.participant1IsHome) as boolean | undefined;

  for (const item of nestedEvents) {
    if (!item || typeof item !== "object") continue;
    const ev = item as Record<string, unknown>;
    const type = normalizeActionType(
      pickString(ev, ["type", "Type", "action", "Action"]) || "event"
    );
    const ids = playerIdsFromData(ev);
    const playerId = ids.playerId ?? ids.playerInId;
    out.push({
      type,
      minute:
        pickNumber(ev, ["minute", "Minute"]) ??
        clockSecondsToMinute(extractClockSeconds(ev)) ??
        minuteFromClock,
      team: teamSideFromParticipant(
        ev.participant ?? ev.Participant ?? ev.team ?? ev.Team,
        p1IsHome
      ),
      player:
        pickString(ev, [
          "player",
          "Player",
          "playerName",
          "PlayerName",
          "PlayerFullName",
        ]) ||
        resolvePlayerName(directory, ids.playerId, ids.playerInId),
      playerId: playerId != null ? String(playerId) : undefined,
      detail: pickString(ev, ["detail", "Detail", "text", "Text", "outcome", "Outcome"]),
    });
  }

  if (!action) return out;
  const type = normalizeActionType(action);
  // Meta / heartbeat / lineup roster rows are handled separately.
  const skip =
    type.includes("game_") ||
    type.includes("period_") ||
    type === "comment" ||
    type === "heartbeat" ||
    type === "lineups" ||
    type === "players_on_the_pitch" ||
    type === "players_warming_up" ||
    type === "jersey" ||
    type === "pitch" ||
    type === "venue" ||
    type === "weather" ||
    type === "coverage_update" ||
    type === "connected" ||
    type === "kickoff_team";
  const ids = playerIdsFromData(data);
  const named =
    pickString(data, ["PlayerName", "playerName", "Player", "PlayerFullName"]) ||
    resolvePlayerName(directory, ids.playerId, ids.playerInId);
  if (skip && !named && !ids.playerId && !ids.playerInId) {
    return out;
  }

  const playerOut = resolvePlayerName(directory, ids.playerOutId);
  const playerIn = resolvePlayerName(directory, ids.playerInId);
  const detailParts = [
    pickString(data, [
      "Text",
      "text",
      "Outcome",
      "outcome",
      "GoalType",
      "Type",
      "FreeKickType",
    ]),
    type === "substitution" && playerOut
      ? `on for ${playerOut}`
      : type === "substitution" && ids.playerOutId
        ? `on for #${ids.playerOutId}`
        : undefined,
  ].filter(Boolean);

  const primaryId = ids.playerId ?? ids.playerInId;
  out.push({
    type,
    minute:
      pickNumber(data, ["Minute", "minute"]) ??
      minuteFromClock ??
      pickNumber(o, ["minute", "Minute"]),
    team: teamSideFromParticipant(
      data.Participant ??
        data.participant ??
        data.Team ??
        o.Participant ??
        o.participant,
      p1IsHome
    ),
    player: named || playerIn,
    playerId: primaryId != null ? String(primaryId) : undefined,
    detail: detailParts.length ? detailParts.join(" · ") : action,
  });
  return out;
}

export function normalizeScoreUpdate(raw: unknown): LiveScoreUpdate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fixtureId = pickString(o, ["fixtureId", "id", "FixtureId", "fixture_id"]);
  if (!fixtureId) return null;

  const playerDirectory = extractPlayerDirectory(raw);
  const hasDirectory = Object.keys(playerDirectory).length > 0;

  const txlineGoals = pickTxlineGoals(o);
  const homeScore =
    pickNumber(o, ["homeScore", "HomeScore", "scoreHome", "home"]) ??
    pickNumber((o.score as Record<string, unknown>) || {}, ["home", "Home"]) ??
    txlineGoals.home;
  const awayScore =
    pickNumber(o, ["awayScore", "AwayScore", "scoreAway", "away"]) ??
    pickNumber((o.score as Record<string, unknown>) || {}, ["away", "Away"]) ??
    txlineGoals.away;

  const statusId = pickNumber(o, ["statusId", "StatusId", "status_id"]);
  const action = pickString(o, ["action", "Action", "event"]);
  const period = pickString(o, ["period", "Period"]) ?? pickNumber(o, ["period", "Period"]);
  const actionLower = (action || "").toLowerCase();

  let status: Fixture["status"] = "unknown";
  const statusRaw = (pickString(o, ["status", "Status", "GameState"]) || "").toLowerCase();
  const looksInPlay =
    statusRaw.includes("live") ||
    statusRaw.includes("inplay") ||
    statusRaw.includes("progress") ||
    // Native soccer statusId: 1 ≈ pre-match, 100 ≈ final; 2–99 are in-play phases.
    (statusId != null && statusId > 1 && statusId < 100) ||
    actionLower.includes("score") ||
    actionLower.includes("goal") ||
    actionLower.includes("kickoff") ||
    actionLower.includes("possession") ||
    actionLower.includes("penalty") ||
    actionLower.includes("substitut") ||
    actionLower.includes("card") ||
    actionLower.includes("corner") ||
    actionLower.includes("var") ||
    actionLower.includes("injur") ||
    actionLower.includes("shot");
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
  } else if (looksInPlay) {
    // TxLINE often stamps GameState="scheduled" on every live soccer row.
    status = "live";
  } else if (statusRaw.includes("schedul") || statusRaw.includes("pre")) {
    status = "scheduled";
  }

  const scoreOptional =
    status === "cancelled" ||
    status === "postponed" ||
    // Lineup / meta rows omit Stats goals — keep prior score in ingest.
    (homeScore === undefined && awayScore === undefined && hasDirectory) ||
    (homeScore === undefined &&
      awayScore === undefined &&
      (actionLower === "lineups" ||
        actionLower === "players_on_the_pitch" ||
        actionLower === "players_warming_up"));

  if (!scoreOptional && (homeScore === undefined || awayScore === undefined)) {
    return null;
  }

  const eventTs =
    pickTimestamp(o, ["ts", "timestamp", "Timestamp", "Ts"]) ?? Date.now();
  const clockSeconds = extractClockSeconds(o);
  const minute = clockSecondsToMinute(clockSeconds);
  const events = extractScoreEvents(raw, hasDirectory ? playerDirectory : undefined);

  const scoreOmitted = homeScore === undefined || awayScore === undefined;
  return {
    fixtureId,
    homeScore: homeScore ?? 0,
    awayScore: awayScore ?? 0,
    status,
    statusId,
    action,
    period,
    clock:
      minute != null
        ? String(minute)
        : pickString(o, ["minute", "time"]) ||
          (typeof o.Clock === "string" ? o.Clock : undefined) ||
          (typeof o.clock === "string" ? o.clock : undefined),
    clockSeconds,
    events: events.length ? events : undefined,
    playerDirectory: hasDirectory ? playerDirectory : undefined,
    scoreOmitted: scoreOmitted || undefined,
    ts: eventTs,
  };
}

/** Prefer the official final row; otherwise the latest row that carries goals. */
export function pickBestScoreRecord(records: unknown[]): unknown | null {
  const list = records.filter((item) => item && typeof item === "object");
  if (!list.length) return null;

  for (const item of list) {
    const o = item as Record<string, unknown>;
    const action = pickString(o, ["action", "Action", "event"]);
    const statusId = pickNumber(o, ["statusId", "StatusId", "status_id"]);
    const period =
      pickString(o, ["period", "Period"]) ?? pickNumber(o, ["period", "Period"]);
    if (isFinalScoreRecord({ action, statusId, period })) return item;
  }

  for (let i = list.length - 1; i >= 0; i -= 1) {
    const goals = pickTxlineGoals(list[i] as Record<string, unknown>);
    if (goals.home !== undefined && goals.away !== undefined) return list[i];
  }
  return list[list.length - 1];
}

function mergeFixtures(into: Map<string, Fixture>, batch: Fixture[]) {
  for (const fixture of batch) into.set(fixture.id, fixture);
}

export async function fetchFixtures(cfg: TxlineConfig): Promise<Fixture[]> {
  const lookbackDays = txlineFixtureLookbackDays();
  const startEpochDay = utcEpochDay() - lookbackDays;
  const competitionIds = txlineCompetitionIds();
  const errors: string[] = [];
  const merged = new Map<string, Fixture>();

  const snapshotPaths: string[] = [];
  if (competitionIds?.length) {
    for (const competitionId of competitionIds) {
      snapshotPaths.push(
        `/api/fixtures/snapshot?startEpochDay=${startEpochDay}&competitionId=${encodeURIComponent(competitionId)}`
      );
      // Also pull the live window for that competition (late knockout fixtures).
      snapshotPaths.push(
        `/api/fixtures/snapshot?competitionId=${encodeURIComponent(competitionId)}`
      );
    }
  } else {
    snapshotPaths.push(
      `/api/fixtures/snapshot?startEpochDay=${startEpochDay}`,
      `/api/fixtures/snapshot`,
      `/api/fixtures/current`,
      `/api/fixtures`
    );
  }

  for (const path of snapshotPaths) {
    try {
      const data = await getJson<unknown>(`${cfg.apiOrigin}${path}`, cfg);
      const fixtures = asArray(data)
        .map(normalizeFixture)
        .filter((f): f is Fixture => !!f);
      if (fixtures.length) mergeFixtures(merged, fixtures);
    } catch (e) {
      errors.push(`${path}: ${String(e)}`);
    }
  }

  // Last-resort unfiltered snapshot only when a competition filter returned nothing.
  if (!merged.size && competitionIds?.length) {
    for (const path of [`/api/fixtures/snapshot`, `/api/fixtures/current`]) {
      try {
        const data = await getJson<unknown>(`${cfg.apiOrigin}${path}`, cfg);
        const fixtures = asArray(data)
          .map(normalizeFixture)
          .filter((f): f is Fixture => !!f);
        if (fixtures.length) mergeFixtures(merged, fixtures);
      } catch (e) {
        errors.push(`${path}: ${String(e)}`);
      }
    }
  }

  if (merged.size) return [...merged.values()].sort((a, b) => a.kickoffTs - b.kickoffTs);
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
  const encoded = encodeURIComponent(fixtureId);
  const paths = [
    `/api/scores/snapshot/${encoded}`,
    `/api/scores/historical/${encoded}`,
    `/api/scores/historical?fixtureId=${encoded}`,
    `/api/scores/by-fixture/${encoded}`,
    `/api/scores/fixture/${encoded}`,
  ];
  for (const p of paths) {
    try {
      const data = await getJson<unknown>(`${cfg.apiOrigin}${p}`, cfg);
      const rows = asArray(data);
      if (rows.length) return rows;
    } catch {
      // next
    }
  }
  return [];
}

/** Pull final (or best) score rows for finished fixtures that lack a score. */
export async function enrichFinishedFixtureScores(
  cfg: TxlineConfig,
  fixtures: Fixture[],
  opts?: { concurrency?: number; skipFixtureIds?: Iterable<string> }
): Promise<LiveScoreUpdate[]> {
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 6, 12));
  const skip = new Set(opts?.skipFixtureIds ?? []);
  const targets = fixtures.filter(
    (fixture) =>
      fixture.status === "finished" &&
      !skip.has(fixture.id) &&
      (fixture.score?.home === undefined || fixture.score?.away === undefined)
  );
  const out: LiveScoreUpdate[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const index = cursor;
      cursor += 1;
      const fixture = targets[index];
      try {
        const tape = await fetchHistoricalScores(cfg, fixture.id);
        const best = pickBestScoreRecord(tape);
        const update = best ? normalizeScoreUpdate(best) : null;
        if (update) {
          // Force finished for past kickoffs even if the tape row is mislabeled.
          if (fixture.kickoffTs + 2.5 * 60 * 60 * 1000 < Date.now()) {
            update.status = "finished";
          }
          out.push(update);
        }
      } catch {
        // skip fixture
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
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
