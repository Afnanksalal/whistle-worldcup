import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadConfig, publicMeta } from "./config";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  verifyDepositTx,
  verifyClaimTx,
  deriveMarketPDA,
  derivePositionPDA,
  validateOnchainLedgerState,
} from "./settlement/onchain";
import type { AppState } from "./store";

const KEYS = [
  "NODE_ENV",
  "TXLINE_API_TOKEN",
  "ADMIN_API_KEY",
  "API_CORS_ORIGIN",
  "WHISTLE_PROGRAM_ID",
  "ENABLE_ONCHAIN_SETTLEMENT",
  "SETTLEMENT_RAIL",
  "STAKE_ASSET",
  "USDC_MINT",
  "SOLANA_KEYPAIR_PATH",
  "PLATFORM_FEE_BPS",
] as const;

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

describe("on-chain configuration", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.TXLINE_API_TOKEN = "txl_placeholder";
    process.env.ADMIN_API_KEY = "0123456789abcdef";
    process.env.API_CORS_ORIGIN = "http://localhost:3000";
    process.env.WHISTLE_PROGRAM_ID = "WHisTLE111111111111111111111111111111111111";
    process.env.USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
    process.env.SOLANA_KEYPAIR_PATH = "wallet.json";
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
  });

  it("allows on-chain USDC only when every opt-in agrees", () => {
    process.env.TXLINE_API_TOKEN = "real-txline-token";
    process.env.ENABLE_ONCHAIN_SETTLEMENT = "true";
    process.env.SETTLEMENT_RAIL = "onchain";
    process.env.STAKE_ASSET = "USDC";
    const cfg = loadConfig();
    const meta = publicMeta(cfg, "txline");
    assert.equal(meta.settlementRail, "onchain");
    assert.equal(meta.stakeAsset, "USDC");
    assert.equal(meta.onchainSettlementEnabled, true);
    assert.equal(meta.whistleProgramId, process.env.WHISTLE_PROGRAM_ID);
    assert.equal(meta.usdcMint, process.env.USDC_MINT);
    assert.equal(meta.platformFeeBps, 250);
  });

  it("refuses partial on-chain configuration", () => {
    process.env.STAKE_ASSET = "USDC";
    assert.throws(() => loadConfig(), /requires ENABLE_ONCHAIN_SETTLEMENT/);
  });

  it("refuses real-value mode with a placeholder sports-data token", () => {
    process.env.ENABLE_ONCHAIN_SETTLEMENT = "true";
    process.env.SETTLEMENT_RAIL = "onchain";
    process.env.STAKE_ASSET = "USDC";
    assert.throws(() => loadConfig(), /real TxLINE API token/);
  });
});

describe("on-chain transaction verification", () => {
  const programId = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
  const user = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
  const fixtureId = "tsdb-429";
  const marketType = "match_result";
  const line = undefined;

  const marketPda = deriveMarketPDA(programId, fixtureId, marketType, line);
  const positionPda = derivePositionPDA(programId, marketPda, user);

  it("successfully verifies a valid deposit transaction", async () => {
    const discriminator = Buffer.from([0xf2, 0x23, 0xc6, 0x89, 0x52, 0xe1, 0xf2, 0xb6]);
    const outcomeBuf = Buffer.from([0]);
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64LE(10000000n);
    const data = Buffer.concat([discriminator, outcomeBuf, amountBuf]);

    const mockTx = {
      meta: { err: null },
      transaction: {
        message: {
          staticAccountKeys: [
            user,       // 0
            marketPda,  // 1
            PublicKey.unique(), // 2 (vault/config/etc)
            positionPda,// 3
            PublicKey.unique(), // 4
            programId,  // 5
          ],
          compiledInstructions: [
            {
              programIdIndex: 5,
              data: data,
              accountKeyIndexes: [0, 1, 2, 3, 4],
            },
          ],
        },
      },
    };

    const mockConnection = {
      getTransaction: async (sig: string) => {
        assert.equal(sig, "test-sig");
        return mockTx;
      },
    } as unknown as Connection;

    const result = await verifyDepositTx({
      connection: mockConnection,
      programId,
      txSig: "test-sig",
      expectedMarket: marketPda,
      expectedUser: user,
      expectedOutcome: 0,
      expectedAmountBaseUnits: 10_000_000n,
    });

    assert.equal(result, true);
  });

  it("successfully verifies a valid claim transaction", async () => {
    const discriminator = Buffer.from([0x3e, 0xc6, 0xd6, 0xc1, 0xd5, 0x9f, 0x6c, 0xd2]);
    const configPda = PublicKey.unique();
    const adminToken = PublicKey.unique();

    const mockTx = {
      meta: { err: null },
      transaction: {
        message: {
          staticAccountKeys: [
            user,         // 0: user
            configPda,    // 1: config
            marketPda,    // 2: market
            PublicKey.unique(), // 3: vault
            positionPda,  // 4: position
            PublicKey.unique(), // 5: user_token
            adminToken,   // 6: admin_token
            programId,    // 7: program
          ],
          compiledInstructions: [
            {
              programIdIndex: 7,
              data: discriminator,
              accountKeyIndexes: [0, 1, 2, 3, 4, 5, 6],
            },
          ],
        },
      },
    };

    const mockConnection = {
      getTransaction: async (sig: string) => {
        return mockTx;
      },
    } as unknown as Connection;

    const result = await verifyClaimTx({
      connection: mockConnection,
      programId,
      txSig: "test-sig",
      expectedMarket: marketPda,
      expectedUser: user,
    });

    assert.equal(result, true);
  });
});

describe("on-chain ledger compatibility", () => {
  const emptyState = (): AppState => ({
    fixtures: {},
    live: {},
    odds: {},
    markets: {},
    positions: {},
    squads: {},
    priceHistory: {},
    matchStats: {},
    insights: {},
    receipts: {},
    notifications: [],
  });

  it("accepts an empty ledger and rejects play-unit positions", () => {
    const state = emptyState();
    assert.doesNotThrow(() => validateOnchainLedgerState(state));
    state.markets.market = {
      id: "market",
      fixtureId: "fixture",
      marketType: "match_result",
      status: "open",
      outcomes: { home: 10, draw: 0, away: 0 },
      totalPool: 10,
      createdAt: 1,
    };
    state.positions.position = {
      id: "position",
      marketId: "market",
      owner: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
      outcome: "home",
      amount: 10,
      claimed: false,
      createdAt: 1,
    };
    assert.throws(() => validateOnchainLedgerState(state), /no on-chain deposit evidence/);
  });
});
