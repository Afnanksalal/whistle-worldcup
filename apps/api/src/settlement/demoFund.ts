import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { TOKEN_PROGRAM_ID, loadAuthorityKeypair } from "./onchain";

async function withRpcRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let delay = 800;
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = String((error as Error)?.message || error);
      const retryable =
        message.includes("429") ||
        message.includes("Too Many Requests") ||
        message.includes("ECONNRESET") ||
        message.includes("fetch failed");
      if (!retryable || i === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 12_000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fundDemoWallet(args: {
  wallet: string;
  usdcAmount?: number;
  solAmount?: number;
}): Promise<{
  wallet: string;
  usdcMint: string;
  usdcAta: string;
  usdcBalance: number;
  solBalance: number;
  signatures: string[];
}> {
  const authority = loadAuthorityKeypair();
  const mintStr = process.env.USDC_MINT?.trim();
  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  if (!authority || !mintStr) {
    throw new Error("demo funding requires authority keypair and USDC_MINT");
  }

  const connection = new Connection(rpc, "confirmed");
  const wallet = new PublicKey(args.wallet);
  const mint = new PublicKey(mintStr);
  const ata = getAssociatedTokenAddressSync(mint, wallet);
  const usdcAmount = Math.max(1, Math.min(args.usdcAmount ?? 500, 5_000));
  const solAmount = Math.max(0.01, Math.min(args.solAmount ?? 0.15, 1));
  const signatures: string[] = [];

  const solBalance = await withRpcRetry(() => connection.getBalance(wallet, "confirmed"));
  if (solBalance < 0.05 * LAMPORTS_PER_SOL) {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: wallet,
        lamports: Math.round(solAmount * LAMPORTS_PER_SOL),
      })
    );
    signatures.push(
      await withRpcRetry(() =>
        sendAndConfirmTransaction(connection, tx, [authority], {
          commitment: "confirmed",
          maxRetries: 5,
        })
      )
    );
  }

  const mintIx = createMintToInstruction(
    mint,
    ata,
    authority.publicKey,
    BigInt(Math.round(usdcAmount * 1_000_000))
  );
  const setup = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      authority.publicKey,
      ata,
      wallet,
      mint,
      TOKEN_PROGRAM_ID
    ),
    mintIx
  );
  signatures.push(
    await withRpcRetry(() =>
      sendAndConfirmTransaction(connection, setup, [authority], {
        commitment: "confirmed",
        maxRetries: 5,
      })
    )
  );

  const token = await withRpcRetry(() => getAccount(connection, ata, "confirmed"));
  const lamports = await withRpcRetry(() => connection.getBalance(wallet, "confirmed"));

  return {
    wallet: wallet.toBase58(),
    usdcMint: mint.toBase58(),
    usdcAta: ata.toBase58(),
    usdcBalance: Number(token.amount) / 1_000_000,
    solBalance: lamports / LAMPORTS_PER_SOL,
    signatures,
  };
}
