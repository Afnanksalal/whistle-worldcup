#!/usr/bin/env node
/**
 * scripts/init-program.js
 * ─────────────────────────────────────────────────────────────────────────
 * One-shot initializer for the Whistle Anchor escrow program.
 *
 * Prerequisites:
 *   - WHISTLE_PROGRAM_ID set in .env (or environment)
 *   - WHISTLE_AUTHORITY_KEY or SOLANA_KEYPAIR_PATH pointing to the authority keypair
 *   - SOLANA_RPC_URL pointing to devnet (or mainnet-beta)
 *   - USDC_MINT set to the correct USDC mint for the cluster
 *
 * Usage:
 *   node scripts/init-program.js              # default 250 bps (2.5%)
 *   node scripts/init-program.js --fee-bps 500 # 5%
 *
 * What it does:
 *   1. Derives the config PDA  [b"whistle_config"]
 *   2. Checks if the config account already exists
 *   3. If not, sends the initialize instruction with fee_bps
 *   4. Prints the config PDA, authority, and fee_bps on success
 */

import "dotenv/config";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "crypto";
import bs58 from "bs58";
import fs from "fs";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

// ── helpers ────────────────────────────────────────────────────────────────

function discriminator(name) {
  return createHash("sha256").update(`global:${name}`).digest().slice(0, 8);
}

function loadKeypair() {
  const secret = process.env.WHISTLE_AUTHORITY_KEY;
  if (secret) {
    try {
      if (secret.startsWith("[")) return Keypair.fromSecretKey(new Uint8Array(JSON.parse(secret)));
      return Keypair.fromSecretKey(bs58.decode(secret));
    } catch {}
  }
  const path = process.env.SOLANA_KEYPAIR_PATH;
  if (path && fs.existsSync(path)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8"))));
  }
  throw new Error(
    "No keypair found. Set WHISTLE_AUTHORITY_KEY or SOLANA_KEYPAIR_PATH in .env"
  );
}

function deriveConfigPDA(programId) {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("whistle_config")],
    programId
  );
  return { pda, bump };
}

function deriveAssociatedTokenAddress(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

async function ensureAdminTokenAccount(connection, authority, mint) {
  const address = deriveAssociatedTokenAddress(authority.publicKey, mint);
  if (await connection.getAccountInfo(address, "confirmed")) return address;
  const instruction = new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: address, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [authority],
    { commitment: "confirmed" }
  );
  return address;
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const feeBpsArg = process.argv.indexOf("--fee-bps");
  const feeBps = feeBpsArg !== -1
    ? parseInt(process.argv[feeBpsArg + 1], 10)
    : parseInt(process.env.PLATFORM_FEE_BPS || "250", 10);

  if (isNaN(feeBps) || feeBps < 0 || feeBps > 1000) {
    console.error("Invalid --fee-bps value. Must be 0-1000.");
    process.exit(1);
  }

  if (!process.env.WHISTLE_PROGRAM_ID || !process.env.USDC_MINT) {
    throw new Error("WHISTLE_PROGRAM_ID and USDC_MINT are required");
  }
  const programId = new PublicKey(process.env.WHISTLE_PROGRAM_ID);
  const usdcMint = new PublicKey(process.env.USDC_MINT);
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

  const connection = new Connection(rpcUrl, "confirmed");
  const authority = loadKeypair();

  const { pda: configPda } = deriveConfigPDA(programId);

  console.log("─────────────────────────────────────────────");
  console.log("Whistle Program Initializer");
  console.log("─────────────────────────────────────────────");
  console.log(`Program ID   : ${programId.toBase58()}`);
  console.log(`Config PDA   : ${configPda.toBase58()}`);
  console.log(`Authority    : ${authority.publicKey.toBase58()}`);
  console.log(`USDC Mint    : ${usdcMint.toBase58()}`);
  console.log(`Fee BPS      : ${feeBps} (${(feeBps / 100).toFixed(2)}%)`);
  console.log(`RPC          : ${rpcUrl}`);
  console.log("─────────────────────────────────────────────");

  // Check if already initialized
  const existing = await connection.getAccountInfo(configPda);
  if (existing) {
    if (!existing.owner.equals(programId) || existing.data.length < 75) {
      throw new Error("Existing config PDA has an unexpected owner or layout");
    }
    const authorityBytes = existing.data.slice(8, 40);
    const storedAuthority = new PublicKey(authorityBytes);
    const storedMint = new PublicKey(existing.data.slice(40, 72));
    const storedFeeBps = existing.data.readUInt16LE(72);
    if (!storedAuthority.equals(authority.publicKey)) {
      throw new Error("Existing config PDA is owned by a different authority");
    }
    if (!storedMint.equals(usdcMint)) {
      throw new Error("Existing config PDA uses a different USDC mint");
    }
    if (storedFeeBps !== feeBps) {
      throw new Error(
        `Existing config PDA fee is ${storedFeeBps} BPS, expected ${feeBps} BPS`
      );
    }
    console.log("✅ Config PDA already exists and matches this deployment.");
    console.log(`   Authority : ${storedAuthority.toBase58()}`);
    console.log(`   USDC Mint : ${storedMint.toBase58()}`);
    console.log(`   Fee BPS   : ${storedFeeBps} (${(storedFeeBps / 100).toFixed(2)}%)`);
    const adminToken = await ensureAdminTokenAccount(connection, authority, usdcMint);
    console.log(`   Admin ATA : ${adminToken.toBase58()}`);
    return;
  }

  // Build initialize instruction data: discriminator (8) + fee_bps (2 bytes u16 LE)
  const disc = discriminator("initialize");
  const feeBuf = Buffer.alloc(2);
  feeBuf.writeUInt16LE(feeBps);
  const data = Buffer.concat([disc, feeBuf]);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true }, // authority
      { pubkey: usdcMint, isSigner: false, isWritable: false },           // usdc_mint
      { pubkey: configPda, isSigner: false, isWritable: true },           // config
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  console.log("\nSending initialize transaction...");

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: "confirmed",
    });
    console.log(`\n✅ Program initialized successfully!`);
    console.log(`   Signature : ${sig}`);
    console.log(`   Explorer  : https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    console.log(`\n   Config PDA: ${configPda.toBase58()}`);
    console.log(`   Fee       : ${feeBps} BPS (${(feeBps / 100).toFixed(2)}%)`);
    const adminToken = await ensureAdminTokenAccount(connection, authority, usdcMint);
    console.log(`   Admin ATA : ${adminToken.toBase58()}`);
    console.log(`\nAdd to your .env:`);
    console.log(`   WHISTLE_PROGRAM_ID=${programId.toBase58()}`);
  } catch (err) {
    console.error("\n❌ Initialization failed:", err.message);
    if (err.logs) {
      console.error("Program logs:");
      err.logs.forEach((l) => console.error("  ", l));
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
