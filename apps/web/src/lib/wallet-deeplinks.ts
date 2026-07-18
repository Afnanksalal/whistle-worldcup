import { WalletReadyState } from "@solana/wallet-adapter-base";
import { SolanaMobileWalletAdapterWalletName } from "@solana-mobile/wallet-adapter-mobile";

function isMobileWebBrowser(userAgent = globalThis.navigator?.userAgent ?? ""): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export type WalletDeepLinkConfig = {
  /** Case-insensitive exact wallet adapter name */
  name: string;
  /** Aliases that Wallet Standard / Brave / etc. may use */
  aliases?: string[];
  installUrl: string;
  /** Build an in-app browser universal link, or null if wallet has none */
  browseUrl?: (href: string, origin: string) => string;
};

function encodeBrowse(base: string, href: string, origin: string): string {
  const url = encodeURIComponent(href);
  const ref = encodeURIComponent(origin);
  return `${base}${url}?ref=${ref}`;
}

/** Official browse/install targets for every wallet Whistle lists or may detect. */
export const WALLET_DEEP_LINKS: WalletDeepLinkConfig[] = [
  {
    name: "Phantom",
    aliases: ["Phantom Legacy"],
    installUrl: "https://phantom.app/",
    // Official adapter uses /ul/browse (not /ul/v1/browse).
    browseUrl: (href, origin) =>
      encodeBrowse("https://phantom.app/ul/browse/", href, origin),
  },
  {
    name: "Solflare",
    installUrl: "https://solflare.com/",
    browseUrl: (href, origin) =>
      encodeBrowse("https://solflare.com/ul/v1/browse/", href, origin),
  },
  {
    name: "Backpack",
    installUrl: "https://backpack.app/",
    browseUrl: (href, origin) =>
      encodeBrowse("https://backpack.app/ul/v1/browse/", href, origin),
  },
  {
    name: "Brave Wallet",
    aliases: ["Brave", "Brave Wallet (Solana)"],
    installUrl: "https://brave.com/wallet/",
    // Brave is an in-browser wallet — no external browse UL.
  },
  {
    name: "Glow",
    installUrl: "https://glow.app/",
  },
  {
    name: "Exodus",
    installUrl: "https://www.exodus.com/download/",
  },
  {
    name: "Coinbase Wallet",
    aliases: ["Coinbase"],
    installUrl: "https://www.coinbase.com/wallet",
  },
];

export function normalizeWalletName(name: string | null | undefined): string {
  return (name || "").trim();
}

export function findWalletDeepLink(
  name: string | null | undefined
): WalletDeepLinkConfig | null {
  const target = normalizeWalletName(name).toLowerCase();
  if (!target) return null;
  return (
    WALLET_DEEP_LINKS.find((entry) => {
      if (entry.name.toLowerCase() === target) return true;
      return (entry.aliases || []).some((alias) => alias.toLowerCase() === target);
    }) || null
  );
}

export function isMobileWalletAdapterName(name: string | null | undefined): boolean {
  return normalizeWalletName(name) === SolanaMobileWalletAdapterWalletName;
}

export function buildWalletBrowseUrl(
  name: string | null | undefined,
  href = globalThis.location?.href,
  origin = globalThis.location?.origin
): string | null {
  const config = findWalletDeepLink(name);
  if (!config?.browseUrl || !href || !origin) return null;
  return config.browseUrl(href, origin);
}

export function walletInstallUrl(name: string | null | undefined): string | null {
  return findWalletDeepLink(name)?.installUrl || null;
}

/** Persist last picker choice so onError can deep-link the correct wallet. */
const LAST_WALLET_KEY = "whistle.lastWalletLaunch";

export function rememberWalletLaunch(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LAST_WALLET_KEY, name);
  } catch {
    // ignore
  }
}

export function lastWalletLaunch(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(LAST_WALLET_KEY);
  } catch {
    return null;
  }
}

/**
 * Open the right destination for a wallet:
 * - mobile + browse UL → in-app browser
 * - else install / homepage
 */
export function launchWalletDeepLink(
  name: string | null | undefined,
  opts?: { href?: string; preferInstall?: boolean }
): boolean {
  if (typeof window === "undefined") return false;
  if (isMobileWalletAdapterName(name)) return false;

  const config = findWalletDeepLink(name);
  const href = opts?.href || window.location.href;
  const mobile = isMobileWebBrowser();

  if (!opts?.preferInstall && mobile && config?.browseUrl) {
    window.location.assign(config.browseUrl(href, window.location.origin));
    return true;
  }

  const install = config?.installUrl;
  if (install) {
    window.open(install, "_blank", "noopener,noreferrer");
    return true;
  }

  return false;
}

/**
 * Whether the picker should deep-link instead of a normal in-page connect.
 * Injected / Installed wallets connect in-place. MWA uses its own intent sheet.
 */
export function shouldDeepLinkWallet(args: {
  name: string;
  readyState: WalletReadyState;
  mobile?: boolean;
}): boolean {
  const { name, readyState } = args;
  const mobile = args.mobile ?? isMobileWebBrowser();

  if (name === "Whistle Demo") return false;
  if (isMobileWalletAdapterName(name)) return false;
  if (readyState === WalletReadyState.Installed) return false;
  if (readyState === WalletReadyState.Unsupported) return false;

  const config = findWalletDeepLink(name);
  if (!config) {
    // Unknown Wallet Standard entry: on mobile open adapter homepage.
    return mobile;
  }

  // Mobile: browse UL when available, otherwise install page.
  if (mobile) return true;
  // Desktop: only deep-link (install tab) when the extension is missing.
  return readyState === WalletReadyState.NotDetected;
}
