import {
  Fixture,
  LiveScoreUpdate,
  TXLINE_DEVNET,
  TXLINE_MAINNET,
  isFinalScoreRecord,
} from "@whistle/shared";

export type TxlineConfig = {
  apiOrigin: string;
  guestJwt: string;
  apiToken: string;
};

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
  const res = await fetch(`${apiOrigin}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest/start failed: ${res.status}`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("guest/start missing token");
  return data.token;
}

async function getJson<T>(url: string, cfg: TxlineConfig): Promise<T> {
  let res = await fetch(url, { headers: headers(cfg) });
  if (res.status === 401) {
    const jwt = await refreshGuestJwt(cfg.apiOrigin);
    cfg.guestJwt = jwt;
    res = await fetch(url, { headers: headers(cfg) });
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

  const home =
    teamFrom(o.home ?? o.homeTeam ?? o.HomeTeam ?? o.team1, "Home") ;
  const away =
    teamFrom(o.away ?? o.awayTeam ?? o.AwayTeam ?? o.team2, "Away");

  const kickoff =
    pickNumber(o, [
      "kickoffTs",
      "kickoff",
      "startTs",
      "startTime",
      "StartTime",
      "ts",
      "scheduledTs",
    ]) ?? Date.now();

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
    kickoffTs: kickoff > 1e12 ? kickoff : kickoff * 1000,
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

export function normalizeScoreUpdate(raw: unknown): LiveScoreUpdate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fixtureId = pickString(o, ["fixtureId", "id", "FixtureId", "fixture_id"]);
  if (!fixtureId) return null;

  const homeScore =
    pickNumber(o, ["homeScore", "HomeScore", "scoreHome", "home"]) ??
    pickNumber((o.score as Record<string, unknown>) || {}, ["home", "Home"]) ??
    0;
  const awayScore =
    pickNumber(o, ["awayScore", "AwayScore", "scoreAway", "away"]) ??
    pickNumber((o.score as Record<string, unknown>) || {}, ["away", "Away"]) ??
    0;

  const statusId = pickNumber(o, ["statusId", "StatusId", "status_id"]);
  const action = pickString(o, ["action", "Action", "event"]);
  const period = pickString(o, ["period", "Period"]) ?? pickNumber(o, ["period", "Period"]);

  let status: Fixture["status"] = "live";
  if (isFinalScoreRecord({ action, statusId, period })) status = "finished";
  const statusRaw = (pickString(o, ["status", "Status"]) || "").toLowerCase();
  if (statusRaw.includes("final") || statusRaw.includes("finished")) status = "finished";
  if (statusRaw.includes("schedul") || statusRaw.includes("pre")) status = "scheduled";

  return {
    fixtureId,
    homeScore,
    awayScore,
    status,
    statusId,
    action,
    period,
    clock: pickString(o, ["clock", "Clock", "minute", "time"]),
    ts: pickNumber(o, ["ts", "timestamp", "Timestamp"]) ?? Date.now(),
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
  statKeys: string[]
): Promise<unknown> {
  const qs = new URLSearchParams({
    fixtureId: String(fixtureId),
    seq: String(seq),
    statKey: statKeys.join(","),
  });
  const paths = [
    `/api/scores/stat-validation-v2?${qs}`,
    `/api/scores/stat-validation?${qs}`,
  ];
  for (const p of paths) {
    try {
      return await getJson(`${cfg.apiOrigin}${p}`, cfg);
    } catch {
      // next
    }
  }
  throw new Error(`stat-validation failed for fixture ${fixtureId}`);
}

export function sseUrl(cfg: TxlineConfig, channel: "scores" | "odds"): string {
  return `${cfg.apiOrigin}/api/${channel}/stream`;
}

export { headers as txlineHeaders };
