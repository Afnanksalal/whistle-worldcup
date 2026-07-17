export type AppConfig = {
  port: number;
  nodeEnv: string;
  network: string;
  apiOrigin: string;
  apiToken: string;
  guestJwt: string;
  corsOrigins: string[] | true | false;
  adminApiKey: string;
  keepSettleEnabled: boolean;
  requireWalletAuth: boolean;
  whistleProgramId: string | null;
  usdcMint: string | null;
  solanaRpcUrl: string;
  settlementRail: "ledger" | "onchain";
  stakeAsset: "USDC" | "units";
  onchainSettlementEnabled: boolean;
  platformFeeBps: number;
  logLevel: string;
  rateLimitPerMin: number;
  /** Playground-only: mint demo USDC + SOL to connected wallets. */
  demoWalletEnabled: boolean;
};

function truthy(v: string | undefined): boolean {
  return v === "true" || v === "1" || v === "yes";
}

export function isPlaceholderTxlineToken(token: string): boolean {
  return token.startsWith("txl_");
}

/**
 * No demo mode. TXLINE_API_TOKEN + ADMIN_API_KEY required.
 * Placeholder TxLINE tokens (txl_…) boot against the free public sports schedule
 * until a real TxLINE token is configured.
 */
export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProd = nodeEnv === "production";

  if (truthy(process.env.DEMO_MODE) || truthy(process.env.ALLOW_SANDBOX)) {
    throw new Error(
      "DEMO_MODE / ALLOW_SANDBOX are removed. Unset them — use TXLINE_API_TOKEN (real or placeholder txl_…)."
    );
  }

  const apiToken = (process.env.TXLINE_API_TOKEN || "").trim();
  if (!apiToken) {
    throw new Error("TXLINE_API_TOKEN is required (real TxLINE token or placeholder txl_…).");
  }

  const adminApiKey = (process.env.ADMIN_API_KEY || process.env.KEEPER_SECRET || "").trim();
  if (!adminApiKey || adminApiKey.length < 16) {
    throw new Error("ADMIN_API_KEY is required (min 16 chars).");
  }

  const network = process.env.TXLINE_NETWORK || "devnet";
  const apiOrigin =
    process.env.TXLINE_API_ORIGIN ||
    (network === "mainnet"
      ? "https://txline.txodds.com"
      : "https://txline-dev.txodds.com");

  const railValue = (process.env.SETTLEMENT_RAIL || "ledger").trim();
  const stakeValue = (process.env.STAKE_ASSET || "units").trim();
  if (railValue !== "ledger" && railValue !== "onchain") {
    throw new Error("SETTLEMENT_RAIL must be ledger or onchain.");
  }
  if (stakeValue !== "units" && stakeValue !== "USDC") {
    throw new Error("STAKE_ASSET must be units or USDC.");
  }

  const enabledFlag = truthy(process.env.ENABLE_ONCHAIN_SETTLEMENT);
  const onchainRequested =
    enabledFlag || railValue === "onchain" || stakeValue === "USDC";
  const onchainSettlementEnabled =
    enabledFlag && railValue === "onchain" && stakeValue === "USDC";
  if (onchainRequested && !onchainSettlementEnabled) {
    throw new Error(
      "On-chain mode requires ENABLE_ONCHAIN_SETTLEMENT=true, " +
        "SETTLEMENT_RAIL=onchain, and STAKE_ASSET=USDC together."
    );
  }

  const settlementRail: "ledger" | "onchain" = onchainSettlementEnabled
    ? "onchain"
    : "ledger";
  const stakeAsset: "USDC" | "units" = onchainSettlementEnabled ? "USDC" : "units";
  const whistleProgramId = (process.env.WHISTLE_PROGRAM_ID || "").trim() || null;
  const usdcMint = (process.env.USDC_MINT || "").trim() || null;
  const platformFeeBps = Number(process.env.PLATFORM_FEE_BPS || 250);

  if (!Number.isInteger(platformFeeBps) || platformFeeBps < 0 || platformFeeBps > 1_000) {
    throw new Error("PLATFORM_FEE_BPS must be an integer from 0 to 1000.");
  }
  if (onchainSettlementEnabled) {
    if (isPlaceholderTxlineToken(apiToken)) {
      throw new Error("On-chain USDC mode requires a real TxLINE API token.");
    }
    if (!whistleProgramId || !usdcMint) {
      throw new Error(
        "WHISTLE_PROGRAM_ID and USDC_MINT are required for on-chain USDC mode."
      );
    }
    if (!(process.env.WHISTLE_AUTHORITY_KEY || process.env.SOLANA_KEYPAIR_PATH)) {
      throw new Error(
        "WHISTLE_AUTHORITY_KEY or SOLANA_KEYPAIR_PATH is required for on-chain USDC mode."
      );
    }
  }

  const corsRaw = process.env.API_CORS_ORIGIN;
  let corsOrigins: string[] | true | false;
  if (corsRaw === "same-origin") {
    corsOrigins = false;
  } else if (!corsRaw || corsRaw === "*") {
    if (isProd) {
      throw new Error(
        "API_CORS_ORIGIN must be an explicit allowlist or 'same-origin' in production (no *)."
      );
    }
    corsOrigins = true;
  } else {
    corsOrigins = corsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!corsOrigins.length) throw new Error("API_CORS_ORIGIN parsed empty");
  }

  return {
    port: Number(process.env.PORT || 4000),
    nodeEnv,
    network,
    apiOrigin,
    apiToken,
    guestJwt: (process.env.TXLINE_GUEST_JWT || "").trim(),
    corsOrigins,
    adminApiKey,
    keepSettleEnabled: process.env.KEEP_SETTLE_ENABLED !== "false",
    requireWalletAuth: truthy(process.env.REQUIRE_WALLET_AUTH) || isProd,
    whistleProgramId,
    usdcMint,
    solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    settlementRail,
    stakeAsset,
    onchainSettlementEnabled,
    platformFeeBps,
    logLevel: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
    rateLimitPerMin: (() => {
      const parsed = Number(process.env.RATE_LIMIT_PER_MIN || 120);
      if (!Number.isFinite(parsed) || parsed < 10 || parsed > 10_000) {
        throw new Error("RATE_LIMIT_PER_MIN must be a number between 10 and 10000");
      }
      return Math.floor(parsed);
    })(),
    // Devnet/playground faucet only — never enable on mainnet / mainnet-beta.
    demoWalletEnabled:
      truthy(process.env.ENABLE_DEMO_WALLET) &&
      onchainSettlementEnabled &&
      network !== "mainnet" &&
      network !== "mainnet-beta",
  };
}

export function publicMeta(cfg: AppConfig, fixtureSource?: string) {
  return {
    service: "whistle-api",
    mode: "live" as const,
    network: cfg.network,
    settlementRail: cfg.settlementRail,
    stakeAsset: cfg.stakeAsset,
    requireWalletAuth: cfg.requireWalletAuth,
    txlineConfigured: Boolean(cfg.apiToken) && !isPlaceholderTxlineToken(cfg.apiToken),
    fixtureSource:
      fixtureSource || (isPlaceholderTxlineToken(cfg.apiToken) ? "thesportsdb" : "txline"),
    resultVerification:
      fixtureSource === "txline" && !isPlaceholderTxlineToken(cfg.apiToken)
        ? ("txline" as const)
        : ("unavailable" as const),
    onchainSettlementEnabled: cfg.onchainSettlementEnabled,
    whistleProgramId: cfg.onchainSettlementEnabled ? cfg.whistleProgramId : null,
    usdcMint: cfg.onchainSettlementEnabled ? cfg.usdcMint : null,
    platformFeeBps: cfg.onchainSettlementEnabled ? cfg.platformFeeBps : 0,
    keepSettleEnabled: cfg.keepSettleEnabled,
    newsConfigured: true,
    newsSource: "rss" as const,
    demoWalletEnabled: cfg.demoWalletEnabled,
  };
}
