import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tempDir = "";
let originalCwd = "";
let service: typeof import("./service");
let store: typeof import("../store");

before(async () => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "whistle-service-test-"));
  process.chdir(tempDir);
  service = await import("./service");
  store = await import("../store");

  store.mutate((state) => {
    state.fixtures.fixture = {
      id: "fixture",
      kickoffTs: Date.now() + 60_000,
      status: "scheduled",
      home: { name: "Home" },
      away: { name: "Away" },
    };
    state.markets.market = {
      id: "market",
      fixtureId: "fixture",
      marketType: "match_result",
      status: "open",
      outcomes: { home: 0, draw: 0, away: 0 },
      totalPool: 0,
      createdAt: Date.now(),
    };
  }, undefined, undefined, { durable: true });
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("on-chain deposit ledger alignment", () => {
  it("is idempotent and keeps one outcome per owner/market PDA", () => {
    const first = service.deposit({
      marketId: "market",
      owner: "owner",
      outcome: "home",
      amount: 10,
      txSignature: "signature-1",
    });
    const replay = service.deposit({
      marketId: "market",
      owner: "owner",
      outcome: "home",
      amount: 10,
      txSignature: "signature-1",
    });
    assert.equal(replay.position.id, first.position.id);
    assert.equal(replay.market.totalPool, 10);

    const second = service.deposit({
      marketId: "market",
      owner: "owner",
      outcome: "home",
      amount: 5,
      txSignature: "signature-2",
    });
    assert.equal(second.position.id, first.position.id);
    assert.equal(second.position.amount, 15);
    assert.equal(second.position.deposits?.length, 2);
    assert.equal(second.market.totalPool, 15);
    assert.equal(Object.keys(store.getState().positions).length, 1);

    assert.throws(
      () =>
        service.deposit({
          marketId: "market",
          owner: "owner",
          outcome: "away",
          amount: 1,
          txSignature: "signature-3",
        }),
      /cannot switch outcomes/
    );
    assert.equal(store.getState().markets.market.totalPool, 15);
  });
});
