"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import type { Adapter, WalletError } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { DemoWalletAdapter } from "../lib/demo-wallet";
import { IdentityProvider } from "../lib/identity";
import { RuntimeProvider, useRuntime } from "../lib/runtime";
import { solanaRpcEndpoint, walletAdapterNetwork } from "../lib/solana-cluster";

function WalletProviders({ children }: { children: ReactNode }) {
  const { meta } = useRuntime();
  const endpoint = useMemo(
    () => solanaRpcEndpoint(meta.network),
    [meta.network]
  );
  const wallets = useMemo(() => {
    const network = walletAdapterNetwork(meta.network);
    // Solflare uses `network` for signAndSendTransaction cluster selection.
    const list: Adapter[] = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ];
    if (meta.demoWalletEnabled) list.unshift(new DemoWalletAdapter());
    return list;
  }, [meta.demoWalletEnabled, meta.network]);
  const onWalletError = useCallback((error: WalletError) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Wallet connection error", error);
    }
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={onWalletError}>
        <WalletModalProvider>
          <IdentityProvider>{children}</IdentityProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <RuntimeProvider>
      <WalletProviders>{children}</WalletProviders>
    </RuntimeProvider>
  );
}
