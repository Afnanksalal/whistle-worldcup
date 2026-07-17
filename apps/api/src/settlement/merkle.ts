import { PublicKey } from "@solana/web3.js";
import { TXLINE_DEVNET, TXLINE_MAINNET, type SettlementReceipt } from "@whistle/shared";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickNumber(obj: Record<string, unknown> | null, keys: string[]): number | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function pickString(obj: Record<string, unknown> | null, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function proofLen(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

export function epochDayFromMs(timestampMs: number): number {
  return Math.floor(timestampMs / 86_400_000);
}

export function deriveDailyScoresPda(
  programId: string,
  epochDay: number
): string {
  const dayBuf = Buffer.alloc(2);
  dayBuf.writeUInt16LE(epochDay & 0xffff, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), dayBuf],
    new PublicKey(programId)
  );
  return pda.toBase58();
}

export function extractMerkleSummary(
  validation: unknown,
  network: "devnet" | "mainnet" = "devnet"
): SettlementReceipt["merkle"] {
  const root = asRecord(validation);
  const summary = asRecord(root?.summary) || asRecord(root?.fixtureSummary);
  const updateStats =
    asRecord(summary?.updateStats) ||
    asRecord(summary?.UpdateStats) ||
    asRecord(root?.updateStats);
  const minTimestamp = pickNumber(updateStats, [
    "minTimestamp",
    "MinTimestamp",
    "min_timestamp",
  ]);
  const maxTimestamp = pickNumber(updateStats, [
    "maxTimestamp",
    "MaxTimestamp",
    "max_timestamp",
  ]);
  const eventStatRoot = pickString(root, [
    "eventStatRoot",
    "EventStatRoot",
    "event_stat_root",
  ]) || pickString(asRecord(summary), ["eventStatsSubTreeRoot", "eventsSubTreeRoot"]);
  const epochDay =
    minTimestamp !== undefined ? epochDayFromMs(minTimestamp) : undefined;
  const programId =
    network === "mainnet" ? TXLINE_MAINNET.programId : TXLINE_DEVNET.programId;
  const dailyScoresPda =
    epochDay !== undefined ? deriveDailyScoresPda(programId, epochDay) : undefined;
  const stats =
    (Array.isArray(root?.statsToProve) && root?.statsToProve) ||
    (Array.isArray(root?.stats) && root?.stats) ||
    [];

  return {
    eventStatRoot,
    fixtureId:
      pickString(summary, ["fixtureId", "FixtureId"]) ||
      pickNumber(summary, ["fixtureId", "FixtureId"]),
    minTimestamp,
    maxTimestamp,
    epochDay,
    dailyScoresPda,
    mainTreeProofNodes: proofLen(root?.mainTreeProof || root?.main_tree_proof),
    subTreeProofNodes: proofLen(
      root?.subTreeProof || root?.fixtureProof || root?.sub_tree_proof
    ),
    statsCount: Array.isArray(stats) ? stats.length : undefined,
  };
}

export function proofSummaryLine(merkle: SettlementReceipt["merkle"], seq: number | string): string {
  const parts = [`seq ${seq}`];
  if (merkle.epochDay !== undefined) parts.push(`epoch day ${merkle.epochDay}`);
  if (merkle.mainTreeProofNodes !== undefined) {
    parts.push(`${merkle.mainTreeProofNodes} main-tree nodes`);
  }
  if (merkle.statsCount !== undefined) parts.push(`${merkle.statsCount} stats`);
  if (merkle.dailyScoresPda) {
    parts.push(`PDA ${merkle.dailyScoresPda.slice(0, 8)}…`);
  }
  return parts.join(" · ");
}
