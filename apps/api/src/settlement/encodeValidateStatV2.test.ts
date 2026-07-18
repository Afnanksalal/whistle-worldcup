import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  VALIDATE_STAT_V2_DISCRIMINATOR,
  buildValidateStatV2IxData,
  validationHasEncodableProof,
} from "./encodeValidateStatV2";

function loadFixture() {
  // dist/settlement → ../../src/settlement/fixtures; src/settlement → ./fixtures
  const candidates = [
    join(__dirname, "fixtures", "validate-stat-v2-spain-canada.json"),
    join(__dirname, "..", "..", "src", "settlement", "fixtures", "validate-stat-v2-spain-canada.json"),
  ];
  for (const path of candidates) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as {
        validation: unknown;
        homeScore: number;
        awayScore: number;
        proofIxB64: string;
      };
    } catch {
      // try next
    }
  }
  throw new Error("validate-stat-v2 fixture not found");
}

describe("encodeValidateStatV2", () => {
  it("matches the txline Python SDK golden encoding for a real V2 payload", () => {
    const fixture = loadFixture();
    assert.equal(validationHasEncodableProof(fixture.validation), true);
    const encoded = buildValidateStatV2IxData(fixture.validation, {
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
    });
    const expected = Buffer.from(fixture.proofIxB64, "base64");
    assert.equal(encoded.subarray(0, 8).equals(VALIDATE_STAT_V2_DISCRIMINATOR), true);
    assert.equal(encoded.length, expected.length);
    assert.equal(encoded.equals(expected), true);
  });

  it("rejects settle scores that disagree with proven stats", () => {
    const fixture = loadFixture();
    assert.throws(
      () =>
        buildValidateStatV2IxData(fixture.validation, {
          homeScore: fixture.homeScore + 1,
          awayScore: fixture.awayScore,
        }),
      /does not match settle score/
    );
  });

  it("accepts IDL-shaped stats field name in the encodable precheck", () => {
    const fixture = loadFixture();
    const root = fixture.validation as Record<string, unknown>;
    const { statsToProve, ...rest } = root;
    assert.equal(
      validationHasEncodableProof({ ...rest, stats: statsToProve }),
      true
    );
  });

  it("rejects proofs whose first leaves are not goal keys 1/2", () => {
    const fixture = loadFixture();
    const root = structuredClone(fixture.validation) as {
      statsToProve: Array<{ key: number; value: number; period?: number }>;
      statProofs: unknown[];
    };
    // Unrelated first leaves with values matching the settle scores.
    root.statsToProve = [
      { key: 99, value: fixture.homeScore, period: 0 },
      { key: 98, value: fixture.awayScore, period: 0 },
      ...root.statsToProve,
    ];
    root.statProofs = [root.statProofs[0], root.statProofs[1], ...root.statProofs];
    assert.equal(validationHasEncodableProof(root), true);
    // Encoding still binds to keys 1/2 (present later), not the decoy leaves.
    const encoded = buildValidateStatV2IxData(root, {
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
    });
    assert.ok(encoded.length > 8);

    const onlyDecoys = {
      ...root,
      statsToProve: [
        { key: 99, value: fixture.homeScore, period: 0 },
        { key: 98, value: fixture.awayScore, period: 0 },
      ],
      statProofs: root.statProofs.slice(0, 2),
    };
    assert.equal(validationHasEncodableProof(onlyDecoys), false);
    assert.throws(
      () =>
        buildValidateStatV2IxData(onlyDecoys, {
          homeScore: fixture.homeScore,
          awayScore: fixture.awayScore,
        }),
      /missing home\/away goal stats/
    );
  });
});
