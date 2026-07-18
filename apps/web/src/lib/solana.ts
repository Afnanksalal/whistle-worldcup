import { useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  amountToBaseUnits,
  marketIdentitySeed,
  outcomeToU8,
  type MarketOutcome,
  type MarketType,
} from "@whistle/shared";
import { useRuntime } from "./runtime";
import {
  clusterLabel,
  expectedGenesisHash,
  normalizeSolanaNetwork,
} from "./solana-cluster";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
const DEPOSIT_DISCRIMINATOR = Buffer.from([
  0xf2, 0x23, 0xc6, 0x89, 0x52, 0xe1, 0xf2, 0xb6,
]);
const CLAIM_DISCRIMINATOR = Buffer.from([
  0x3e, 0xc6, 0xd6, 0xc1, 0xd5, 0x9f, 0x6c, 0xd2,
]);

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
  const marketTypeByte =
    marketType === "match_result" ? 0 : marketType === "total_corners" ? 2 : 1;
  const lineBuffer = Buffer.alloc(4);
  lineBuffer.writeUInt32LE(line === undefined ? 0 : Math.round(line * 100));
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      Buffer.from(marketIdentitySeed(fixtureId, squadId)),
      Buffer.from([marketTypeByte]),
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

export function deriveUserATA(user: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [user.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

export function useSolanaTransactions() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { meta } = useRuntime();

  const assertCluster = useCallback(async () => {
    const expected = expectedGenesisHash(meta.network);
    const label = clusterLabel(meta.network);
    let genesis: string;
    try {
      genesis = await connection.getGenesisHash();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not reach Solana ${label} RPC: ${message}`);
    }
    if (genesis !== expected) {
      throw new Error(
        `Wrong Solana cluster. Whistle is on ${label}, but this connection is elsewhere. Switch your wallet/app RPC to Solana ${label} and try again.`
      );
    }
  }, [connection, meta.network]);

  const send = useCallback(
    async (instruction: TransactionInstruction): Promise<string> => {
      if (!publicKey) throw new Error("Wallet not connected");
      if (!signTransaction) {
        throw new Error(
          "This wallet cannot sign transactions in the browser. Use Whistle Demo or another Solana wallet."
        );
      }

      await assertCluster();

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
        "confirmed"
      );
      const transaction = new Transaction({
        feePayer: publicKey,
        recentBlockhash: blockhash,
      }).add(instruction);

      // Sign in-wallet, then broadcast on OUR Connection (devnet).
      // Wallet signAndSendTransaction often posts to the wallet's selected
      // cluster (mainnet), which breaks playground staking.
      const signed = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
        skipPreflight: false,
      });
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      return signature;
    },
    [assertCluster, connection, publicKey, signTransaction]
  );

  const deposit = useCallback(
    async (args: {
      programId: string;
      usdcMint: string;
      fixtureId: string;
      marketType: MarketType;
      line?: number;
      squadId?: string;
      outcome: MarketOutcome;
      amount: number;
    }): Promise<string> => {
      if (!publicKey) throw new Error("Wallet not connected");
      if (normalizeSolanaNetwork(meta.network) === "mainnet-beta" && meta.demoWalletEnabled) {
        throw new Error("Demo staking is disabled on mainnet.");
      }
      const programId = new PublicKey(args.programId);
      const mint = new PublicKey(args.usdcMint);
      const market = deriveMarketPDA(
        programId,
        args.fixtureId,
        args.marketType,
        args.line,
        args.squadId
      );
      const amountBuffer = Buffer.alloc(8);
      amountBuffer.writeBigUInt64LE(amountToBaseUnits(args.amount));
      return send(
        new TransactionInstruction({
          programId,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: market, isSigner: false, isWritable: true },
            { pubkey: deriveVaultPDA(programId, market), isSigner: false, isWritable: true },
            {
              pubkey: derivePositionPDA(programId, market, publicKey),
              isSigner: false,
              isWritable: true,
            },
            { pubkey: deriveUserATA(publicKey, mint), isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.concat([
            DEPOSIT_DISCRIMINATOR,
            Buffer.from([outcomeToU8(args.marketType, args.outcome)]),
            amountBuffer,
          ]),
        })
      );
    },
    [meta.demoWalletEnabled, meta.network, publicKey, send]
  );

  const claim = useCallback(
    async (args: {
      programId: string;
      usdcMint: string;
      fixtureId: string;
      marketType: MarketType;
      line?: number;
      squadId?: string;
    }): Promise<string> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const programId = new PublicKey(args.programId);
      const mint = new PublicKey(args.usdcMint);
      const config = deriveConfigPDA(programId);
      const market = deriveMarketPDA(
        programId,
        args.fixtureId,
        args.marketType,
        args.line,
        args.squadId
      );
      const configAccount = await connection.getAccountInfo(config, "confirmed");
      if (!configAccount || configAccount.data.length < 40) {
        throw new Error("Whistle config account not found on-chain");
      }
      const authority = new PublicKey(configAccount.data.subarray(8, 40));
      return send(
        new TransactionInstruction({
          programId,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: config, isSigner: false, isWritable: false },
            { pubkey: market, isSigner: false, isWritable: true },
            { pubkey: deriveVaultPDA(programId, market), isSigner: false, isWritable: true },
            {
              pubkey: derivePositionPDA(programId, market, publicKey),
              isSigner: false,
              isWritable: true,
            },
            { pubkey: deriveUserATA(publicKey, mint), isSigner: false, isWritable: true },
            { pubkey: deriveUserATA(authority, mint), isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          data: CLAIM_DISCRIMINATOR,
        })
      );
    },
    [connection, publicKey, send]
  );

  return { deposit, claim };
}
