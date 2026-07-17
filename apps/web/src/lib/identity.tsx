"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { api } from "./api";
import { useRuntime } from "./runtime";

type WalletAuthOpts = {
  /** Force a signed challenge even when REQUIRE_WALLET_AUTH is off (e.g. demo faucet). */
  required?: boolean;
};

type IdentityCtx = {
  owner: string | null;
  isConnected: boolean;
  ready: boolean;
  withWalletAuth: (opts?: WalletAuthOpts) => Promise<Record<string, string>>;
};

const Ctx = createContext<IdentityCtx>({
  owner: null,
  isConnected: false,
  ready: false,
  withWalletAuth: async () => ({}),
});

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage } = useWallet();
  const { meta } = useRuntime();

  const owner = publicKey?.toBase58() || null;
  const canSignMessage = Boolean(signMessage);
  const ready = Boolean(publicKey && (!meta.requireWalletAuth || canSignMessage));

  const withWalletAuth = useCallback(
    async (opts?: WalletAuthOpts): Promise<Record<string, string>> => {
      if (!meta.requireWalletAuth && !opts?.required) return {};
      if (!publicKey || !signMessage) {
        throw new Error("Connect a wallet that supports message signing");
      }
      const walletAddr = publicKey.toBase58();
      const challenge = await api<{ nonce: string; message: string }>("/auth/challenge", {
        method: "POST",
        body: JSON.stringify({ wallet: walletAddr }),
      });
      const encoded = new TextEncoder().encode(challenge.message);
      const sig = await signMessage(encoded);
      return {
        "x-wallet": walletAddr,
        "x-wallet-nonce": challenge.nonce,
        "x-wallet-signature": bs58.encode(sig),
      };
    },
    [meta.requireWalletAuth, publicKey, signMessage]
  );

  const value = useMemo(
    () => ({
      owner,
      isConnected: !!publicKey,
      ready,
      withWalletAuth,
    }),
    [owner, publicKey, ready, withWalletAuth]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useIdentity() {
  return useContext(Ctx);
}
