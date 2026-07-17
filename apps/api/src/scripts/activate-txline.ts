import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import nacl from "tweetnacl";

// Mirror the API's env resolution so the script works from any cwd.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { networkConfig, refreshGuestJwt } from "../txline/client";

/**
 * Activate a real TxLINE World Cup free-tier API token end to end.
 *
 * Flow (per https://txline.txodds.com/documentation/worldcup):
 *   1. Load or generate a Solana keypair at SOLANA_KEYPAIR_PATH.
 *   2. Ensure it holds a little SOL (devnet airdrop attempted automatically).
 *   3. Send the on-chain `subscribe(serviceLevelId, weeks)` transaction
 *      (creating the user's TxL associated token account if needed).
 *   4. Acquire a guest JWT, sign `${txSig}:${leagues}:${jwt}`, and POST it to
 *      `/api/token/activate`.
 *   5. Print the activated API token — put it in TXLINE_API_TOKEN.
 *
 * If TXLINE_API_TOKEN is already set, the script only smoke-tests fixtures.
 *
 * Env knobs: TXLINE_NETWORK, TXLINE_API_ORIGIN, SOLANA_KEYPAIR_PATH,
 *   TXLINE_SERVICE_LEVEL_ID (default 1), TXLINE_DURATION_WEEKS (default 4),
 *   TXLINE_LEAGUES (comma-separated league IDs; empty = standard free bundle).
 */

// Token-2022 + Associated Token Account program ids (stable Solana constants).
const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
// Anchor discriminator for txoracle `subscribe` (matches the on-chain IDL).
const SUBSCRIBE_DISCRIMINATOR = Buffer.from([254, 28, 191, 138, 156, 179, 183, 53]);

function deriveAta(mint: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

function createAtaIdempotentIx(
  payer: PublicKey,
  ata: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]), // CreateIdempotent
  });
}

function subscribeIx(args: {
  programId: PublicKey;
  user: PublicKey;
  mint: PublicKey;
  serviceLevelId: number;
  weeks: number;
}): TransactionInstruction {
  const [pricingMatrix] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    args.programId
  );
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    args.programId
  );
  const userTokenAccount = deriveAta(args.mint, args.user);
  const treasuryVault = deriveAta(args.mint, treasuryPda);

  const data = Buffer.alloc(SUBSCRIBE_DISCRIMINATOR.length + 3);
  SUBSCRIBE_DISCRIMINATOR.copy(data, 0);
  data.writeUInt16LE(args.serviceLevelId, SUBSCRIBE_DISCRIMINATOR.length);
  data.writeUInt8(args.weeks, SUBSCRIBE_DISCRIMINATOR.length + 2);

  return new TransactionInstruction({
    programId: args.programId,
    data,
    keys: [
      { pubkey: args.user, isSigner: true, isWritable: true },
      { pubkey: pricingMatrix, isSigner: false, isWritable: false },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: treasuryVault, isSigner: false, isWritable: true },
      { pubkey: treasuryPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

async function ensureFunds(
  connection: Connection,
  wallet: Keypair,
  rpcUrl: string
): Promise<void> {
  const balance = await connection.getBalance(wallet.publicKey);
  console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");
  if (balance >= 0.05 * LAMPORTS_PER_SOL) return;
  if (!rpcUrl.includes("devnet")) {
    throw new Error(
      `Wallet ${wallet.publicKey.toBase58()} needs SOL for the subscribe transaction. Fund it and retry.`
    );
  }
  // Devnet: best-effort airdrop across the primary RPC and known fallbacks.
  const faucets = [rpcUrl, "https://solana-devnet.g.alchemy.com/v2/demo"];
  for (const url of faucets) {
    try {
      const conn = new Connection(url, "confirmed");
      const sig = await conn.requestAirdrop(wallet.publicKey, 1 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
      console.log("Airdropped 1 SOL via", url);
      return;
    } catch (e) {
      console.log("airdrop via", url, "failed:", String(e).slice(0, 120));
    }
  }
  const after = await connection.getBalance(wallet.publicKey);
  if (after < 0.01 * LAMPORTS_PER_SOL) {
    throw new Error(
      `Could not obtain devnet SOL automatically. Fund ${wallet.publicKey.toBase58()} (e.g. https://faucet.solana.com) and retry.`
    );
  }
}

async function main() {
  const network = process.env.TXLINE_NETWORK || "devnet";
  const net = networkConfig(network);
  const apiOrigin = process.env.TXLINE_API_ORIGIN || net.apiOrigin;
  const keyPath = process.env.SOLANA_KEYPAIR_PATH || "./wallet.json";
  const serviceLevelId = Number(process.env.TXLINE_SERVICE_LEVEL_ID || 1);
  const weeks = Number(process.env.TXLINE_DURATION_WEEKS || 4);
  const leagues = (process.env.TXLINE_LEAGUES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  console.log("Network:", network, "program:", net.programId, "api:", apiOrigin);

  const existingToken = process.env.TXLINE_API_TOKEN;
  if (existingToken && !existingToken.startsWith("txl_")) {
    console.log("TXLINE_API_TOKEN already set — smoke testing fixtures…");
    const jwt = await refreshGuestJwt(apiOrigin);
    const res = await fetch(`${apiOrigin}/api/fixtures/snapshot`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": existingToken,
        Accept: "application/json",
      },
    });
    console.log("fixtures status", res.status, (await res.text()).slice(0, 200));
    return;
  }

  if (!fs.existsSync(keyPath)) {
    const kp = Keypair.generate();
    fs.writeFileSync(keyPath, JSON.stringify(Array.from(kp.secretKey)));
    console.log("Generated wallet at", keyPath);
    console.log("Pubkey:", kp.publicKey.toBase58());
  }

  const secret = JSON.parse(fs.readFileSync(keyPath, "utf8")) as number[];
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));
  console.log("Wallet:", wallet.publicKey.toBase58());

  const connection = new Connection(net.rpcUrl, "confirmed");
  await ensureFunds(connection, wallet, net.rpcUrl);

  const programId = new PublicKey(net.programId);
  const mint = new PublicKey(net.txlTokenMint);
  const userAta = deriveAta(mint, wallet.publicKey);

  const tx = new Transaction()
    .add(createAtaIdempotentIx(wallet.publicKey, userAta, wallet.publicKey, mint))
    .add(subscribeIx({ programId, user: wallet.publicKey, mint, serviceLevelId, weeks }));

  console.log(`Subscribing: serviceLevel=${serviceLevelId} weeks=${weeks} leagues=[${leagues.join(",")}]`);
  const txSig = await sendAndConfirmTransaction(connection, tx, [wallet], {
    commitment: "confirmed",
  });
  console.log("subscribe tx:", txSig);

  const jwt = await refreshGuestJwt(apiOrigin);
  const message = new TextEncoder().encode(`${txSig}:${leagues.join(",")}:${jwt}`);
  const walletSignature = Buffer.from(
    nacl.sign.detached(message, wallet.secretKey)
  ).toString("base64");

  const activateRes = await fetch(`${apiOrigin}/api/token/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ txSig, walletSignature, leagues }),
  });
  const body = await activateRes.text();
  if (!activateRes.ok) {
    throw new Error(`activate failed: ${activateRes.status} ${body.slice(0, 300)}`);
  }
  let apiToken = body.trim();
  try {
    const parsed = JSON.parse(body);
    apiToken = parsed.token || parsed.apiToken || apiToken;
  } catch {
    // plain-text token response
  }

  console.log("\n✅ Activated TxLINE API token:\n");
  console.log(apiToken);
  console.log("\nAdd it to your environment as TXLINE_API_TOKEN (never commit it).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
