export type MarketType = "match_result" | "total_goals";

export type MatchResultOutcome = "home" | "draw" | "away";
export type TotalsOutcome = "over" | "under";
export type MarketOutcome = MatchResultOutcome | TotalsOutcome;

export type MarketStatus = "open" | "locked" | "settled" | "void";

export interface FixtureTeam {
  id?: number | string;
  name: string;
  shortName?: string;
  logo?: string;
}

export interface Fixture {
  id: string;
  competition?: string;
  round?: string;
  group?: string;
  kickoffTs: number;
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "unknown";
  home: FixtureTeam;
  away: FixtureTeam;
  score?: {
    home: number;
    away: number;
  };
  period?: string | number;
  venue?: string;
  raw?: unknown;
}

export interface LiveScoreUpdate {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  status: Fixture["status"];
  statusId?: number;
  action?: string;
  period?: string | number;
  clock?: string;
  events?: MatchEvent[];
  ts: number;
}

export interface MatchEvent {
  type: string;
  minute?: number;
  team?: "home" | "away";
  player?: string;
  detail?: string;
}

export interface MatchStats {
  fixtureId: string;
  updatedAt: number;
  possession?: { home: number; away: number };
  shots?: { home: number; away: number };
  shotsOnTarget?: { home: number; away: number };
  corners?: { home: number; away: number };
  fouls?: { home: number; away: number };
  yellowCards?: { home: number; away: number };
  redCards?: { home: number; away: number };
  offsides?: { home: number; away: number };
  events: MatchEvent[];
  source: string;
}

export interface PricePoint {
  ts: number;
  marketId: string;
  totalPool: number;
  implied: Record<string, number>;
  outcomes: Record<string, number>;
}

export interface InsightCard {
  id: string;
  severity: "info" | "signal" | "alert";
  title: string;
  body: string;
  tags: string[];
  ts: number;
  source: "engine" | "llm";
  /** When the underlying evidence was last observed. */
  asOf?: number;
  /** Qualitative confidence only; never an outcome probability. */
  confidence?: "low" | "medium" | "high";
  /** Structured provenance retained for auditability and richer clients. */
  evidence?: InsightEvidence[];
  /** Explicitly distinguishes an honest wait state from a generated signal. */
  reason?: "insufficient_evidence";
}

export interface InsightEvidence {
  kind: "pool" | "score" | "stats" | "event" | "table" | "news";
  label: string;
  source: string;
  asOf: number;
  url?: string;
}

export type ForecastPhase = "pre_match" | "live" | "final";
export type ForecastConfidenceLevel = "low" | "medium" | "high";

export interface ForecastProbabilities {
  home: number;
  draw: number;
  away: number;
}

export interface ForecastEvidence {
  kind:
    | "fixture_feed"
    | "competition_history"
    | "team_form"
    | "head_to_head"
    | "player_availability"
    | "live_score"
    | "model_prior";
  label: string;
  source: string;
  asOf: number;
  sampleSize?: number;
}

export interface ForecastConfidence {
  level: ForecastConfidenceLevel;
  /** Evidence-quality score in the inclusive range 0..1; not outcome probability. */
  score: number;
  reasons: string[];
}

export interface ForecastFreshness {
  generatedAt: number;
  fixtureFeedAsOf: number | null;
  evidenceAsOf: number | null;
  ageSeconds: number | null;
  status: "fresh" | "aging" | "stale" | "unknown";
}

export interface MatchModelForecast {
  version: "whistle-poisson-v1";
  phase: ForecastPhase;
  probabilities: ForecastProbabilities;
  expectedGoals: { home: number; away: number };
  likelyOutcome: MatchResultOutcome;
  confidence: ForecastConfidence;
  evidence: ForecastEvidence[];
  disclaimer: string;
}

export interface CrowdPriceSnapshot {
  /** False when the public 1X2 pool is empty or unavailable. */
  available: boolean;
  label: "pool_implied";
  marketId?: string;
  totalPoolUnits?: number;
  probabilities?: ForecastProbabilities;
  asOf?: number;
  disclaimer: string;
}

export interface ForecastNarrative {
  source: "deterministic" | "groq";
  text: string;
  /** Public model identifier only; credentials are never included. */
  model?: string;
}

export interface MatchForecast {
  fixtureId: string;
  generatedAt: number;
  expiresAt: number;
  dataContext: {
    fixtureSource: "txline" | "thesportsdb";
    forecastUse: true;
    settlementUse: "requires_txline_validation" | "not_eligible";
    disclaimer: string;
  };
  model: MatchModelForecast;
  /** A comparison surface only. This is never an input to `model`. */
  crowd: CrowdPriceSnapshot;
  narrative: ForecastNarrative;
  freshness: ForecastFreshness;
}

export interface OddsQuote {
  fixtureId: string;
  market: string;
  selection: string;
  price: number;
  ts: number;
}

export interface MarketPool {
  id: string;
  fixtureId: string;
  marketType: MarketType;
  line?: number;
  status: MarketStatus;
  outcomes: Record<string, number>;
  totalPool: number;
  winningOutcome?: MarketOutcome;
  settledAt?: number;
  settleTxSig?: string;
  createdAt: number;
  squadId?: string;
}

export interface Position {
  id: string;
  marketId: string;
  owner: string;
  outcome: MarketOutcome;
  amount: number;
  claimed: boolean;
  createdAt: number;
}

export interface Squad {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: number;
  members: string[];
}

export interface CreateMarketRequest {
  fixtureId: string;
  marketType: MarketType;
  line?: number;
  squadId?: string;
}

export interface DepositRequest {
  marketId: string;
  outcome: MarketOutcome;
  amount: number;
  owner: string;
}

export interface SettleResult {
  marketId: string;
  winningOutcome: MarketOutcome;
  homeScore: number;
  awayScore: number;
  settleTxSig?: string;
  mode: "onchain" | "offchain";
}

export function impliedShares(outcomes: Record<string, number>): Record<string, number> {
  const total = Object.values(outcomes).reduce((a, b) => a + b, 0);
  if (total <= 0) {
    const keys = Object.keys(outcomes);
    const even = 1 / Math.max(keys.length, 1);
    return Object.fromEntries(keys.map((k) => [k, even]));
  }
  return Object.fromEntries(
    Object.entries(outcomes).map(([k, v]) => [k, v / total])
  );
}

export function payoutForPosition(
  positionAmount: number,
  outcomePool: number,
  totalPool: number
): number {
  if (outcomePool <= 0 || totalPool <= 0) return 0;
  return (positionAmount / outcomePool) * totalPool;
}

export function resolveMatchResult(
  homeScore: number,
  awayScore: number
): MatchResultOutcome {
  if (homeScore > awayScore) return "home";
  if (homeScore < awayScore) return "away";
  return "draw";
}

export function resolveTotals(
  homeScore: number,
  awayScore: number,
  line: number
): TotalsOutcome {
  const goals = homeScore + awayScore;
  return goals > line ? "over" : "under";
}

export function isFinalScoreRecord(record: {
  action?: string;
  statusId?: number;
  period?: number | string;
}): boolean {
  const action = (record.action || "").toLowerCase();
  if (action.includes("game_final") || action.includes("game_finalised") || action.includes("game_finalized")) {
    return true;
  }
  if (record.statusId === 100) return true;
  if (record.period === 100 || record.period === "100") return true;
  return false;
}

export const TXLINE_DEVNET = {
  rpcUrl: "https://api.devnet.solana.com",
  apiOrigin: "https://txline-dev.txodds.com",
  programId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
  txlTokenMint: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
} as const;

export const TXLINE_MAINNET = {
  rpcUrl: "https://api.mainnet-beta.solana.com",
  apiOrigin: "https://txline.txodds.com",
  programId: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
  txlTokenMint: "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL",
} as const;
