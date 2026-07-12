import { Router } from "express";
import { z } from "zod";
import { getState } from "./store";
import {
  claimPosition,
  createSquad,
  deposit,
  ensureMarket,
  joinSquad,
  listMarkets,
  lockMarket,
  marketImplied,
  positionsForOwner,
  settleMarketOffchain,
  squadLeaderboard,
  voidMarket,
  voidMarketsForFixture,
} from "./markets/service";
import { maybeSettleFixture } from "./settlement/keeper";
import type { Fixture } from "@whistle/shared";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "whistle-api",
    fixtures: Object.keys(getState().fixtures).length,
    markets: Object.keys(getState().markets).length,
    txline: Boolean(process.env.TXLINE_API_TOKEN),
  });
});

router.get("/fixtures", (_req, res) => {
  const fixtures = Object.values(getState().fixtures).sort(
    (a: Fixture, b: Fixture) => a.kickoffTs - b.kickoffTs
  );
  res.json({ fixtures });
});

router.get("/fixtures/:id", (req, res) => {
  const fixture = getState().fixtures[req.params.id];
  if (!fixture) return res.status(404).json({ error: "not found" });
  const live = getState().live[fixture.id];
  const odds = getState().odds[fixture.id] || [];
  const markets = listMarkets(fixture.id);
  res.json({ fixture, live, odds, markets });
});

router.get("/markets", (req, res) => {
  const fixtureId = req.query.fixtureId as string | undefined;
  const squadId = req.query.squadId as string | undefined;
  res.json({ markets: listMarkets(fixtureId, squadId) });
});

router.post("/markets", (req, res) => {
  const schema = z.object({
    fixtureId: z.string(),
    marketType: z.enum(["match_result", "total_goals"]),
    line: z.number().optional(),
    squadId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  if (!getState().fixtures[parsed.data.fixtureId]) {
    return res.status(404).json({ error: "fixture not found" });
  }
  const market = ensureMarket(parsed.data);
  res.json({ market });
});

router.get("/markets/:id", (req, res) => {
  try {
    res.json(marketImplied(req.params.id));
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

router.post("/markets/:id/deposit", (req, res) => {
  const schema = z.object({
    outcome: z.string(),
    amount: z.number().positive(),
    owner: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    const result = deposit({
      marketId: req.params.id,
      outcome: parsed.data.outcome as never,
      amount: parsed.data.amount,
      owner: parsed.data.owner,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

router.post("/markets/:id/settle", async (req, res) => {
  const schema = z.object({
    homeScore: z.number().int().nonnegative(),
    awayScore: z.number().int().nonnegative(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const market = getState().markets[req.params.id];
  if (!market) return res.status(404).json({ error: "not found" });
  await maybeSettleFixture(
    market.fixtureId,
    parsed.data.homeScore,
    parsed.data.awayScore
  );
  const updated =
    getState().markets[req.params.id]?.status === "settled"
      ? getState().markets[req.params.id]
      : settleMarketOffchain(
          req.params.id,
          parsed.data.homeScore,
          parsed.data.awayScore
        );
  res.json({ market: updated });
});

router.post("/markets/:id/void", (req, res) => {
  const schema = z.object({ reason: z.string().optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    res.json({
      market: voidMarket(req.params.id, parsed.data.reason || "match abandoned"),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

router.post("/fixtures/:id/void-markets", (req, res) => {
  const reason = String(req.body?.reason || "fixture cancelled");
  res.json({ markets: voidMarketsForFixture(req.params.id, reason) });
});

router.post("/markets/:id/lock", (req, res) => {
  try {
    res.json({ market: lockMarket(req.params.id) });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

router.post("/positions/:id/claim", (req, res) => {
  const schema = z.object({ owner: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    res.json(claimPosition(req.params.id, parsed.data.owner));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

router.get("/positions", (req, res) => {
  const owner = String(req.query.owner || "");
  if (!owner) return res.status(400).json({ error: "owner required" });
  res.json({ positions: positionsForOwner(owner) });
});

router.get("/notifications", (_req, res) => {
  res.json({ notifications: getState().notifications.slice(0, 30) });
});

router.post("/squads", (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    creator: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  res.json({ squad: createSquad(parsed.data.name, parsed.data.creator) });
});

router.post("/squads/join", (req, res) => {
  const schema = z.object({
    inviteCode: z.string().min(3),
    member: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    res.json({ squad: joinSquad(parsed.data.inviteCode, parsed.data.member) });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

router.get("/squads/:id", (req, res) => {
  const squad = getState().squads[req.params.id];
  if (!squad) return res.status(404).json({ error: "not found" });
  res.json({
    squad,
    markets: listMarkets(undefined, squad.id),
    leaderboard: squadLeaderboard(squad.id),
  });
});

router.get("/squads", (_req, res) => {
  res.json({ squads: Object.values(getState().squads) });
});
