import fs from "fs";
import path from "path";
import {
  Fixture,
  InsightCard,
  LiveScoreUpdate,
  MarketPool,
  MatchStats,
  OddsQuote,
  Position,
  PricePoint,
  Squad,
} from "@whistle/shared";

export interface AppState {
  fixtures: Record<string, Fixture>;
  live: Record<string, LiveScoreUpdate>;
  odds: Record<string, OddsQuote[]>;
  markets: Record<string, MarketPool>;
  positions: Record<string, Position>;
  squads: Record<string, Squad>;
  /** Pool implied-price time series keyed by marketId */
  priceHistory: Record<string, PricePoint[]>;
  /** Live match stats keyed by fixtureId */
  matchStats: Record<string, MatchStats>;
  /** Cached insights keyed by fixtureId */
  insights: Record<string, InsightCard[]>;
  notifications: Array<{
    id: string;
    type: string;
    message: string;
    marketId?: string;
    ts: number;
  }>;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const SAVE_DEBOUNCE_MS = Math.max(
  50,
  Number(process.env.STATE_SAVE_DEBOUNCE_MS || 300)
);

function emptyState(): AppState {
  return {
    fixtures: {},
    live: {},
    odds: {},
    markets: {},
    positions: {},
    squads: {},
    priceHistory: {},
    matchStats: {},
    insights: {},
    notifications: [],
  };
}

export function loadState(): AppState {
  if (!fs.existsSync(STATE_FILE)) return emptyState();
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch (error) {
    // Never overwrite an unreadable financial ledger with an empty state.
    throw new Error(`State file is unreadable (${STATE_FILE})`, { cause: error });
  }
}

export function saveState(state: AppState): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  let fd: number | undefined;
  try {
    fd = fs.openSync(tempFile, "w");
    fs.writeFileSync(fd, JSON.stringify(state));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempFile, STATE_FILE);
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {
      // Preserve the original write failure.
    }
    throw error;
  }
}

let state = loadState();
const listeners = new Set<(event: string, payload: unknown) => void>();
let stateDirty = false;
let saveTimer: NodeJS.Timeout | null = null;

function scheduleSave(delayMs = SAVE_DEBOUNCE_MS) {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!stateDirty) return;
    try {
      saveState(state);
      stateDirty = false;
    } catch (error) {
      console.error("[store] atomic state save failed", error);
      scheduleSave(Math.max(1_000, SAVE_DEBOUNCE_MS));
    }
  }, delayMs);
  saveTimer.unref();
}

export function flushStateSync(): void {
  if (!stateDirty) return;
  saveState(state);
  stateDirty = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

export function getState(): AppState {
  return state;
}

export function mutate(
  fn: (s: AppState) => void,
  event?: string,
  payload?: unknown,
  options?: { durable?: boolean }
): AppState {
  if (options?.durable) {
    // Durable mutations use copy-on-write: a failed disk write cannot leave a
    // successful-looking stake/claim in memory.
    const next = structuredClone(state);
    fn(next);
    saveState(next);
    state = next;
    stateDirty = false;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  } else {
    fn(state);
    stateDirty = true;
    scheduleSave();
  }
  if (event) {
    for (const l of listeners) l(event, payload ?? null);
  }
  return state;
}

export function subscribe(listener: (event: string, payload: unknown) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ops log only — never used for user-facing toasts. */
export function pushNotification(type: string, message: string, marketId?: string) {
  if (
    type === "settle" ||
    type === "settled" ||
    type === "void" ||
    type.includes("settle")
  ) {
    return; // silenced — settlement spam removed
  }
  mutate((s) => {
    s.notifications.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      message,
      marketId,
      ts: Date.now(),
    });
    s.notifications = s.notifications.slice(0, 50);
  }, "notification", { type, message, marketId });
}
