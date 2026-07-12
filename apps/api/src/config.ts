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
  solanaRpcUrl: string;
  settlementRail: "ledger" | "onchain";
  stakeAsset: "USDC" | "units";
  logLevel: string;
  rateLimitPerMin: number;
};

function truthy(v: string | undefined): boolean {
  return v === "true" || v === "1" || v === "yes";
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

  const whistleProgramId = (process.env.WHISTLE_PROGRAM_ID || "").trim() || null;
  const settlementRail: "ledger" | "onchain" = whistleProgramId ? "onchain" : "ledger";
  const stakeAsset: "USDC" | "units" =
    process.env.STAKE_ASSET === "USDC" || whistleProgramId ? "USDC" : "units";

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
    solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    settlementRail,
    stakeAsset,
    logLevel: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
    rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN || 120),
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
    txlineConfigured: Boolean(cfg.apiToken) && !cfg.apiToken.startsWith("txl_"),
    fixtureSource: fixtureSource || (cfg.apiToken.startsWith("txl_") ? "thesportsdb" : "txline"),
    keepSettleEnabled: cfg.keepSettleEnabled,
    newsConfigured: true,
    newsSource: "rss" as const,
  };
}
