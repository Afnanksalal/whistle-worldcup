"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { SolanaMobileWalletAdapterWalletName } from "@solana-mobile/wallet-adapter-mobile";
import { clusterLabel, normalizeSolanaNetwork } from "../lib/solana-cluster";
import { useRuntime } from "../lib/runtime";
import {
  isMobileWalletAdapterName,
  launchWalletDeepLink,
  rememberWalletLaunch,
  shouldDeepLinkWallet,
} from "../lib/wallet-deeplinks";
import { isMobileWebBrowser } from "../lib/wallet-mobile";

function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function isBraveWalletName(name: string): boolean {
  return /brave/i.test(name);
}

function walletBlurb(name: string, readyState: WalletReadyState, mobile: boolean): string {
  if (name === "Whistle Demo") return "Instant playground wallet — no app install";
  if (isMobileWalletAdapterName(name)) {
    return "System sheet — pick any installed Solana wallet (Devnet)";
  }
  if (isBraveWalletName(name)) {
    return readyState === WalletReadyState.Installed
      ? "Solana account only — set Brave network to Devnet (not Ethereum)"
      : "Brave Solana wallet — switch to Devnet before staking";
  }
  if (readyState === WalletReadyState.Installed) {
    return "Detected — use Solana Devnet in wallet settings";
  }
  if (mobile) {
    if (name === "Phantom" || name === "Solflare" || name === "Backpack") {
      return `Opens this site inside the ${name} app`;
    }
    return "Opens the wallet app or install page";
  }
  if (name === "Phantom" || name === "Solflare" || name === "Backpack") {
    return `Install ${name} or open it on mobile`;
  }
  return readyState === WalletReadyState.Loadable ? "Available" : "Not detected";
}

export function WalletConnectButton() {
  const { meta } = useRuntime();
  const {
    wallets,
    select,
    disconnect,
    connecting,
    connected,
    publicKey,
    wallet,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const mobile = useMemo(() => isMobileWebBrowser(), []);
  const networkName = clusterLabel(meta.network);
  const isDevnet = normalizeSolanaNetwork(meta.network) === "devnet";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open && !menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, open]);

  // Lock background scroll so the wallet list can pan on mobile browsers (Brave/iOS).
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.classList.add("wallet-modal-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("wallet-modal-open");
      document.body.style.overflow = previous;
    };
  }, [open]);

  const ordered = useMemo(() => {
    const rank = (name: string) => {
      if (name === "Whistle Demo") return 0;
      if (name === SolanaMobileWalletAdapterWalletName) return 1;
      if (name === "Phantom") return 2;
      if (name === "Solflare") return 3;
      if (name === "Backpack") return 4;
      if (isBraveWalletName(name)) return 5;
      return 10;
    };
    return [...wallets].sort((a, b) => rank(a.adapter.name) - rank(b.adapter.name));
  }, [wallets]);

  const choose = useCallback(
    (name: WalletName) => {
      const entry = wallets.find((item) => item.adapter.name === name);
      if (!entry) return;

      rememberWalletLaunch(name);

      if (
        shouldDeepLinkWallet({
          name,
          readyState: entry.readyState,
          mobile,
        })
      ) {
        select(name);
        const launched = launchWalletDeepLink(name, {
          preferInstall: !mobile && entry.readyState === WalletReadyState.NotDetected,
        });
        // Unknown wallet on mobile: fall back to adapter homepage.
        if (!launched && entry.adapter.url) {
          window.open(entry.adapter.url, "_blank", "noopener,noreferrer");
        }
        setOpen(false);
        return;
      }

      // Installed / Demo / MWA: select() + autoConnect on the next render.
      select(name);
      setOpen(false);
    },
    [mobile, select, wallets]
  );

  if (!mounted) {
    return (
      <button
        className="wallet-adapter-button wallet-adapter-button-trigger"
        type="button"
        aria-busy="true"
        aria-label="Wallet controls loading"
        disabled
      >
        Select Wallet
      </button>
    );
  }

  if (connected && publicKey) {
    return (
      <div className="wallet-connect">
        <button
          type="button"
          className="wallet-adapter-button wallet-adapter-button-trigger wallet-connect-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {wallet?.adapter.icon ? (
            <span className="wallet-adapter-button-start-icon wallet-connect-trigger-icon">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wallet.adapter.icon} alt="" width={20} height={20} />
            </span>
          ) : null}
          <span className="wallet-connect-trigger-label">
            {shortAddress(publicKey.toBase58())}
          </span>
        </button>
        {menuOpen && (
          <div className="wallet-connect-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void navigator.clipboard?.writeText(publicKey.toBase58());
                setMenuOpen(false);
              }}
            >
              Copy address
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void disconnect();
                setMenuOpen(false);
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="wallet-connect">
      <button
        type="button"
        className="wallet-adapter-button wallet-adapter-button-trigger"
        disabled={connecting}
        onClick={() => setOpen(true)}
      >
        {connecting ? "Connecting…" : "Select Wallet"}
      </button>

      {open && (
        <div
          className="wallet-connect-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wallet-connect-title"
        >
          <button
            type="button"
            className="wallet-connect-backdrop"
            aria-label="Close wallet picker"
            onClick={() => setOpen(false)}
          />
          <div className="wallet-connect-panel">
            <div className="wallet-connect-header">
              <h2 id="wallet-connect-title">Connect wallet</h2>
              <button type="button" className="wallet-connect-close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <p className="wallet-connect-note">
              Playground stakes on <strong>Solana {networkName}</strong>
              {isDevnet ? " (free test SOL/USDC)." : "."}
              {mobile
                ? " Scroll for every wallet. Phantom/Solflare/Backpack open their apps; Brave must be on Solana Devnet (not Ethereum)."
                : " Prefer Whistle Demo for the fastest path. Brave users: select the Solana account on Devnet."}
            </p>
            <ul className="wallet-connect-list" data-wallet-scroll="true">
              {ordered.map((entry) => {
                const name = entry.adapter.name;
                const label = isMobileWalletAdapterName(name)
                  ? "Any installed wallet (mobile)"
                  : name;
                return (
                  <li key={name}>
                    <button
                      type="button"
                      className="wallet-connect-option"
                      disabled={
                        entry.readyState === WalletReadyState.Unsupported || connecting
                      }
                      onClick={() => choose(name)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.adapter.icon} alt="" width={28} height={28} />
                      <span className="wallet-connect-option-text">
                        <strong>{label}</strong>
                        <small>{walletBlurb(name, entry.readyState, mobile)}</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
