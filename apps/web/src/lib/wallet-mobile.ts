import type { Adapter } from "@solana/wallet-adapter-base";
import {
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
  SolanaMobileWalletAdapter,
} from "@solana-mobile/wallet-adapter-mobile";
import { normalizeSolanaNetwork, type SolanaCluster } from "./solana-cluster";
import { launchWalletDeepLink } from "./wallet-deeplinks";

export function isMobileWebBrowser(userAgent = globalThis.navigator?.userAgent ?? ""): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

/** @deprecated Prefer launchWalletDeepLink("Phantom") */
export function openPhantomBrowse(href = globalThis.location?.href): void {
  launchWalletDeepLink("Phantom", { href });
}

/** @deprecated Prefer launchWalletDeepLink("Solflare") */
export function openSolflareBrowse(href = globalThis.location?.href): void {
  launchWalletDeepLink("Solflare", { href });
}

export function openBackpackBrowse(href = globalThis.location?.href): void {
  launchWalletDeepLink("Backpack", { href });
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
