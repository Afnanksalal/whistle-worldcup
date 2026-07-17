"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import type { WalletError } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { CoinbaseWalletAdapter } from "@solana/wallet-adapter-coinbase";
import { LedgerWalletAdapter } from "@solana/wallet-adapter-ledger";
import { TorusWalletAdapter } from "@solana/wallet-adapter-torus";
import { TrustWalletAdapter } from "@solana/wallet-adapter-trust";
import { XDEFIWalletAdapter } from "@solana/wallet-adapter-xdefi";
import { SafePalWalletAdapter } from "@solana/wallet-adapter-safepal";
import { IdentityProvider } from "../lib/identity";
import { RuntimeProvider } from "../lib/runtime";

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com",
    []
  );
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new LedgerWalletAdapter(),
      new TorusWalletAdapter(),
      new TrustWalletAdapter(),
      new XDEFIWalletAdapter(),
      new SafePalWalletAdapter(),
    ],
    []
  );
  const onWalletError = useCallback((error: WalletError) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Wallet connection error", error);
    }
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={onWalletError}>
        <WalletModalProvider>
          <RuntimeProvider>
            <IdentityProvider>{children}</IdentityProvider>
          </RuntimeProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
