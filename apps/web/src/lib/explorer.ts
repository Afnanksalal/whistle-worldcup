/** Build Solana Explorer URLs from the live cluster name (no hardcoded cluster). */

function clusterQuery(network: string): string {
  const normalized = network.trim().toLowerCase();
  if (!normalized || normalized === "mainnet-beta" || normalized === "mainnet") {
    return "";
  }
  return `?cluster=${encodeURIComponent(normalized)}`;
}

export function explorerTxUrl(signature: string, network: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${clusterQuery(network)}`;
}

export function explorerAddressUrl(address: string, network: string): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}${clusterQuery(network)}`;
}
