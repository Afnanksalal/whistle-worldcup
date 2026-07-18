/**
 * Borsh encoder for TxLINE `validate_stat_v2` instruction data.
 * Layout mirrors vendor/txline/txoracle.json + the published txline Python SDK.
 */

export const VALIDATE_STAT_V2_DISCRIMINATOR = Buffer.from([
  208, 215, 194, 214, 241, 71, 246, 178,
]);

const Comparison = { GreaterThan: 0, LessThan: 1, EqualTo: 2 } as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function putU8(out: number[], value: number) {
  out.push(value & 0xff);
}

function putBool(out: number[], value: boolean) {
  putU8(out, value ? 1 : 0);
}

function putU32(out: number[], value: number) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  out.push(...buf);
}

function putI32(out: number[], value: number) {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value | 0, 0);
  out.push(...buf);
}

function putI64(out: number[], value: number | bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(value), 0);
  out.push(...buf);
}

function putHash(out: number[], bytes: Uint8Array) {
  if (bytes.length !== 32) {
    throw new Error(`expected 32-byte hash, got ${bytes.length}`);
  }
  out.push(...bytes);
}

function decodeHash32(value: unknown, label: string): Buffer {
  if (Buffer.isBuffer(value) && value.length === 32) return value;
  if (value instanceof Uint8Array && value.length === 32) return Buffer.from(value);
  if (Array.isArray(value) && value.length === 32 && value.every((n) => typeof n === "number")) {
    return Buffer.from(value as number[]);
  }
  if (typeof value === "string" && value.length) {
    if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
    const b64 = Buffer.from(value, "base64");
    if (b64.length === 32) return b64;
  }
  throw new Error(`invalid 32-byte hash for ${label}`);
}

type ProofNode = { hash: Buffer; isRightSibling: boolean };

function parseProofNode(raw: unknown): ProofNode {
  const node = asRecord(raw);
  if (!node) throw new Error("invalid proof node");
  const hash = decodeHash32(node.hash, "proof.hash");
  const isRightSibling = Boolean(
    node.isRightSibling ?? node.is_right_sibling ?? node.IsRightSibling
  );
  return { hash, isRightSibling };
}

function parseProofVec(raw: unknown): ProofNode[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseProofNode);
}

function encodeProofNode(out: number[], node: ProofNode) {
  putHash(out, node.hash);
  putBool(out, node.isRightSibling);
}

function encodeProofVec(out: number[], nodes: ProofNode[]) {
  putU32(out, nodes.length);
  for (const node of nodes) encodeProofNode(out, node);
}

function encodeScoreStat(
  out: number[],
  stat: { key: number; value: number; period: number }
) {
  putU32(out, stat.key);
  putI32(out, stat.value);
  putI32(out, stat.period);
}

function encodeStatLeaf(
  out: number[],
  leaf: { stat: { key: number; value: number; period: number }; proof: ProofNode[] }
) {
  encodeScoreStat(out, leaf.stat);
  encodeProofVec(out, leaf.proof);
}

function encodeTraderPredicate(
  out: number[],
  threshold: number,
  comparison: number
) {
  putI32(out, threshold);
  putU8(out, comparison);
}

function encodeSinglePredicate(
  out: number[],
  index: number,
  threshold: number,
  comparison: number
) {
  putU8(out, 0); // StatPredicate::Single
  putU8(out, index);
  encodeTraderPredicate(out, threshold, comparison);
}

export type ScoreEqualStrategy = {
  homeScore: number;
  awayScore: number;
};

/**
 * Build `validate_stat_v2` instruction data that proves home/away goal stats
 * equal the settlement scores (stat keys 1/2 from TxLINE soccer finals).
 */
export function buildValidateStatV2IxData(
  validation: unknown,
  scores: ScoreEqualStrategy
): Buffer {
  const root = asRecord(validation);
  if (!root) throw new Error("validation payload missing");

  const summary =
    asRecord(root.summary) ||
    asRecord(root.fixtureSummary) ||
    asRecord(root.fixture_summary);
  if (!summary) throw new Error("validation summary missing");

  const updateStats =
    asRecord(summary.updateStats) ||
    asRecord(summary.UpdateStats) ||
    asRecord(summary.update_stats);
  if (!updateStats) throw new Error("validation updateStats missing");

  const ts = Number(root.ts);
  if (!Number.isFinite(ts)) throw new Error("validation ts missing");

  const fixtureId = Number(summary.fixtureId ?? summary.FixtureId ?? summary.fixture_id);
  if (!Number.isFinite(fixtureId)) throw new Error("validation fixtureId missing");

  const updateCount = Number(
    updateStats.updateCount ?? updateStats.UpdateCount ?? updateStats.update_count
  );
  const minTimestamp = Number(
    updateStats.minTimestamp ?? updateStats.MinTimestamp ?? updateStats.min_timestamp
  );
  const maxTimestamp = Number(
    updateStats.maxTimestamp ?? updateStats.MaxTimestamp ?? updateStats.max_timestamp
  );
  if (![updateCount, minTimestamp, maxTimestamp].every(Number.isFinite)) {
    throw new Error("validation updateStats fields incomplete");
  }

  const eventStatRoot = decodeHash32(
    root.eventStatRoot ?? root.EventStatRoot ?? root.event_stat_root,
    "eventStatRoot"
  );
  const eventsSubTreeRoot = decodeHash32(
    summary.eventStatsSubTreeRoot ??
      summary.eventsSubTreeRoot ??
      summary.events_sub_tree_root ??
      summary.event_stats_sub_tree_root,
    "eventsSubTreeRoot"
  );

  const statsToProve = (root.statsToProve ?? root.stats_to_prove ?? root.stats) as unknown;
  const statProofs = (root.statProofs ?? root.stat_proofs) as unknown;
  if (!Array.isArray(statsToProve) || statsToProve.length < 2) {
    throw new Error("validation needs at least home/away statsToProve");
  }
  if (!Array.isArray(statProofs) || statProofs.length < 2) {
    throw new Error("validation needs statProofs for home/away");
  }

  const leaves = statsToProve.slice(0, 2).map((statRaw, index) => {
    const stat = asRecord(statRaw);
    if (!stat) throw new Error("invalid stat leaf");
    const key = Number(stat.key);
    const value = Number(stat.value);
    const period = Number(stat.period ?? 0);
    if (![key, value, period].every(Number.isFinite)) {
      throw new Error("stat leaf fields incomplete");
    }
    const expected = index === 0 ? scores.homeScore : scores.awayScore;
    if (value !== expected) {
      throw new Error(
        `proven stat[${index}] value ${value} does not match settle score ${expected}`
      );
    }
    return {
      stat: { key, value, period },
      proof: parseProofVec(statProofs[index]),
    };
  });

  const fixtureProof = parseProofVec(
    root.subTreeProof ?? root.fixtureProof ?? root.sub_tree_proof ?? root.fixture_proof
  );
  const mainTreeProof = parseProofVec(root.mainTreeProof ?? root.main_tree_proof);

  const out: number[] = [...VALIDATE_STAT_V2_DISCRIMINATOR];

  // StatValidationInput
  putI64(out, ts);
  putI64(out, fixtureId);
  putI32(out, updateCount);
  putI64(out, minTimestamp);
  putI64(out, maxTimestamp);
  putHash(out, eventsSubTreeRoot);
  encodeProofVec(out, fixtureProof);
  encodeProofVec(out, mainTreeProof);
  putHash(out, eventStatRoot);
  putU32(out, leaves.length);
  for (const leaf of leaves) encodeStatLeaf(out, leaf);

  // NDimensionalStrategy — bind settle scores via EqualTo on both stats
  putU32(out, 0); // geometric_targets empty
  putU8(out, 0); // distance_predicate None
  putU32(out, 2); // two Single predicates
  encodeSinglePredicate(out, 0, scores.homeScore, Comparison.EqualTo);
  encodeSinglePredicate(out, 1, scores.awayScore, Comparison.EqualTo);

  return Buffer.from(out);
}

export function validationHasEncodableProof(validation: unknown): boolean {
  try {
    const root = asRecord(validation);
    if (!root) return false;
    const stats = root.statsToProve ?? root.stats_to_prove;
    const proofs = root.statProofs ?? root.stat_proofs;
    return Array.isArray(stats) && stats.length >= 2 && Array.isArray(proofs) && proofs.length >= 2;
  } catch {
    return false;
  }
}
