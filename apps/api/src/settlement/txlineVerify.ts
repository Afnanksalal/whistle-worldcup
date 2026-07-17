import { Connection, PublicKey } from "@solana/web3.js";
import { TXLINE_DEVNET, TXLINE_MAINNET } from "@whistle/shared";
import { extractMerkleSummary } from "./merkle";
import { getLogger } from "../observability";

export type OnchainProofVerifyResult = {
  ok: boolean;
  simulated: boolean;
  reason: string;
  dailyScoresPda?: string;
  epochDay?: number;
  accountExists?: boolean;
};

/**
 * Verify that the TxLINE validation payload corresponds to a published
 * on-chain daily scores root PDA. Full validate_stat_v2 view simulation
 * requires Anchor-encoded strategy bytes; we confirm the Merkle root
 * account exists for the proof's epoch day (cryptographic anchor presence)
 * and that the payload carries non-empty proof nodes.
 */
export async function verifyValidationAgainstChain(
  validation: unknown,
  opts?: { rpcUrl?: string; network?: "devnet" | "mainnet" }
): Promise<OnchainProofVerifyResult> {
  const network = opts?.network || "devnet";
  const net = network === "mainnet" ? TXLINE_MAINNET : TXLINE_DEVNET;
  const merkle = extractMerkleSummary(validation, network);
  const log = getLogger().child({ module: "txline-verify" });

  if (!merkle.epochDay || !merkle.dailyScoresPda) {
    return {
      ok: false,
      simulated: false,
      reason: "validation payload missing timestamp / epoch day for PDA derivation",
    };
  }

  const hasProofs =
    (merkle.mainTreeProofNodes || 0) > 0 ||
    (merkle.subTreeProofNodes || 0) > 0 ||
    (merkle.statsCount || 0) > 0;
  if (!hasProofs && !merkle.eventStatRoot) {
    return {
      ok: false,
      simulated: false,
      reason: "validation payload missing Merkle proof nodes",
      dailyScoresPda: merkle.dailyScoresPda,
      epochDay: merkle.epochDay,
    };
  }

  const rpc =
    opts?.rpcUrl ||
    process.env.SOLANA_RPC_URL?.trim() ||
    net.rpcUrl;
  try {
    const connection = new Connection(rpc, {
      commitment: "confirmed",
      disableRetryOnRateLimit: false,
    });
    const info = await connection.getAccountInfo(
      new PublicKey(merkle.dailyScoresPda),
      "confirmed"
    );
    if (!info) {
      log.warn(
        { pda: merkle.dailyScoresPda, epochDay: merkle.epochDay },
        "daily scores roots PDA not found on-chain yet"
      );
      return {
        ok: false,
        simulated: true,
        reason: "daily_scores_roots PDA not published for this epoch day yet",
        dailyScoresPda: merkle.dailyScoresPda,
        epochDay: merkle.epochDay,
        accountExists: false,
      };
    }
    return {
      ok: true,
      simulated: true,
      reason: "daily_scores_roots PDA present; Merkle proof payload non-empty",
      dailyScoresPda: merkle.dailyScoresPda,
      epochDay: merkle.epochDay,
      accountExists: true,
    };
  } catch (err) {
    log.warn({ err }, "on-chain proof account check failed");
    return {
      ok: false,
      simulated: false,
      reason: `RPC verification failed: ${err instanceof Error ? err.message : String(err)}`,
      dailyScoresPda: merkle.dailyScoresPda,
      epochDay: merkle.epochDay,
    };
  }
}
