import fs from "fs";
import { createHash } from "crypto";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  amountToBaseUnits,
  marketIdentitySeed,
  type MarketPool,
  type MarketType,
} from "@whistle/shared";
import type { AppConfig } from "../config";
import type { AppState } from "../store";

const anchorDiscriminator = (namespace: "global" | "account", name: string): Buffer =>
  createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8);

const DEPOSIT_DISCRIMINATOR = anchorDiscriminator("global", "deposit");
const CLAIM_DISCRIMINATOR = anchorDiscriminator("global", "claim");
const CONFIG_DISCRIMINATOR = anchorDiscriminator("account", "Config");

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

type CompiledInstructionLike = {
  programIdIndex: number;
  data: string | Uint8Array;
  accountKeyIndexes?: number[] | Uint8Array;
  accounts?: number[] | Uint8Array;
};

type MessageLike = {
  staticAccountKeys?: PublicKey[];
  accountKeys?: PublicKey[];
  compiledInstructions?: CompiledInstructionLike[];
  instructions?: CompiledInstructionLike[];
};

type TransactionLike = {
  transaction: { message: MessageLike };
  meta?: {
    err?: unknown;
    loadedAddresses?: { writable: PublicKey[]; readonly: PublicKey[] };
  } | null;
};

export type OnchainMutation = {
  status: "submitted" | "already_applied";
  signature?: string;
};

export function loadAuthorityKeypair(): Keypair | null {
  const secret = process.env.WHISTLE_AUTHORITY_KEY?.trim();
  if (secret) {
    try {
      if (secret.startsWith("[")) {
        return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret) as number[]));
      }
      return Keypair.fromSecretKey(bs58.decode(secret));
    } catch (error) {
      console.warn("[onchain] failed to parse WHISTLE_AUTHORITY_KEY", error);
    }
  }

  const keyPath = process.env.SOLANA_KEYPAIR_PATH?.trim();
  if (keyPath && fs.existsSync(keyPath)) {
    try {
      const bytes = JSON.parse(fs.readFileSync(keyPath, "utf8")) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(bytes));
    } catch (error) {
      console.warn("[onchain] failed to parse SOLANA_KEYPAIR_PATH", error);
    }
  }
  return null;
}

export function deriveConfigPDA(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("whistle_config")], programId)[0];
}

export function deriveMarketPDA(
  programId: PublicKey,
  fixtureId: string,
  marketType: MarketType,
  line?: number,
  squadId?: string
): PublicKey {
  const typeU8 = marketType === "match_result" ? 0 : 1;
  const lineValue = line === undefined ? 0 : Math.round(line * 100);
  const lineBuffer = Buffer.alloc(4);
  lineBuffer.writeUInt32LE(lineValue);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      Buffer.from(marketIdentitySeed(fixtureId, squadId)),
      Buffer.from([typeU8]),
      lineBuffer,
    ],
    programId
  )[0];
}

export function deriveVaultPDA(programId: PublicKey, marketPda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), marketPda.toBuffer()],
    programId
  )[0];
}

export function derivePositionPDA(
  programId: PublicKey,
  marketPda: PublicKey,
  user: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketPda.toBuffer(), user.toBuffer()],
    programId
  )[0];
}

function transactionParts(tx: TransactionLike) {
  const message = tx.transaction.message;
  const accountKeys = [...(message.staticAccountKeys || message.accountKeys || [])];
  if (tx.meta?.loadedAddresses) {
    accountKeys.push(
      ...tx.meta.loadedAddresses.writable,
      ...tx.meta.loadedAddresses.readonly
    );
  }
  const instructions = message.compiledInstructions || message.instructions || [];
  return { accountKeys, instructions };
}

function instructionAccounts(
  instruction: CompiledInstructionLike,
  accountKeys: PublicKey[]
): PublicKey[] {
  const indexes = instruction.accountKeyIndexes || instruction.accounts || [];
  return Array.from(indexes, (index) => {
    const account = accountKeys[index];
    if (!account) throw new Error(`transaction account index ${index} is missing`);
    return new PublicKey(account);
  });
}

function instructionData(instruction: CompiledInstructionLike): Buffer {
  return Buffer.from(
    typeof instruction.data === "string"
      ? bs58.decode(instruction.data)
      : instruction.data
  );
}

export async function verifyDepositTx(args: {
  connection: Connection;
  programId: PublicKey;
  txSig: string;
  expectedMarket: PublicKey;
  expectedUser: PublicKey;
  expectedOutcome: number;
  expectedAmountBaseUnits: bigint;
}): Promise<true> {
  const tx = (await args.connection.getTransaction(args.txSig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  })) as TransactionLike | null;
  if (!tx) throw new Error("Transaction not found on-chain");
  if (tx.meta?.err) throw new Error("Transaction failed on-chain");

  const { accountKeys, instructions } = transactionParts(tx);
  for (const instruction of instructions) {
    const instructionProgram = accountKeys[instruction.programIdIndex];
    if (!instructionProgram || !instructionProgram.equals(args.programId)) continue;
    const data = instructionData(instruction);
    if (data.length < 8 || !data.subarray(0, 8).equals(DEPOSIT_DISCRIMINATOR)) continue;
    if (data.length !== 17) throw new Error("Invalid deposit instruction data length");

    const outcome = data.readUInt8(8);
    const amount = data.readBigUInt64LE(9);
    if (outcome !== args.expectedOutcome) {
      throw new Error(`Outcome mismatch: expected ${args.expectedOutcome}, got ${outcome}`);
    }
    if (amount !== args.expectedAmountBaseUnits) {
      throw new Error(
        `Amount mismatch: expected ${args.expectedAmountBaseUnits}, got ${amount}`
      );
    }

    const accounts = instructionAccounts(instruction, accountKeys);
    if (accounts.length < 5) throw new Error("Too few accounts in deposit instruction");
    if (!accounts[0].equals(args.expectedUser)) throw new Error("User account mismatch");
    if (!accounts[1].equals(args.expectedMarket)) throw new Error("Market account mismatch");
    const expectedPosition = derivePositionPDA(
      args.programId,
      args.expectedMarket,
      args.expectedUser
    );
    if (!accounts[3].equals(expectedPosition)) throw new Error("Position account mismatch");
    return true;
  }
  throw new Error("No matching deposit instruction found in transaction");
}

export async function verifyClaimTx(args: {
  connection: Connection;
  programId: PublicKey;
  txSig: string;
  expectedMarket: PublicKey;
  expectedUser: PublicKey;
}): Promise<true> {
  const tx = (await args.connection.getTransaction(args.txSig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  })) as TransactionLike | null;
  if (!tx) throw new Error("Transaction not found on-chain");
  if (tx.meta?.err) throw new Error("Transaction failed on-chain");

  const { accountKeys, instructions } = transactionParts(tx);
  for (const instruction of instructions) {
    const instructionProgram = accountKeys[instruction.programIdIndex];
    if (!instructionProgram || !instructionProgram.equals(args.programId)) continue;
    const data = instructionData(instruction);
    if (data.length !== 8 || !data.equals(CLAIM_DISCRIMINATOR)) continue;

    const accounts = instructionAccounts(instruction, accountKeys);
    if (accounts.length < 7) throw new Error("Too few accounts in claim instruction");
    if (!accounts[0].equals(args.expectedUser)) throw new Error("User account mismatch");
    if (!accounts[2].equals(args.expectedMarket)) throw new Error("Market account mismatch");
    const expectedPosition = derivePositionPDA(
      args.programId,
      args.expectedMarket,
      args.expectedUser
    );
    if (!accounts[4].equals(expectedPosition)) throw new Error("Position account mismatch");
    return true;
  }
  throw new Error("No matching claim instruction found in transaction");
}

export function buildCreateMarketData(
  market: Pick<MarketPool, "fixtureId" | "marketType" | "line" | "squadId">,
  kickoffTs: number
): Buffer {
  if (!Number.isFinite(kickoffTs) || kickoffTs <= Date.now()) {
    throw new Error("on-chain market requires a future kickoff");
  }
  const fixture = Buffer.from(market.fixtureId, "utf8");
  if (fixture.length > 64) throw new Error("fixture id exceeds 64 bytes");
  const fixtureLength = Buffer.alloc(4);
  fixtureLength.writeUInt32LE(fixture.length);
  const marketType = Buffer.from([market.marketType === "match_result" ? 0 : 1]);
  const line = Buffer.alloc(4);
  line.writeUInt32LE(market.line === undefined ? 0 : Math.round(market.line * 100));
  const kickoff = Buffer.alloc(8);
  kickoff.writeBigInt64LE(BigInt(Math.floor(kickoffTs / 1_000)));
  return Buffer.concat([
    anchorDiscriminator("global", "create_market"),
    fixtureLength,
    fixture,
    Buffer.from(marketIdentitySeed(market.fixtureId, market.squadId)),
    marketType,
    line,
    kickoff,
  ]);
}

function requiredOnchainRuntime() {
  const programId = process.env.WHISTLE_PROGRAM_ID?.trim();
  const usdcMint = process.env.USDC_MINT?.trim();
  const authority = loadAuthorityKeypair();
  if (!programId || !usdcMint || !authority) {
    throw new Error("on-chain runtime is missing program, mint, or authority configuration");
  }
  return {
    connection: new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    ),
    programId: new PublicKey(programId),
    usdcMint: new PublicKey(usdcMint),
    authority,
  };
}

function decodeMarketStatus(data: Buffer): number {
  if (data.length < 52) throw new Error("market account data is truncated");
  const fixtureLength = data.readUInt32LE(40);
  const statusOffset = 44 + fixtureLength + 32 + 1 + 4 + 8;
  if (statusOffset >= data.length) throw new Error("market account layout is invalid");
  return data.readUInt8(statusOffset);
}

async function marketStatus(
  connection: Connection,
  programId: PublicKey,
  marketPda: PublicKey
): Promise<number | null> {
  const account = await connection.getAccountInfo(marketPda, "confirmed");
  if (!account) return null;
  if (!account.owner.equals(programId)) throw new Error("market PDA has an unexpected owner");
  return decodeMarketStatus(account.data);
}

export async function ensureMarketOnchain(
  market: MarketPool,
  kickoffTs: number
): Promise<{ marketPda: string; created: boolean; signature?: string }> {
  const { connection, programId, usdcMint, authority } = requiredOnchainRuntime();
  const configPda = deriveConfigPDA(programId);
  const marketPda = deriveMarketPDA(
    programId,
    market.fixtureId,
    market.marketType,
    market.line,
    market.squadId
  );
  const existingStatus = await marketStatus(connection, programId, marketPda);
  if (existingStatus !== null) {
    return { marketPda: marketPda.toBase58(), created: false };
  }

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: marketPda, isSigner: false, isWritable: true },
      { pubkey: deriveVaultPDA(programId, marketPda), isSigner: false, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: buildCreateMarketData(market, kickoffTs),
  });
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [authority],
    { commitment: "confirmed" }
  );
  return { marketPda: marketPda.toBase58(), created: true, signature };
}

export async function settleMarketOnchain(
  market: MarketPool,
  homeScore: number,
  awayScore: number
): Promise<OnchainMutation> {
  if (
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0 ||
    homeScore > 255 ||
    awayScore > 255
  ) {
    throw new Error("scores must be integers from 0 to 255");
  }
  const { connection, programId, authority } = requiredOnchainRuntime();
  const marketPda = deriveMarketPDA(
    programId,
    market.fixtureId,
    market.marketType,
    market.line,
    market.squadId
  );
  const status = await marketStatus(connection, programId, marketPda);
  if (status === 1) return { status: "already_applied" };
  if (status === 2) throw new Error("on-chain market is already void");
  if (status === null) throw new Error("on-chain market account is missing");

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: deriveConfigPDA(programId), isSigner: false, isWritable: false },
      { pubkey: marketPda, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([
      anchorDiscriminator("global", "settle"),
      Buffer.from([homeScore, awayScore, 1]),
    ]),
  });
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [authority],
    { commitment: "confirmed" }
  );
  return { status: "submitted", signature };
}

export async function voidMarketOnchain(market: MarketPool): Promise<OnchainMutation> {
  const { connection, programId, authority } = requiredOnchainRuntime();
  const marketPda = deriveMarketPDA(
    programId,
    market.fixtureId,
    market.marketType,
    market.line,
    market.squadId
  );
  const status = await marketStatus(connection, programId, marketPda);
  if (status === 2) return { status: "already_applied" };
  if (status === 1) throw new Error("on-chain market is already settled");
  if (status === null) throw new Error("on-chain market account is missing");

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: deriveConfigPDA(programId), isSigner: false, isWritable: false },
      { pubkey: marketPda, isSigner: false, isWritable: true },
    ],
    data: anchorDiscriminator("global", "void_market"),
  });
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [authority],
    { commitment: "confirmed" }
  );
  return { status: "submitted", signature };
}

export async function validateOnchainDeployment(cfg: AppConfig): Promise<void> {
  if (!cfg.onchainSettlementEnabled) return;
  if (!cfg.whistleProgramId || !cfg.usdcMint) {
    throw new Error("on-chain configuration is incomplete");
  }
  const authority = loadAuthorityKeypair();
  if (!authority) throw new Error("on-chain authority keypair could not be loaded");

  const connection = new Connection(cfg.solanaRpcUrl, "confirmed");
  const programId = new PublicKey(cfg.whistleProgramId);
  const configPda = deriveConfigPDA(programId);
  const [program, config] = await Promise.all([
    connection.getAccountInfo(programId, "confirmed"),
    connection.getAccountInfo(configPda, "confirmed"),
  ]);
  if (!program?.executable) throw new Error("WHISTLE_PROGRAM_ID is not deployed and executable");
  if (!config || !config.owner.equals(programId)) {
    throw new Error("Whistle config PDA is missing or owned by another program");
  }
  if (config.data.length < 75 || !config.data.subarray(0, 8).equals(CONFIG_DISCRIMINATOR)) {
    throw new Error("Whistle config PDA has an unexpected layout");
  }
  const storedAuthority = new PublicKey(config.data.subarray(8, 40));
  const storedMint = new PublicKey(config.data.subarray(40, 72));
  const storedFeeBps = config.data.readUInt16LE(72);
  if (!storedAuthority.equals(authority.publicKey)) {
    throw new Error("configured authority does not own the Whistle config PDA");
  }
  if (!storedMint.equals(new PublicKey(cfg.usdcMint))) {
    throw new Error("configured USDC mint does not match the Whistle config PDA");
  }
  if (storedFeeBps !== cfg.platformFeeBps) {
    throw new Error(
      `PLATFORM_FEE_BPS (${cfg.platformFeeBps}) does not match on-chain config (${storedFeeBps})`
    );
  }
  if (cfg.platformFeeBps > 0) {
    const adminAta = getAssociatedTokenAddressSync(
      new PublicKey(cfg.usdcMint),
      authority.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    const ataInfo = await connection.getAccountInfo(adminAta, "confirmed");
    if (!ataInfo) {
      throw new Error(
        `authority USDC ATA missing at ${adminAta.toBase58()}; create it before enabling platform fees`
      );
    }
  }
}

export function validateOnchainLedgerState(state: AppState): void {
  const positionsByOwnerMarket = new Set<string>();
  const marketTotals = new Map<string, bigint>();
  const outcomeTotals = new Map<string, bigint>();

  for (const position of Object.values(state.positions)) {
    if (!state.markets[position.marketId]) {
      throw new Error(`position ${position.id} references a missing market`);
    }
    if (!position.deposits?.length && !position.txSignature) {
      throw new Error(
        `position ${position.id} has no on-chain deposit evidence; use a fresh ledger for USDC mode`
      );
    }
    const key = `${position.marketId}\u0000${position.owner}`;
    if (positionsByOwnerMarket.has(key)) {
      throw new Error(
        `multiple ledger positions map to one on-chain PDA for market ${position.marketId}`
      );
    }
    positionsByOwnerMarket.add(key);

    const amount = amountToBaseUnits(position.amount);
    if (position.deposits?.length) {
      const depositTotal = position.deposits.reduce(
        (sum, deposit) => sum + amountToBaseUnits(deposit.amount),
        0n
      );
      if (depositTotal !== amount) {
        throw new Error(`position ${position.id} deposit history does not match its amount`);
      }
    }
    marketTotals.set(position.marketId, (marketTotals.get(position.marketId) || 0n) + amount);
    const outcomeKey = `${position.marketId}\u0000${position.outcome}`;
    outcomeTotals.set(outcomeKey, (outcomeTotals.get(outcomeKey) || 0n) + amount);
  }

  for (const market of Object.values(state.markets)) {
    const recordedTotal = amountToBaseUnitsOrZero(market.totalPool);
    if (recordedTotal !== (marketTotals.get(market.id) || 0n)) {
      throw new Error(`market ${market.id} total does not match its on-chain-backed positions`);
    }
    for (const [outcome, value] of Object.entries(market.outcomes)) {
      const recordedOutcome = amountToBaseUnitsOrZero(value);
      if (recordedOutcome !== (outcomeTotals.get(`${market.id}\u0000${outcome}`) || 0n)) {
        throw new Error(`market ${market.id} outcome totals are inconsistent`);
      }
    }
  }
}

function amountToBaseUnitsOrZero(amount: number): bigint {
  return amount === 0 ? 0n : amountToBaseUnits(amount);
}
