import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadConfig, publicMeta } from "./config";

const KEYS = [
  "NODE_ENV",
  "TXLINE_API_TOKEN",
  "ADMIN_API_KEY",
  "API_CORS_ORIGIN",
  "WHISTLE_PROGRAM_ID",
  "ENABLE_ONCHAIN_SETTLEMENT",
  "SETTLEMENT_RAIL",
  "STAKE_ASSET",
] as const;

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

describe("fail-closed rail metadata", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.TXLINE_API_TOKEN = "txl_placeholder";
    process.env.ADMIN_API_KEY = "0123456789abcdef";
    process.env.API_CORS_ORIGIN = "http://localhost:3000";
    process.env.WHISTLE_PROGRAM_ID = "configured-but-not-ready";
    delete process.env.ENABLE_ONCHAIN_SETTLEMENT;
    delete process.env.SETTLEMENT_RAIL;
    process.env.STAKE_ASSET = "units";
  });

  afterEach(() => {
    for (const key of KEYS) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("does not advertise on-chain USDC from a program id alone", () => {
    const cfg = loadConfig();
    const meta = publicMeta(cfg, "thesportsdb");
    assert.equal(meta.settlementRail, "ledger");
    assert.equal(meta.stakeAsset, "units");
    assert.equal(meta.onchainSettlementEnabled, false);
    assert.equal(meta.resultVerification, "unavailable");
  });

  it("refuses to boot when an unavailable USDC rail is explicitly requested", () => {
    process.env.STAKE_ASSET = "USDC";
    assert.throws(() => loadConfig(), /not production-ready/);
  });
});
