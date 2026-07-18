"use client";

import {
  BaseMessageSignerWalletAdapter,
  isVersionedTransaction,
  scopePollingDetectionStrategy,
  WalletAccountError,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletDisconnectionError,
  WalletError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletPublicKeyError,
  WalletReadyState,
  WalletSendTransactionError,
  WalletSignMessageError,
  WalletSignTransactionError,
  type WalletName,
} from "@solana/wallet-adapter-base";
import {
  PublicKey,
  type Transaction,
  type TransactionSignature,
  type VersionedTransaction,
} from "@solana/web3.js";
import { launchWalletDeepLink } from "./wallet-deeplinks";
import { isMobileWebBrowser } from "./wallet-mobile";

export type InjectedSolanaProvider = {
  isConnected?: boolean;
  publicKey?: { toBytes(): Uint8Array } | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
  signAndSendTransaction?(
    transaction: Transaction | VersionedTransaction,
    options?: unknown
  ): Promise<{ signature: TransactionSignature } | TransactionSignature>;
  signTransaction?<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions?<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]>;
  signMessage?(message: Uint8Array): Promise<{ signature: Uint8Array } | Uint8Array>;
};

export type BrowseWalletAdapterConfig = {
  name: WalletName;
  url: string;
  icon: string;
  isInjected: () => boolean;
  getProvider: () => InjectedSolanaProvider | null | undefined;
};

/**
 * Shared adapter for wallets that support mobile in-app browse universal links.
 * Installed (injected) → normal connect. Mobile without inject → Loadable + browse UL.
 */
export class BrowseWalletAdapter extends BaseMessageSignerWalletAdapter {
  name: WalletName;
  url: string;
  icon: string;
  supportedTransactionVersions = new Set(["legacy", 0] as const);

  private _connecting = false;
  private _wallet: InjectedSolanaProvider | null = null;
  private _publicKey: PublicKey | null = null;
  private _readyState: WalletReadyState =
    typeof window === "undefined" ? WalletReadyState.Unsupported : WalletReadyState.NotDetected;
  private readonly _isInjected: () => boolean;
  private readonly _getProvider: () => InjectedSolanaProvider | null | undefined;

  private _disconnected = () => {
    const wallet = this._wallet;
    if (!wallet) return;
    wallet.off?.("disconnect", this._disconnected);
    wallet.off?.("accountChanged", this._accountChanged);
    this._wallet = null;
    this._publicKey = null;
    this.emit("error", new WalletDisconnectedError());
    this.emit("disconnect");
  };

  private _accountChanged = (newPublicKey: unknown) => {
    const publicKey = this._publicKey;
    if (!publicKey) return;
    try {
      const next = new PublicKey((newPublicKey as { toBytes(): Uint8Array }).toBytes());
      if (publicKey.equals(next)) return;
      this._publicKey = next;
      this.emit("connect", next);
    } catch (error) {
      this.emit("error", new WalletPublicKeyError((error as Error)?.message, error));
    }
  };

  constructor(config: BrowseWalletAdapterConfig) {
    super();
    this.name = config.name;
    this.url = config.url;
    this.icon = config.icon;
    this._isInjected = config.isInjected;
    this._getProvider = config.getProvider;

    if (this._readyState === WalletReadyState.Unsupported) return;

    if (this._isInjected()) {
      this._readyState = WalletReadyState.Installed;
      this.emit("readyStateChange", this._readyState);
      return;
    }

    if (isMobileWebBrowser()) {
      this._readyState = WalletReadyState.Loadable;
      this.emit("readyStateChange", this._readyState);
      return;
    }

    scopePollingDetectionStrategy(() => {
      if (this._isInjected()) {
        this._readyState = WalletReadyState.Installed;
        this.emit("readyStateChange", this._readyState);
        return true;
      }
      return false;
    });
  }

  get publicKey() {
    return this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  get readyState() {
    return this._readyState;
  }

  async autoConnect(): Promise<void> {
    if (this.readyState === WalletReadyState.Installed) {
      await this.connect();
    }
  }

  async connect(): Promise<void> {
    try {
      if (this.connected || this.connecting) return;

      if (this.readyState === WalletReadyState.Loadable) {
        launchWalletDeepLink(this.name);
        return;
      }

      if (this.readyState !== WalletReadyState.Installed) {
        throw new WalletNotReadyError();
      }

      this._connecting = true;
      const wallet = this._getProvider();
      if (!wallet) throw new WalletNotReadyError();

      if (!wallet.isConnected) {
        try {
          await wallet.connect();
        } catch (error) {
          throw new WalletConnectionError((error as Error)?.message, error);
        }
      }
      if (!wallet.publicKey) throw new WalletAccountError();

      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(wallet.publicKey.toBytes());
      } catch (error) {
        throw new WalletPublicKeyError((error as Error)?.message, error);
      }

      wallet.on?.("disconnect", this._disconnected);
      wallet.on?.("accountChanged", this._accountChanged);
      this._wallet = wallet;
      this._publicKey = publicKey;
      this.emit("connect", publicKey);
    } catch (error) {
      this.emit("error", error as WalletError);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    const wallet = this._wallet;
    if (wallet) {
      wallet.off?.("disconnect", this._disconnected);
      wallet.off?.("accountChanged", this._accountChanged);
      this._wallet = null;
      this._publicKey = null;
      try {
        await wallet.disconnect();
      } catch (error) {
        this.emit("error", new WalletDisconnectionError((error as Error)?.message, error));
      }
    }
    this.emit("disconnect");
  }

  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    connection: Parameters<BaseMessageSignerWalletAdapter["sendTransaction"]>[1],
    options: Parameters<BaseMessageSignerWalletAdapter["sendTransaction"]>[2] = {}
  ): Promise<TransactionSignature> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        const { signers, ...sendOptions } = options ?? {};
        let tx = transaction;
        if (isVersionedTransaction(tx)) {
          signers?.length && tx.sign(signers);
        } else {
          tx = (await this.prepareTransaction(tx, connection, sendOptions)) as Transaction;
          signers?.length && tx.partialSign(...signers);
        }
        sendOptions.preflightCommitment =
          sendOptions.preflightCommitment || connection.commitment;

        if (!wallet.signAndSendTransaction) {
          throw new WalletSendTransactionError("Wallet cannot send transactions");
        }
        const result = await wallet.signAndSendTransaction(tx, sendOptions);
        return typeof result === "string" ? result : result.signature;
      } catch (error) {
        if (error instanceof WalletError) throw error;
        throw new WalletSendTransactionError((error as Error)?.message, error);
      }
    } catch (error) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    try {
      const wallet = this._wallet;
      if (!wallet?.signTransaction) throw new WalletNotConnectedError();
      try {
        return (await wallet.signTransaction(transaction)) || transaction;
      } catch (error) {
        throw new WalletSignTransactionError((error as Error)?.message, error);
      }
    } catch (error) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]> {
    try {
      const wallet = this._wallet;
      if (!wallet?.signAllTransactions) throw new WalletNotConnectedError();
      try {
        return (await wallet.signAllTransactions(transactions)) || transactions;
      } catch (error) {
        throw new WalletSignTransactionError((error as Error)?.message, error);
      }
    } catch (error) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    try {
      const wallet = this._wallet;
      if (!wallet?.signMessage) throw new WalletNotConnectedError();
      try {
        const result = await wallet.signMessage(message);
        return result instanceof Uint8Array ? result : result.signature;
      } catch (error) {
        throw new WalletSignMessageError((error as Error)?.message, error);
      }
    } catch (error) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }
}

export function createPhantomBrowseAdapter(): BrowseWalletAdapter {
  return new BrowseWalletAdapter({
    name: "Phantom" as WalletName<"Phantom">,
    url: "https://phantom.app",
    icon:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiB2aWV3Qm94PSIwIDAgMTA4IDEwOCIgZmlsbD0ibm9uZSI+CjxyZWN0IHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiByeD0iMjYiIGZpbGw9IiNBQjlGRjIiLz4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik00Ni41MjY3IDY5LjkyMjlDNDIuMDA1NCA3Ni44NTA5IDM0LjQyOTIgODUuNjE4MiAyNC4zNDggODUuNjE4MkMxOS41ODI0IDg1LjYxODIgMTUgODMuNjU2MyAxNSA3NS4xMzQyQzE1IDUzLjQzMDUgNDQuNjMyNiAxOS44MzI3IDcyLjEyNjggMTkuODMyN0M4Ny43NjggMTkuODMyNyA5NCAzMC42ODQ2IDk0IDQzLjAwNzlDOTQgNTguODI1OCA4My43MzU1IDc2LjkxMjIgNzMuNTMyMSA3Ni45MTIyQzcwLjI5MzkgNzYuOTEyMiA2OC43MDUzIDc1LjEzNDIgNjguNzA1MyA3Mi4zMTRDNjguNzA1MyA3MS41NzgzIDY4LjgyNzUgNzAuNzgxMiA2OS4wNzE5IDY5LjkyMjlDNjUuNTg5MyA3NS44Njk5IDU4Ljg2ODUgODEuMzg3OCA1Mi41NzU0IDgxLjM4NzhDNDcuOTkzIDgxLjM4NzggNDUuNjcxMyA3OC41MDYzIDQ1LjY3MTMgNzQuNDU5OEM0NS42NzEzIDcyLjk4ODQgNDUuOTc2OCA3MS40NTU2IDQ2LjUyNjcgNjkuOTIyOVpNODMuNjc2MSA0Mi41Nzk0QzgzLjY3NjEgNDYuMTcwNCA4MS41NTc1IDQ3Ljk2NTggNzkuMTg3NSA0Ny45NjU4Qzc2Ljc4MTYgNDcuOTY1OCA3NC42OTg5IDQ2LjE3MDQgNzQuNjk4OSA0Mi41Nzk0Qzc0LjY5ODkgMzguOTg4NSA3Ni43ODE2IDM3LjE5MzEgNzkuMTg3NSAzNy4xOTMxQzgxLjU1NzUgMzcuMTkzMSA4My42NzYxIDM4Ljk4ODUgODMuNjc2MSA0Mi41Nzk0Wk03MC4yMTAzIDQyLjU3OTVDNzAuMjEwMyA0Ni4xNzA0IDY4LjA5MTYgNDcuOTY1OCA2NS43MjE2IDQ3Ljk2NThDNjMuMzE1NyA0Ny45NjU4IDYxLjIzMyA0Ni4xNzA0IDYxLjIzMyA0Mi41Nzk1QzYxLjIzMyAzOC45ODg1IDYzLjMxNTcgMzcuMTkzMSA2NS43MjE2IDM3LjE5MzFDNjguMDkxNiAzNy4xOTMxIDcwLjIxMDMgMzguOTg4NSA3MC4yMTAzIDQyLjU3OTVaIiBmaWxsPSIjRkZGREY4Ii8+Cjwvc3ZnPg==",
    isInjected: () => {
      if (typeof window === "undefined") return false;
      const w = window as Window & {
        phantom?: { solana?: { isPhantom?: boolean } };
        solana?: { isPhantom?: boolean };
      };
      return Boolean(w.phantom?.solana?.isPhantom || w.solana?.isPhantom);
    },
    getProvider: () => {
      const w = window as Window & {
        phantom?: { solana?: InjectedSolanaProvider };
        solana?: InjectedSolanaProvider;
      };
      return w.phantom?.solana || w.solana;
    },
  });
}

export function createSolflareBrowseAdapter(): BrowseWalletAdapter {
  return new BrowseWalletAdapter({
    name: "Solflare" as WalletName<"Solflare">,
    url: "https://solflare.com",
    icon:
      "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48c3ZnIGlkPSJTIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MCA1MCI+PGRlZnM+PHN0eWxlPi5jbHMtMXtmaWxsOiMwMjA1MGE7c3Ryb2tlOiNmZmVmNDY7c3Ryb2tlLW1pdGVybGltaXQ6MTA7c3Ryb2tlLXdpZHRoOi41cHg7fS5jbHMtMntmaWxsOiNmZmVmNDY7fTwvc3R5bGU+PC9kZWZzPjxyZWN0IGNsYXNzPSJjbHMtMiIgeD0iMCIgd2lkdGg9IjUwIiBoZWlnaHQ9IjUwIiByeD0iMTIiIHJ5PSIxMiIvPjxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTI0LjIzLDI2LjQybDIuNDYtMi4zOCw0LjU5LDEuNWMzLjAxLDEsNC41MSwyLjg0LDQuNTEsNS40MywwLDEuOTYtLjc1LDMuMjYtMi4yNSw0LjkzbC0uNDYuNS4xNy0xLjE3Yy42Ny00LjI2LS41OC02LjA5LTQuNzItNy40M2wtNC4zLTEuMzhoMFpNMTguMDUsMTEuODVsMTIuNTIsNC4xNy0yLjcxLDIuNTktNi41MS0yLjE3Yy0yLjI1LS43NS0zLjAxLTEuOTYtMy4zLTQuNTF2LS4wOGgwWk0xNy4zLDMzLjA2bDIuODQtMi43MSw1LjM0LDEuNzVjMi44LjkyLDMuNzYsMi4xMywzLjQ2LDUuMThsLTExLjY1LTQuMjJoMFpNMTMuNzEsMjAuOTVjMC0uNzkuNDItMS41NCwxLjEzLTIuMTcuNzUsMS4wOSwyLjA1LDIuMDUsNC4wOSwyLjcxbDQuNDIsMS40Ni0yLjQ2LDIuMzgtNC4zNC0xLjQyYy0yLS42Ny0yLjg0LTEuNjctMi44NC0yLjk2TTI2LjgyLDQyLjg3YzkuMTgtNi4wOSwxNC4xMS0xMC4yMywxNC4xMS0xNS4zMiwwLTMuMzgtMi01LjI2LTYuNDMtNi43MmwtMy4zNC0xLjEzLDkuMTQtOC43Ny0xLjg0LTEuOTYtMi43MSwyLjM4LTEyLjgxLTQuMjJjLTMuOTcsMS4yOS04Ljk3LDUuMDktOC45Nyw4Ljg5LDAsLjQyLjA0LjgzLjE3LDEuMjktMy4zLDEuODgtNC42MywzLjYzLTQuNjMsNS44LDAsMi4wNSwxLjA5LDQuMDksNC41NSw1LjIybDIuNzUuOTItOS41Miw5LjE0LDEuODQsMS45NiwyLjk2LTIuNzEsMTQuNzMsNS4yMmgwWiIvPjwvc3ZnPg==",
    isInjected: () => {
      if (typeof window === "undefined") return false;
      const w = window as Window & {
        solflare?: { isSolflare?: boolean };
        SolflareApp?: unknown;
      };
      return Boolean(w.solflare?.isSolflare || w.SolflareApp);
    },
    getProvider: () => {
      const w = window as Window & { solflare?: InjectedSolanaProvider };
      return w.solflare;
    },
  });
}

export function createBackpackBrowseAdapter(): BrowseWalletAdapter {
  return new BrowseWalletAdapter({
    name: "Backpack" as WalletName<"Backpack">,
    url: "https://backpack.app",
    icon:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgcng9IjI4IiBmaWxsPSIjRTMzRTNBIi8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTM4IDM4aDUydjE2SDU0djM2SDM4VjM4em0zOCAyOGgxNnYyOEg3NlY2NnoiLz48L3N2Zz4=",
    isInjected: () => {
      if (typeof window === "undefined") return false;
      const w = window as Window & {
        backpack?: { isBackpack?: boolean };
      };
      return Boolean(w.backpack?.isBackpack);
    },
    getProvider: () => {
      const w = window as Window & { backpack?: InjectedSolanaProvider };
      return w.backpack;
    },
  });
}
