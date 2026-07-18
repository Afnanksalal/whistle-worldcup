"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import {
  WalletNotReadyError,
  type Adapter,
  type WalletError,
} from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { DemoWalletAdapter } from "../lib/demo-wallet";
import { IdentityProvider } from "../lib/identity";
import { PhantomBrowseWalletAdapter } from "../lib/phantom-browse-adapter";
import { RuntimeProvider, useRuntime } from "../lib/runtime";
import { solanaRpcEndpoint, walletAdapterNetwork } from "../lib/solana-cluster";
import {
  createDevnetMobileWalletAdapter,
  isMobileWebBrowser,
  openPhantomBrowse,
} from "../lib/wallet-mobile";

function WalletProviders({ children }: { children: ReactNode }) {
  const { meta } = useRuntime();
  const endpoint = useMemo(
    () => solanaRpcEndpoint(meta.network),
    [meta.network]
  );
  const wallets = useMemo(() => {
    const network = walletAdapterNetwork(meta.network);
    const list: Adapter[] = [];

    if (meta.demoWalletEnabled) {
      list.push(new DemoWalletAdapter());
    }

    // Pin MWA cluster to API network (Devnet) — do not infer mainnet from RPC host quirks.
    const mobile = createDevnetMobileWalletAdapter(meta.network);
    if (mobile) list.push(mobile);

    list.push(new PhantomBrowseWalletAdapter());
    list.push(new SolflareWalletAdapter({ network }));
    return list;
  }, [meta.demoWalletEnabled, meta.network]);

  const onWalletError = useCallback((error: WalletError) => {
    console.warn("Wallet connection error", error);
    if (!(error instanceof WalletNotReadyError)) return;
    if (isMobileWebBrowser()) {
      openPhantomBrowse();
      return;
    }
    // Desktop: send users to the wallet homepage instead of a no-op.
    const target = /solflare/i.test(error.message || "")
      ? "https://solflare.com/"
      : "https://phantom.app/";
    window.open(target, "_blank", "noopener,noreferrer");
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
