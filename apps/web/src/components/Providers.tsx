"use client";

import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import "@solana/wallet-adapter-react-ui/styles.css";
import { IdentityProvider } from "../lib/identity";
import { RuntimeProvider } from "../lib/runtime";

export function Providers({ children }: { children: ReactNode }) {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <RuntimeProvider>
            <IdentityProvider>{children}</IdentityProvider>
          </RuntimeProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
