import "dotenv/config";
import fs from "fs";
import nacl from "tweetnacl";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { networkConfig, refreshGuestJwt } from "../txline/client";

/**
 * Helper to activate TxLINE free-tier API access on devnet.
 * Requires a funded Solana keypair at SOLANA_KEYPAIR_PATH.
 *
 * Note: Full Anchor subscribe CPI needs the TxLINE IDL. This script
 * documents the activation flow and refreshes a guest JWT; if you already
 * subscribed on-chain via TxLINE docs, set TXLINE_API_TOKEN in .env.
 */
async function main() {
  const network = process.env.TXLINE_NETWORK || "devnet";
  const net = networkConfig(network);
  const apiOrigin = process.env.TXLINE_API_ORIGIN || net.apiOrigin;
  const keyPath = process.env.SOLANA_KEYPAIR_PATH || "./wallet.json";

  if (!fs.existsSync(keyPath)) {
    const kp = Keypair.generate();
    fs.writeFileSync(keyPath, JSON.stringify(Array.from(kp.secretKey)));
    console.log("Generated wallet at", keyPath);
    console.log("Pubkey:", kp.publicKey.toBase58());
    console.log("Fund with solana airdrop 2", kp.publicKey.toBase58(), "--url", net.rpcUrl);
  }

  const secret = JSON.parse(fs.readFileSync(keyPath, "utf8")) as number[];
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));
  console.log("Wallet:", wallet.publicKey.toBase58());

  const jwt = await refreshGuestJwt(apiOrigin);
  console.log("Guest JWT acquired");

  const existingToken = process.env.TXLINE_API_TOKEN;
  if (existingToken) {
    console.log("TXLINE_API_TOKEN already set — smoke testing fixtures…");
    const res = await fetch(`${apiOrigin}/api/fixtures`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": existingToken,
      },
    });
    console.log("fixtures status", res.status, (await res.text()).slice(0, 200));
    return;
  }

  console.log(`
Next steps (from TxLINE World Cup free tier docs):
1. Fund wallet with devnet SOL
2. Call txoracle.subscribe(1, 4) with program ${net.programId}
3. Sign message: \`\${txSig}::\${jwt}\`
4. POST ${apiOrigin}/api/token/activate
5. Put the returned token in TXLINE_API_TOKEN

Until then the API will not boot — set TXLINE_API_TOKEN after activation.
`);
  console.log("Guest JWT (temporary):", jwt.slice(0, 24) + "…");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
