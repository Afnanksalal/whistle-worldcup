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
import {
  createBackpackBrowseAdapter,
  createPhantomBrowseAdapter,
  createSolflareBrowseAdapter,
} from "../lib/browse-wallet-adapter";
import { DemoWalletAdapter } from "../lib/demo-wallet";
import { IdentityProvider } from "../lib/identity";
import { RuntimeProvider, useRuntime } from "../lib/runtime";
import { solanaRpcEndpoint } from "../lib/solana-cluster";
import {
  lastWalletLaunch,
  launchWalletDeepLink,
} from "../lib/wallet-deeplinks";
import { createDevnetMobileWalletAdapter, isMobileWebBrowser } from "../lib/wallet-mobile";

function WalletProviders({ children }: { children: ReactNode }) {
  const { meta } = useRuntime();
  const endpoint = useMemo(
    () => solanaRpcEndpoint(meta.network),
    [meta.network]
  );
  const wallets = useMemo(() => {
    const list: Adapter[] = [];

    if (meta.demoWalletEnabled) {
      list.push(new DemoWalletAdapter());
    }

    // Pin MWA cluster to API network (Devnet) — do not infer mainnet from RPC host quirks.
    const mobile = createDevnetMobileWalletAdapter(meta.network);
    if (mobile) list.push(mobile);

    // Browse-capable wallets: mobile opens the correct in-app browser UL.
    list.push(createPhantomBrowseAdapter());
    list.push(createSolflareBrowseAdapter());
    list.push(createBackpackBrowseAdapter());
    return list;
  }, [meta.demoWalletEnabled, meta.network]);

  const onWalletError = useCallback((error: WalletError) => {
    console.warn("Wallet connection error", error);
    if (!(error instanceof WalletNotReadyError)) return;

    const remembered = lastWalletLaunch();
    if (launchWalletDeepLink(remembered, { preferInstall: !isMobileWebBrowser() })) {
      return;
    }
    // Fallback: Phantom browse on mobile, else Phantom install page.
    launchWalletDeepLink("Phantom", { preferInstall: !isMobileWebBrowser() });
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
