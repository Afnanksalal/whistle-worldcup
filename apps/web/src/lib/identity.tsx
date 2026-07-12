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

type IdentityCtx = {
  owner: string | null;
  isConnected: boolean;
  ready: boolean;
  withWalletAuth: () => Promise<Record<string, string>>;
};

const Ctx = createContext<IdentityCtx>({
  owner: null,
  isConnected: false,
  ready: false,
  withWalletAuth: async () => ({}),
});

export function IdentityProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const { meta } = useRuntime();

  const owner = wallet.publicKey?.toBase58() || null;

  const withWalletAuth = useCallback(async (): Promise<Record<string, string>> => {
    if (!meta.requireWalletAuth) return {};
    if (!wallet.publicKey || !wallet.signMessage) {
      throw new Error("Connect a wallet that supports message signing");
    }
    const walletAddr = wallet.publicKey.toBase58();
    const challenge = await api<{ nonce: string; message: string }>("/auth/challenge", {
      method: "POST",
      body: JSON.stringify({ wallet: walletAddr }),
    });
    const encoded = new TextEncoder().encode(challenge.message);
    const sig = await wallet.signMessage(encoded);
    return {
      "x-wallet": walletAddr,
      "x-wallet-nonce": challenge.nonce,
      "x-wallet-signature": bs58.encode(sig),
    };
  }, [meta.requireWalletAuth, wallet.publicKey, wallet.signMessage]);

  const value = useMemo(
    () => ({
      owner,
      isConnected: !!wallet.publicKey,
      ready: !!wallet.publicKey,
      withWalletAuth,
    }),
    [owner, wallet.publicKey, withWalletAuth]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useIdentity() {
  return useContext(Ctx);
}
