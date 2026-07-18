"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { SolanaMobileWalletAdapterWalletName } from "@solana-mobile/wallet-adapter-mobile";
import { clusterLabel, normalizeSolanaNetwork } from "../lib/solana-cluster";
import { useRuntime } from "../lib/runtime";
import {
  isMobileWebBrowser,
  openPhantomBrowse,
  openSolflareBrowse,
} from "../lib/wallet-mobile";

function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function walletBlurb(name: string, readyState: WalletReadyState, mobile: boolean): string {
  if (name === "Whistle Demo") return "Instant playground wallet — no app install";
  if (name === SolanaMobileWalletAdapterWalletName) {
    return "Opens Phantom or Solflare on this phone (Devnet)";
  }
  if (name === "Phantom") {
    if (mobile && readyState !== WalletReadyState.Installed) {
      return "Opens this site inside the Phantom app";
    }
    return readyState === WalletReadyState.Installed
      ? "Browser extension detected"
      : "Install Phantom or open in the Phantom app";
  }
  if (name === "Solflare") {
    if (mobile && readyState !== WalletReadyState.Installed) {
      return "Opens this site inside the Solflare app";
    }
    return "Solflare wallet";
  }
  return readyState === WalletReadyState.Installed ? "Detected" : "Available";
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

  const ordered = useMemo(() => {
    const rank = (name: string) => {
      if (name === "Whistle Demo") return 0;
      if (name === SolanaMobileWalletAdapterWalletName) return 1;
      if (name === "Phantom") return 2;
      if (name === "Solflare") return 3;
      return 10;
    };
    return [...wallets].sort((a, b) => rank(a.adapter.name) - rank(b.adapter.name));
  }, [wallets]);

  const choose = useCallback(
    (name: WalletName) => {
      const entry = wallets.find((item) => item.adapter.name === name);
      if (!entry) return;

      // Mobile browsers without an injected provider: open the wallet in-app browser.
      // Persist selection first so autoConnect resumes after returning from the app.
      if (name === "Phantom" && entry.readyState !== WalletReadyState.Installed) {
        if (mobile || entry.readyState === WalletReadyState.Loadable) {
          select(name);
          openPhantomBrowse();
          setOpen(false);
          return;
        }
        select(name);
        window.open("https://phantom.app/", "_blank", "noopener,noreferrer");
        setOpen(false);
        return;
      }

      if (name === "Solflare" && mobile && entry.readyState !== WalletReadyState.Installed) {
        select(name);
        openSolflareBrowse();
        setOpen(false);
        return;
      }

      // select() + autoConnect connects on the next render.
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
          className="wallet-adapter-button wallet-adapter-button-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {wallet?.adapter.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wallet.adapter.icon} alt="" width={24} height={24} />
          ) : null}
          {shortAddress(publicKey.toBase58())}
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
                ? " On phones, tap Phantom / Solflare (mobile) or Phantom to open your app."
                : " Prefer Whistle Demo for the fastest path."}
            </p>
            <ul className="wallet-connect-list">
              {ordered.map((entry) => {
                const name = entry.adapter.name;
                const label =
                  name === SolanaMobileWalletAdapterWalletName
                    ? "Phantom / Solflare (mobile)"
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
