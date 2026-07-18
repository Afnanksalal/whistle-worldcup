import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

/** Known genesis hashes — used to refuse staking against the wrong cluster. */
export const SOLANA_GENESIS = {
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
} as const;

export type SolanaCluster = keyof typeof SOLANA_GENESIS;

export function normalizeSolanaNetwork(network: string | null | undefined): SolanaCluster {
  const value = (network || "devnet").trim().toLowerCase();
  if (value === "mainnet" || value === "mainnet-beta") return "mainnet-beta";
  if (value === "testnet") return "testnet";
  return "devnet";
}

export function walletAdapterNetwork(network: string | null | undefined): WalletAdapterNetwork {
  const cluster = normalizeSolanaNetwork(network);
  if (cluster === "mainnet-beta") return WalletAdapterNetwork.Mainnet;
  if (cluster === "testnet") return WalletAdapterNetwork.Testnet;
  return WalletAdapterNetwork.Devnet;
}

/** Prefer API meta.network so the UI never silently talks to mainnet in playground. */
export function solanaRpcEndpoint(
  network: string | null | undefined,
  envRpc = process.env.NEXT_PUBLIC_SOLANA_RPC
): string {
  const cluster = normalizeSolanaNetwork(network);
  const fromEnv = (envRpc || "").trim();
  if (fromEnv) {
    const lower = fromEnv.toLowerCase();
    if (cluster === "devnet" && (lower.includes("mainnet") || lower.includes("testnet"))) {
      return "https://api.devnet.solana.com";
    }
    if (cluster === "mainnet-beta" && (lower.includes("devnet") || lower.includes("testnet"))) {
      return "https://api.mainnet-beta.solana.com";
    }
    return fromEnv;
  }
  if (cluster === "mainnet-beta") return "https://api.mainnet-beta.solana.com";
  if (cluster === "testnet") return "https://api.testnet.solana.com";
  return "https://api.devnet.solana.com";
}

export function expectedGenesisHash(network: string | null | undefined): string {
  return SOLANA_GENESIS[normalizeSolanaNetwork(network)];
}

export function clusterLabel(network: string | null | undefined): string {
  const cluster = normalizeSolanaNetwork(network);
  if (cluster === "mainnet-beta") return "Mainnet";
  if (cluster === "testnet") return "Testnet";
  return "Devnet";
}
