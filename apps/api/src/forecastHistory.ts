import type { Fixture } from "@whistle/shared";
import {
  publicEventToFixture,
  type TsdbEvent,
} from "./fixtures/publicSchedule";
import { getLogger } from "./observability";

const TSDB = "https://www.thesportsdb.com/api/v1/json/123";
const DEFAULT_REQUESTS_PER_MINUTE = 6;
const HARD_REQUEST_CAP = 6;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_SUCCESS_TTL_MS = 6 * 60 * 60_000;
const DEFAULT_FAILURE_TTL_MS = 30 * 60_000;
const MAX_TEAM_CACHE_ENTRIES = 128;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

type HistoryEntry = {
  expiresAt: number;
  fixtures: Fixture[];
};

type ForecastHistoryProviderOptions = {
  fetcher?: Fetcher;
  now?: () => number;
  requestsPerMinute?: number;
  timeoutMs?: number;
  successTtlMs?: number;
  failureTtlMs?: number;
};

function numericEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function retryAfterMs(response: Response): number {
  const value = response.headers.get("retry-after");
  if (!value) return 30_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return clamp(seconds * 1_000, 1_000, 60_000);
  const at = Date.parse(value);
  return Number.isFinite(at)
    ? clamp(at - Date.now(), 1_000, 60_000)
    : 30_000;
}

function teamId(team: Fixture["home"]): string | null {
  const id = String(team.id || "").trim();
  return /^\d+$/.test(id) ? id : null;
}

function dedupeFixtures(fixtures: Fixture[]): Fixture[] {
  return [...new Map(fixtures.map((fixture) => [fixture.id, fixture])).values()].sort(
    (a, b) => b.kickoffTs - a.kickoffTs
  );
}

function normalizedName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function containsMatchup(candidate: Fixture, target: Fixture): boolean {
  const candidateIds = new Set(
    [teamId(candidate.home), teamId(candidate.away)].filter(Boolean)
  );
  const targetIds = [teamId(target.home), teamId(target.away)].filter(Boolean);
  if (targetIds.length === 2 && targetIds.every((id) => candidateIds.has(id))) {
    return true;
  }
  const names = new Set([
    normalizedName(candidate.home.name),
    normalizedName(candidate.away.name),
  ]);
  return [target.home.name, target.away.name].every((name) =>
    names.has(normalizedName(name))
  );
}

export function createForecastHistoryProvider(
  options: ForecastHistoryProviderOptions = {}
) {
  const fetcher = options.fetcher || fetch;
  const clock = options.now || (() => Date.now());
  const requestsPerMinute = clamp(
    Math.floor(
      options.requestsPerMinute ??
        numericEnv(
          "FORECAST_HISTORY_REQUESTS_PER_MIN",
          DEFAULT_REQUESTS_PER_MINUTE
        )
    ),
    1,
    HARD_REQUEST_CAP
  );
  const timeoutMs = clamp(
    options.timeoutMs ??
      numericEnv("FORECAST_HISTORY_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    1_000,
    15_000
  );
  const successTtlMs =
    options.successTtlMs ?? DEFAULT_SUCCESS_TTL_MS;
  const failureTtlMs =
    options.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS;
  const cache = new Map<string, HistoryEntry>();
  const inflight = new Map<string, Promise<Fixture[]>>();
  let windowStartedAt = 0;
  let windowUsed = 0;
  let backoffUntil = 0;

  const reserve = (count: number, now: number) => {
    if (now < backoffUntil) return false;
    if (!windowStartedAt || now - windowStartedAt >= 60_000) {
      windowStartedAt = now;
      windowUsed = 0;
    }
    if (windowUsed + count > requestsPerMinute) return false;
    windowUsed += count;
    return true;
  };

  const prune = () => {
    while (cache.size > MAX_TEAM_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value as string | undefined;
      if (!oldest) break;
      cache.delete(oldest);
    }
  };

  const fetchEvents = async (
    url: string,
    before: number,
    rateLimitMessage: string
  ): Promise<Fixture[]> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.status === 429) {
        backoffUntil = Math.max(backoffUntil, clock() + retryAfterMs(response));
        throw new Error(rateLimitMessage);
      }
      if (!response.ok) {
        throw new Error(`TheSportsDB team history returned ${response.status}`);
      }
      const data = (await response.json()) as {
        results?: TsdbEvent[] | null;
        event?: TsdbEvent[] | null;
        events?: TsdbEvent[] | null;
      };
      return dedupeFixtures(
        (data.results || data.event || data.events || [])
          .map(publicEventToFixture)
          .filter((fixture): fixture is Fixture => Boolean(fixture))
          .filter(
            (fixture) =>
              fixture.status === "finished" &&
              Boolean(fixture.score) &&
              fixture.kickoffTs < before
          )
      ).slice(0, 10);
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchTeam = (id: string, before: number) =>
    fetchEvents(
      `${TSDB}/eventslast.php?id=${id}`,
      before,
      "TheSportsDB team history rate limited"
    );

  const fetchHeadToHead = (fixture: Fixture) => {
    const query = `${fixture.home.name}_vs_${fixture.away.name}`.replace(/\s+/g, "_");
    return fetchEvents(
      `${TSDB}/searchevents.php?e=${encodeURIComponent(query)}`,
      fixture.kickoffTs,
      "TheSportsDB head-to-head search rate limited"
    ).then((fixtures) =>
      fixtures.filter((candidate) => containsMatchup(candidate, fixture))
    );
  };

  type HistoryRequest = {
    key: string;
    load: () => Promise<Fixture[]>;
    logContext: Record<string, string>;
  };

  const loadHistory = (entry: HistoryRequest): Promise<Fixture[]> => {
    const current = inflight.get(entry.key);
    if (current) return current;
    const request = entry.load()
      .then((fixtures) => {
        cache.delete(entry.key);
        cache.set(entry.key, { fixtures, expiresAt: clock() + successTtlMs });
        prune();
        return fixtures;
      })
      .catch((error) => {
        getLogger().warn(
          { ...entry.logContext, err: error },
          "TheSportsDB forecast history unavailable; local evidence retained"
        );
        const fixtures = cache.get(entry.key)?.fixtures || [];
        cache.delete(entry.key);
        cache.set(entry.key, { fixtures, expiresAt: clock() + failureTtlMs });
        prune();
        return fixtures;
      })
      .finally(() => inflight.delete(entry.key));
    inflight.set(entry.key, request);
    return request;
  };

  const requestsFor = (fixture: Fixture): HistoryRequest[] => {
    const ids = [
      ...new Set([teamId(fixture.home), teamId(fixture.away)].filter(Boolean)),
    ] as string[];
    const teamRequests = ids.map((id) => ({
      key: `team:${id}`,
      load: () => fetchTeam(id, fixture.kickoffTs),
      logContext: { teamId: id },
    }));
    if (ids.length !== 2) return teamRequests;
    return [
      ...teamRequests,
      {
        key: `head-to-head:${[...ids].sort().join(":")}`,
        load: () => fetchHeadToHead(fixture),
        logContext: {
          matchup: `${fixture.home.name} vs ${fixture.away.name}`,
        },
      },
    ];
  };

  return {
    peek(fixture: Fixture): Fixture[] {
      const now = clock();
      return dedupeFixtures(
        requestsFor(fixture).flatMap(({ key }) => {
          const entry = cache.get(key);
          return entry && entry.expiresAt > now ? entry.fixtures : [];
        })
      );
    },

    async get(fixture: Fixture): Promise<Fixture[]> {
      const now = clock();
      const entries = requestsFor(fixture);
      const missing = entries.filter(({ key }) => {
        const entry = cache.get(key);
        return !entry || entry.expiresAt <= now;
      });
      const pending = missing.filter(({ key }) => inflight.has(key));
      const fresh = missing.filter(({ key }) => !inflight.has(key));
      const requests = pending.map(({ key }) => inflight.get(key)!);
      if (fresh.length && reserve(fresh.length, now)) {
        requests.push(...fresh.map(loadHistory));
      }
      if (requests.length) await Promise.all(requests);
      return dedupeFixtures(
        entries.flatMap(({ key }) => cache.get(key)?.fixtures || [])
      );
    },

    clear() {
      cache.clear();
      inflight.clear();
      windowStartedAt = 0;
      windowUsed = 0;
      backoffUntil = 0;
    },
  };
}

const forecastHistoryProvider = createForecastHistoryProvider();

export const getPublicForecastHistory = (fixture: Fixture) =>
  forecastHistoryProvider.get(fixture);

export const getCachedPublicForecastHistory = (fixture: Fixture) =>
  forecastHistoryProvider.peek(fixture);
