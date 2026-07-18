import type { Adapter } from "@solana/wallet-adapter-base";
import {
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
  SolanaMobileWalletAdapter,
} from "@solana-mobile/wallet-adapter-mobile";
import { normalizeSolanaNetwork, type SolanaCluster } from "./solana-cluster";

export function isMobileWebBrowser(userAgent = globalThis.navigator?.userAgent ?? ""): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export function isPhantomInjected(): boolean {
  if (typeof window === "undefined") return false;
  const phantom = (window as Window & {
    phantom?: { solana?: { isPhantom?: boolean } };
    solana?: { isPhantom?: boolean };
  }).phantom?.solana;
  const solana = (window as Window & { solana?: { isPhantom?: boolean } }).solana;
  return Boolean(phantom?.isPhantom || solana?.isPhantom);
}

/** Open current page inside Phantom's in-app browser (works on Android + iOS). */
export function openPhantomBrowse(href = globalThis.location?.href): void {
  if (typeof window === "undefined" || !href) return;
  const url = encodeURIComponent(href);
  const ref = encodeURIComponent(window.location.origin);
  window.location.assign(`https://phantom.app/ul/browse/${url}?ref=${ref}`);
}

/** Open current page inside Solflare's in-app browser. */
export function openSolflareBrowse(href = globalThis.location?.href): void {
  if (typeof window === "undefined" || !href) return;
  const url = encodeURIComponent(href);
  const ref = encodeURIComponent(window.location.origin);
  window.location.assign(`https://solflare.com/ul/v1/browse/${url}?ref=${ref}`);
}

export function mobileWalletCluster(network: string | null | undefined): SolanaCluster {
  return normalizeSolanaNetwork(network);
}

/**
 * Explicit Mobile Wallet Adapter pinned to the API cluster (Devnet in playground).
 * WalletProvider skips auto-injection when this adapter is already present.
 */
export function createDevnetMobileWalletAdapter(network: string | null | undefined): Adapter | null {
  if (typeof window === "undefined") return null;
  if (!isMobileWebBrowser()) return null;

  const origin = window.location.origin;
  return new SolanaMobileWalletAdapter({
    addressSelector: createDefaultAddressSelector(),
    appIdentity: {
      name: "Whistle",
      uri: origin,
      icon: `${origin}/icons/whistle-192.png`,
    },
    authorizationResultCache: createDefaultAuthorizationResultCache(),
    cluster: mobileWalletCluster(network),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  });
}
