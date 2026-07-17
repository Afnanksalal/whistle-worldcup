"use client";

import {
  BaseWalletAdapter,
  WalletReadyState,
  type WalletName,
  type WalletAdapterProps,
} from "@solana/wallet-adapter-base";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
  type TransactionSignature,
  Keypair,
} from "@solana/web3.js";
import bs58 from "bs58";

const STORAGE_KEY = "whistle.demo.wallet.secret";

function loadOrCreateKeypair(): Keypair {
  if (typeof window === "undefined") {
    return Keypair.generate();
  }
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      return Keypair.fromSecretKey(bs58.decode(existing));
    }
  } catch {
    // fall through and mint a fresh key
  }
  const fresh = Keypair.generate();
  try {
    window.localStorage.setItem(STORAGE_KEY, bs58.encode(fresh.secretKey));
  } catch {
    // ignore storage failures (private mode)
  }
  return fresh;
}

export const DemoWalletName = "Whistle Demo" as WalletName<"Whistle Demo">;

/**
 * Local keypair wallet for playground / browser QA.
 * Secret stays in localStorage; never leave ENABLE_DEMO_WALLET on for mainnet.
 */
export class DemoWalletAdapter extends BaseWalletAdapter {
  name = DemoWalletName;
  url = "https://github.com/Afnanksalal/whistle-worldcup";
  icon =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iOCIgZmlsbD0iIzFkNjY0ZCIvPjx0ZXh0IHg9IjE2IiB5PSIyMSIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI3MDAiPkQ8L3RleHQ+PC9zdmc+";
  supportedTransactionVersions = new Set(["legacy", 0] as const);

  private _connecting = false;
  private _publicKey: PublicKey | null = null;
  private _keypair: Keypair | null = null;
  private _readyState: WalletReadyState =
    typeof window === "undefined" ? WalletReadyState.Unsupported : WalletReadyState.Loadable;

  get publicKey() {
    return this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  get readyState() {
    return this._readyState;
  }

  async connect(): Promise<void> {
    if (this._publicKey) return;
    this._connecting = true;
    try {
      this._keypair = loadOrCreateKeypair();
      this._publicKey = this._keypair.publicKey;
      this.emit("connect", this._publicKey);
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._publicKey = null;
    this._keypair = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (!this._keypair) throw new Error("Demo wallet is not connected");
    if (transaction instanceof VersionedTransaction) {
      transaction.sign([this._keypair]);
      return transaction;
    }
    transaction.partialSign(this._keypair);
    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]> {
    return Promise.all(transactions.map((tx) => this.signTransaction(tx)));
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this._keypair) throw new Error("Demo wallet is not connected");
    const nacl = await import("tweetnacl");
    return nacl.sign.detached(message, this._keypair.secretKey);
  }

  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    connection: Parameters<WalletAdapterProps["sendTransaction"]>[1],
    options?: Parameters<WalletAdapterProps["sendTransaction"]>[2]
  ): Promise<TransactionSignature> {
    if (!this._publicKey || !this._keypair) throw new Error("Demo wallet is not connected");
    if (transaction instanceof VersionedTransaction) {
      transaction.sign([this._keypair]);
      return connection.sendTransaction(transaction, options);
    }
    transaction.feePayer ||= this._publicKey;
    if (!transaction.recentBlockhash) {
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
    }
    transaction.partialSign(this._keypair);
    return connection.sendRawTransaction(transaction.serialize(), options);
  }
}
