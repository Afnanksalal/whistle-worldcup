import assert from "node:assert/strict";
import test from "node:test";
import {
  clearTeamAssetCache,
  mergeTeamAssets,
  pickTeamAssets,
} from "./teamAssets";

test("pickTeamAssets prefers soccer national team badge + short code", () => {
  const assets = pickTeamAssets(
    [
      {
        strTeam: "Brazil",
        strSport: "Soccer",
        strGender: "Male",
        strTeamShort: "BRA",
        strBadge: "https://r2.thesportsdb.com/images/media/team/badge/brazil.png",
      },
      {
        strTeam: "Brazil Club FC",
        strSport: "Soccer",
        strBadge: "https://r2.thesportsdb.com/images/media/team/badge/club.png",
      },
    ],
    "Brazil"
  );
  assert.equal(assets?.shortName, "BRA");
  assert.equal(
    assets?.logo,
    "https://r2.thesportsdb.com/images/media/team/badge/brazil.png"
  );
});

test("pickTeamAssets rejects non-https badge urls", () => {
  const assets = pickTeamAssets(
    [
      {
        strTeam: "France",
        strSport: "Soccer",
        strGender: "Male",
        strBadge: "http://insecure.example/badge.png",
        strTeamShort: "FRA",
      },
    ],
    "France"
  );
  assert.equal(assets?.logo, undefined);
  assert.equal(assets?.shortName, "FRA");
});

test("mergeTeamAssets never overwrites existing crest fields", () => {
  clearTeamAssetCache();
  const merged = mergeTeamAssets(
    {
      name: "Spain",
      logo: "https://example.com/existing.png",
      shortName: "ESP",
    },
    {
      logo: "https://r2.thesportsdb.com/images/media/team/badge/spain.png",
      shortName: "SPA",
    }
  );
  assert.equal(merged.logo, "https://example.com/existing.png");
  assert.equal(merged.shortName, "ESP");
});

test("mergeTeamAssets fills missing crest fields only", () => {
  const merged = mergeTeamAssets(
    { name: "Vietnam" },
    {
      logo: "https://r2.thesportsdb.com/images/media/team/badge/vietnam.png",
      shortName: "VIE",
    }
  );
  assert.equal(
    merged.logo,
    "https://r2.thesportsdb.com/images/media/team/badge/vietnam.png"
  );
  assert.equal(merged.shortName, "VIE");
});
