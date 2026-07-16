import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
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
  squadLeaderboard,
  voidMarketWithRail,
  voidMarketsForFixtureWithRail,
} from "./markets/service";
import { maybeSettleFixture } from "./settlement/keeper";
import {
  amountToBaseUnits,
  outcomeToU8,
  type Fixture,
  type MarketOutcome,
} from "@whistle/shared";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  deriveMarketPDA,
  ensureMarketOnchain,
  verifyClaimTx,
  verifyDepositTx,
} from "./settlement/onchain";
import { isFixtureStakeable } from "./markets/lifecycle";
import type { AppConfig } from "./config";
import { publicMeta } from "./config";
import { issueChallenge, requireAdmin, requireWalletOwner } from "./auth";
import { buildGroupTables, listRounds } from "./groups";
import { getWorldCupNews } from "./news";
import { bumpMetric, getMetrics, metricsPrometheus } from "./observability";
import { getFixtureSource } from "./txline/ingest";
import { priceHistoryForFixture } from "./markets/prices";
import { getMatchStats, refreshMatchStats } from "./match/stats";
import { buildInsights, getInsights } from "./insights";
import { getCachedMatchForecast, getMatchForecast } from "./forecast";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

function publicFixture(fixture: Fixture): Omit<Fixture, "raw"> {
  const { raw: _raw, ...safe } = fixture;
  return safe;
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const id = (req.header("x-request-id") || randomUUID()).slice(0, 36);
  req.requestId = id;
  res.setHeader("x-request-id", id);
  bumpMetric("httpRequests");
  res.on("finish", () => {
    if (res.statusCode >= 500) bumpMetric("httpErrors");
  });
  next();
}

export function createRouter(cfg: AppConfig) {
  const router = Router();
  const admin = requireAdmin(cfg);
  const walletOwner = requireWalletOwner(cfg);
  const totalLine = z
    .number()
    .positive()
    .max(20)
    .refine((line) => Number.isInteger(line * 2), "line must be a half-goal value");

  router.get("/health", (_req, res) => {
    const state = getState();
    const fixtureCount = Object.keys(state.fixtures).length;
    const ready = fixtureCount > 0;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      ...publicMeta(cfg, getFixtureSource()),
      fixtures: fixtureCount,
      markets: Object.keys(state.markets).length,
      positions: Object.keys(state.positions).length,
      metrics: getMetrics(),
    });
  });

  router.get("/ready", (_req, res) => {
    const fixtures = Object.keys(getState().fixtures).length;
    if (!fixtures) return res.status(503).json({ ready: false, reason: "no fixtures" });
    res.json({ ready: true, fixtures });
  });

  router.get("/live", (_req, res) => {
    res.json({ live: true, uptimeMs: Date.now() - getMetrics().startedAt });
  });

  router.get("/metrics", (_req, res) => {
    res.type("text/plain").send(metricsPrometheus());
  });

  router.get("/meta", (_req, res) => {
    res.json(publicMeta(cfg, getFixtureSource()));
  });

  router.post("/auth/challenge", (req, res) => {
    const schema = z.object({ wallet: z.string().min(32).max(64) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    res.json(issueChallenge(parsed.data.wallet));
  });

  router.get("/fixtures", (req, res) => {
    let fixtures = Object.values(getState().fixtures);
    const group = typeof req.query.group === "string" ? req.query.group : undefined;
    const round = typeof req.query.round === "string" ? req.query.round : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (group) fixtures = fixtures.filter((f) => f.group === group);
    if (round) fixtures = fixtures.filter((f) => f.round === round);
    if (status) fixtures = fixtures.filter((f) => f.status === status);
    fixtures.sort((a: Fixture, b: Fixture) => a.kickoffTs - b.kickoffTs);
    res.json({
      fixtures: fixtures.map(publicFixture),
      serverNow: Date.now(),
      meta: publicMeta(cfg, getFixtureSource()),
    });
  });

  router.get("/fixtures/:id", async (req, res) => {
    const fixture = getState().fixtures[req.params.id];
    if (!fixture) return res.status(404).json({ error: "fixture not found" });
    const live = getState().live[fixture.id];
    const odds = getState().odds[fixture.id] || [];
    const squadId = typeof req.query.squadId === "string" ? req.query.squadId : undefined;
    const markets = listMarkets(fixture.id, squadId);

    // Refresh stats/insights in the background if stale (>45s)
    const statsAge = getMatchStats(fixture.id)?.updatedAt || 0;
    if (
      (fixture.status === "live" || fixture.status === "finished") &&
      Date.now() - statsAge > 45_000
    ) {
      void refreshMatchStats(fixture.id)
        .then(() => buildInsights(fixture.id))
        .catch(() => undefined);
    }
    const forecast = getCachedMatchForecast(fixture.id);
    if (!forecast) void getMatchForecast(fixture.id).catch(() => undefined);

    res.json({
      fixture: publicFixture(fixture),
      serverNow: Date.now(),
      live,
      odds,
      markets,
      priceHistory: priceHistoryForFixture(fixture.id),
      stats: getMatchStats(fixture.id),
      insights: getInsights(fixture.id),
      forecast,
      meta: publicMeta(cfg, getFixtureSource()),
    });
  });

  router.get("/fixtures/:id/insights", async (req, res) => {
    try {
      const cards = await buildInsights(req.params.id);
      res.json({ insights: cards });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.get("/fixtures/:id/forecast", async (req, res) => {
    try {
      const forecast = await getMatchForecast(req.params.id);
      if (!forecast) return res.status(404).json({ error: "fixture not found" });
      const maxAge = forecast.model.phase === "live" ? 15 : 60;
      res.setHeader(
        "Cache-Control",
        `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 4}`
      );
      res.json({ forecast });
    } catch {
      res.status(503).json({ error: "forecast temporarily unavailable" });
    }
  });

  router.get("/fixtures/:id/stats", async (req, res) => {
    try {
      const stats =
        (await refreshMatchStats(req.params.id)) || getMatchStats(req.params.id);
      res.json({ stats });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.get("/markets/:id/history", (req, res) => {
    const hist = getState().priceHistory[req.params.id] || [];
    res.json({ history: hist });
  });

  router.get("/groups", (_req, res) => {
    const groups = buildGroupTables().map((group) => ({
      ...group,
      fixtures: group.fixtures.map(publicFixture),
    }));
    res.json({ groups, rounds: listRounds() });
  });

  router.get("/news", async (_req, res) => {
    try {
      const result = await getWorldCupNews();
      res.json(result);
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
  });

  router.get("/admin/overview", admin, (_req, res) => {
    const state = getState();
    res.json({
      meta: publicMeta(cfg, getFixtureSource()),
      metrics: getMetrics(),
      fixtures: Object.keys(state.fixtures).length,
      markets: Object.values(state.markets).map((m) => ({
        id: m.id,
        fixtureId: m.fixtureId,
        marketType: m.marketType,
        status: m.status,
        totalPool: m.totalPool,
        squadId: m.squadId,
      })),
      openMarkets: Object.values(state.markets).filter((m) => m.status === "open").length,
      lockedMarkets: Object.values(state.markets).filter((m) => m.status === "locked").length,
      settledMarkets: Object.values(state.markets).filter((m) => m.status === "settled").length,
      notifications: state.notifications.slice(0, 20),
    });
  });

  router.get("/markets", (req, res) => {
    const fixtureId = req.query.fixtureId as string | undefined;
    const squadId = req.query.squadId as string | undefined;
    res.json({ markets: listMarkets(fixtureId, squadId) });
  });

  router.post("/markets", admin, (req, res) => {
    const schema = z.object({
      fixtureId: z.string(),
      marketType: z.enum(["match_result", "total_goals"]),
      line: totalLine.optional(),
      squadId: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    if (!getState().fixtures[parsed.data.fixtureId]) {
      return res.status(404).json({ error: "fixture not found" });
    }
    if (parsed.data.squadId && !getState().squads[parsed.data.squadId]) {
      return res.status(404).json({ error: "squad not found" });
    }
    try {
      res.json({ market: ensureMarket(parsed.data) });
    } catch (e) {
      res.status(409).json({ error: String(e) });
    }
  });

  router.post("/squads/:id/markets", walletOwner, (req, res) => {
    const squad = getState().squads[req.params.id];
    if (!squad) return res.status(404).json({ error: "squad not found" });
    const creator = String(req.body?.creator || req.body?.owner || "");
    if (!squad.members.includes(creator)) {
      return res.status(403).json({ error: "not a squad member" });
    }
    const schema = z.object({
      fixtureId: z.string(),
      marketType: z.enum(["match_result", "total_goals"]).default("match_result"),
      line: totalLine.optional(),
      creator: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    if (!getState().fixtures[parsed.data.fixtureId]) {
      return res.status(404).json({ error: "fixture not found" });
    }
    try {
      res.json({
        market: ensureMarket({
          fixtureId: parsed.data.fixtureId,
          marketType: parsed.data.marketType,
          line: parsed.data.line,
          squadId: squad.id,
        }),
      });
    } catch (e) {
      res.status(409).json({ error: String(e) });
    }
  });

  router.get("/markets/:id", (req, res) => {
    try {
      res.json(marketImplied(req.params.id));
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  });

  router.post("/markets/:id/prepare", async (req, res) => {
    if (!cfg.onchainSettlementEnabled || !cfg.whistleProgramId || !cfg.usdcMint) {
      return res.status(409).json({ error: "on-chain staking is not enabled" });
    }
    const market = getState().markets[req.params.id];
    if (!market) return res.status(404).json({ error: "market not found" });
    const fixture = getState().fixtures[market.fixtureId];
    if (market.status !== "open" || !isFixtureStakeable(fixture)) {
      return res.status(409).json({ error: "market is closed" });
    }
    try {
      const prepared = await ensureMarketOnchain(market, fixture.kickoffTs);
      res.json({
        ...prepared,
        programId: cfg.whistleProgramId,
        usdcMint: cfg.usdcMint,
      });
    } catch (error) {
      req.log?.error({ err: error, marketId: market.id }, "on-chain market preparation failed");
      res.status(503).json({ error: "on-chain market could not be prepared" });
    }
  });

  router.post("/markets/:id/deposit", walletOwner, async (req, res) => {
    const schema = z.object({
      outcome: z.string(),
      amount: z.number().positive().max(1_000_000),
      owner: z.string().min(1),
      txSignature: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    try {
      const market = getState().markets[req.params.id];
      if (!market) return res.status(404).json({ error: "market not found" });

      if (cfg.onchainSettlementEnabled) {
        if (!parsed.data.txSignature) {
          return res.status(400).json({ error: "txSignature required for on-chain deposit" });
        }
        const connection = new Connection(cfg.solanaRpcUrl, "confirmed");
        const programId = new PublicKey(cfg.whistleProgramId!);
        const marketPda = deriveMarketPDA(
          programId,
          market.fixtureId,
          market.marketType,
          market.line,
          market.squadId
        );
        const userPubKey = new PublicKey(parsed.data.owner);
        const outcome = parsed.data.outcome as MarketOutcome;
        const outcomeU8 = outcomeToU8(market.marketType, outcome);

        await verifyDepositTx({
          connection,
          programId,
          txSig: parsed.data.txSignature,
          expectedMarket: marketPda,
          expectedUser: userPubKey,
          expectedOutcome: outcomeU8,
          expectedAmountBaseUnits: amountToBaseUnits(parsed.data.amount),
        });
      }

      const result = deposit({
        marketId: req.params.id,
        outcome: parsed.data.outcome as MarketOutcome,
        amount: parsed.data.amount,
        owner: parsed.data.owner,
        txSignature: parsed.data.txSignature,
      });
      bumpMetric("deposits");
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  router.post("/markets/:id/settle", admin, async (req, res) => {
    const schema = z.object({
      homeScore: z.number().int().nonnegative(),
      awayScore: z.number().int().nonnegative(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const market = getState().markets[req.params.id];
    if (!market) return res.status(404).json({ error: "not found" });
    const attempt = await maybeSettleFixture(
      market.fixtureId,
      parsed.data.homeScore,
      parsed.data.awayScore
    );
    const updated = getState().markets[req.params.id];
    if (attempt.status === "pending" || attempt.status === "disabled") {
      return res.status(409).json({
        error: attempt.reason || "settlement verification pending",
        settlement: attempt,
        market: updated,
      });
    }
    res.json({ market: updated, settlement: attempt });
  });

  router.post("/markets/:id/void", admin, async (req, res) => {
    const schema = z.object({ reason: z.string().optional() });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    try {
      bumpMetric("voids");
      res.json({
        market: await voidMarketWithRail(
          req.params.id,
          parsed.data.reason || "match abandoned",
          cfg.onchainSettlementEnabled
        ),
      });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  router.post("/fixtures/:id/void-markets", admin, async (req, res) => {
    const reason = String(req.body?.reason || "fixture cancelled");
    try {
      const markets = await voidMarketsForFixtureWithRail(
        req.params.id,
        reason,
        cfg.onchainSettlementEnabled
      );
      bumpMetric("voids", markets.length);
      res.json({ markets });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post("/markets/:id/lock", admin, (req, res) => {
    try {
      res.json({ market: lockMarket(req.params.id) });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  router.post("/positions/:id/claim", walletOwner, async (req, res) => {
    const schema = z.object({
      owner: z.string(),
      txSignature: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    try {
      const position = getState().positions[req.params.id];
      if (!position) return res.status(404).json({ error: "position not found" });
      const market = getState().markets[position.marketId];
      if (!market) return res.status(404).json({ error: "market not found" });

      if (cfg.onchainSettlementEnabled) {
        if (!parsed.data.txSignature) {
          return res.status(400).json({ error: "txSignature required for on-chain claim" });
        }
        const connection = new Connection(cfg.solanaRpcUrl, "confirmed");
        const programId = new PublicKey(cfg.whistleProgramId!);
        const marketPda = deriveMarketPDA(
          programId,
          market.fixtureId,
          market.marketType,
          market.line,
          market.squadId
        );
        const userPubKey = new PublicKey(parsed.data.owner);

        await verifyClaimTx({
          connection,
          programId,
          txSig: parsed.data.txSignature,
          expectedMarket: marketPda,
          expectedUser: userPubKey,
        });
      }

      res.json(
        claimPosition(
          req.params.id,
          parsed.data.owner,
          parsed.data.txSignature,
          cfg.onchainSettlementEnabled ? cfg.platformFeeBps : 0
        )
      );
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  router.get("/positions", (req, res) => {
    const owner = String(req.query.owner || "");
    if (!owner) return res.status(400).json({ error: "owner required" });
    const positions = positionsForOwner(owner).map((position) => ({
      ...position,
      fixture: position.fixture ? publicFixture(position.fixture) : undefined,
    }));
    res.json({ positions });
  });

  router.get("/notifications", (_req, res) => {
    // Settlement spam never surfaces here
    const notes = getState().notifications.filter(
      (n) => !n.type.includes("settle") && n.type !== "void"
    );
    res.json({ notifications: notes.slice(0, 30) });
  });

  router.post("/squads", walletOwner, (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(64),
      creator: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    res.json({ squad: createSquad(parsed.data.name, parsed.data.creator) });
  });

  router.post("/squads/join", walletOwner, (req, res) => {
    const schema = z.object({
      inviteCode: z.string().min(3).max(16),
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
    const markets = listMarkets(undefined, squad.id);
    const fixtures = markets
      .map((m) => getState().fixtures[m.fixtureId])
      .filter(Boolean);
    res.json({
      squad,
      markets,
      fixtures: fixtures.map(publicFixture),
      leaderboard: squadLeaderboard(squad.id),
    });
  });

  router.get("/squads", (_req, res) => {
    const squads = Object.values(getState().squads).map((squad) => ({
      id: squad.id,
      name: squad.name,
      createdAt: squad.createdAt,
      memberCount: squad.members.length,
    }));
    res.json({ squads });
  });

  return router;
}
