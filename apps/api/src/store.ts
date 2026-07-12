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
  try {
    if (!fs.existsSync(STATE_FILE)) return emptyState();
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let state = loadState();
const listeners = new Set<(event: string, payload: unknown) => void>();

export function getState(): AppState {
  return state;
}

export function mutate(fn: (s: AppState) => void, event?: string, payload?: unknown): AppState {
  fn(state);
  saveState(state);
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
