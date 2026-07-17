#!/usr/bin/env node
/**
 * scripts/settle-market.js
 * ─────────────────────────────────────────────────────────────────────────
 * Admin script to settle a market on-chain after a match finishes.
 *
 * Prerequisites:
 *   - WHISTLE_PROGRAM_ID, WHISTLE_AUTHORITY_KEY / SOLANA_KEYPAIR_PATH
 *   - SOLANA_RPC_URL
 *
 * Usage:
 *   node scripts/settle-market.js --fixture <id> --type match_result --home 2 --away 1
 *   node scripts/settle-market.js --fixture <id> --type totals --line 2.5 --home 1 --away 2
 */

import "dotenv/config";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "crypto";
import bs58 from "bs58";
import fs from "fs";

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
  throw new Error("No keypair found.");
}

function deriveConfigPDA(programId) {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("whistle_config")], programId);
  return pda;
}

function deriveMarketPDA(programId, fixtureId, marketType, line, squadId) {
  const typeU8 = marketType === "match_result" ? 0 : 1;
  const lineVal = line ? Math.round(parseFloat(line) * 100) : 0;
  const lineBuf = Buffer.alloc(4);
  lineBuf.writeUInt32LE(lineVal);
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      createHash("sha256")
        .update(`${fixtureId}\u0000${squadId || "public"}`)
        .digest(),
      Buffer.from([typeU8]),
      lineBuf,
    ],
    programId
  );
  return pda;
}

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
}

async function main() {
  const fixtureId  = getArg("--fixture");
  const marketType = getArg("--type") || "match_result";
  const line       = getArg("--line");
  const squadId    = getArg("--squad");
  const homeScore  = parseInt(getArg("--home") || "0", 10);
  const awayScore  = parseInt(getArg("--away") || "0", 10);

  if (!fixtureId || !process.argv.includes("--validation-confirmed")) {
    console.error("Usage: node scripts/settle-market.js --fixture <id> --home <score> --away <score> --validation-confirmed [--type total_goals --line 2.5] [--squad <id>]");
    process.exit(1);
  }
  if (![homeScore, awayScore].every((score) => Number.isInteger(score) && score >= 0 && score <= 255)) {
    throw new Error("Scores must be integers from 0 to 255");
  }
  if (!process.env.WHISTLE_PROGRAM_ID) {
    throw new Error("WHISTLE_PROGRAM_ID is required");
  }

  const programId = new PublicKey(process.env.WHISTLE_PROGRAM_ID);
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const authority = loadKeypair();

  const configPda = deriveConfigPDA(programId);
  const marketPda = deriveMarketPDA(programId, fixtureId, marketType, line, squadId);

  console.log("─────────────────────────────────────────────");
  console.log("Whistle Market Settler");
  console.log("─────────────────────────────────────────────");
  console.log(`Fixture    : ${fixtureId}`);
  console.log(`Market     : ${marketPda.toBase58()}`);
  console.log(`Score      : ${homeScore} – ${awayScore}`);
  console.log("─────────────────────────────────────────────");

  // settle(home_score: u8, away_score: u8, _validation_ok: bool)
  const disc = discriminator("settle");
  const data = Buffer.concat([
    disc,
    Buffer.from([homeScore, awayScore, 1]), // 1 = validation_ok true
  ]);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false }, // authority
      { pubkey: configPda, isSigner: false, isWritable: false },           // config
      { pubkey: marketPda, isSigner: false, isWritable: true },            // market
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [authority], { commitment: "confirmed" });

  console.log(`\n✅ Market settled!`);
  console.log(`   Signature : ${sig}`);
  console.log(`   Explorer  : https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main().catch((err) => { console.error(err); process.exit(1); });
