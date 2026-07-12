import dotenv from "dotenv";
import path from "path";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { WebSocketServer } from "ws";
import { createRouter, requestContext } from "./routes";
import { flushStateSync, getState, subscribe } from "./store";
import {
  bootstrapFixtures,
  getFixtureSource,
  refreshFixtures,
  startSseIngest,
} from "./txline/ingest";
import { networkConfig, refreshGuestJwt } from "./txline/client";
import { configureKeeper, startKeeperLoop } from "./settlement/keeper";
import {
  enforceMarketCutoffs,
  ensureMarket,
  reconcileMarkets,
} from "./markets/service";
import { isFixtureStakeable } from "./markets/lifecycle";
import { isPlaceholderTxlineToken, loadConfig, publicMeta } from "./config";
import { configureLogger, getLogger } from "./observability";
import { snapshotAllOpenMarkets, recordMarketPrice } from "./markets/prices";
import { refreshLiveFixtureStats } from "./match/stats";
import { buildInsights } from "./insights";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
  const cfg = loadConfig();
  configureLogger(cfg.logLevel);
  const log = getLogger();

  const net = networkConfig(cfg.network);
  const apiOrigin = cfg.apiOrigin || net.apiOrigin;
  const placeholder = isPlaceholderTxlineToken(cfg.apiToken);

  let guestJwt = cfg.guestJwt;
  if (!guestJwt && !placeholder) {
    try {
      guestJwt = await refreshGuestJwt(apiOrigin);
      log.info("refreshed guest JWT");
    } catch (err) {
      log.warn({ err }, "guest JWT refresh failed");
    }
  }

  const txlineCfg =
    cfg.apiToken && guestJwt
      ? { apiOrigin, guestJwt, apiToken: cfg.apiToken }
      : cfg.apiToken
        ? { apiOrigin, guestJwt: guestJwt || "pending", apiToken: cfg.apiToken }
        : null;

  await bootstrapFixtures(txlineCfg);

  const verifiedTxlineConfig = () =>
    !placeholder && getFixtureSource() === "txline" ? txlineCfg : null;
  const syncKeeperConfig = () =>
    configureKeeper(verifiedTxlineConfig(), cfg.keepSettleEnabled);
  const ensureScheduledMarkets = () => {
    for (const fixture of Object.values(getState().fixtures)) {
      if (!isFixtureStakeable(fixture)) continue;
      ensureMarket(
        { fixtureId: fixture.id, marketType: "match_result" },
        { durable: false }
      );
      ensureMarket(
        { fixtureId: fixture.id, marketType: "total_goals", line: 2.5 },
        { durable: false }
      );
    }
  };
  const reconcileLifecycle = () => {
    const summary = reconcileMarkets({
      resultVerificationAvailable: Boolean(verifiedTxlineConfig()),
    });
    if (summary.deleted || summary.voided || summary.locked) {
      log.warn({ summary }, "market lifecycle state reconciled");
    }
  };

  syncKeeperConfig();
  reconcileLifecycle();
  ensureScheduledMarkets();

  // Seed price history so graphs are never empty on first paint
  for (const m of Object.values(getState().markets)) {
    recordMarketPrice(m.id);
  }

  let stopSse: (() => void) | null = null;
  const syncSse = () => {
    const verified = verifiedTxlineConfig();
    if (verified && guestJwt) {
      stopSse = startSseIngest(verified);
    }
  };
  if (getFixtureSource() === "txline" && txlineCfg && guestJwt) {
    syncSse();
  }

  const timers: NodeJS.Timeout[] = [];
  timers.push(setInterval(() => {
    void refreshFixtures(txlineCfg)
      .then(() => {
        syncKeeperConfig();
        reconcileLifecycle();
        ensureScheduledMarkets();
        syncSse();
      })
      .catch((e) => log.warn({ err: e }, "fixture refresh failed"));
  }, 60_000));

  timers.push(setInterval(() => snapshotAllOpenMarkets(), 20_000));
  timers.push(setInterval(() => {
    void refreshLiveFixtureStats().catch((e) => log.warn({ err: e }, "stats refresh failed"));
  }, 45_000));
  timers.push(setInterval(() => {
    const liveIds = Object.values(getState().fixtures)
      .filter((f) => f.status === "live" || f.status === "scheduled")
      .slice(0, 10)
      .map((f) => f.id);
    for (const id of liveIds) {
      void buildInsights(id).catch(() => undefined);
    }
  }, 90_000));
  timers.push(setInterval(() => {
    const locked = enforceMarketCutoffs();
    if (locked) log.info({ locked }, "markets locked at kickoff cutoff");
  }, 1_000));

  // Warm stats + insights for first board page
  void refreshLiveFixtureStats()
    .then(async () => {
      for (const f of Object.values(getState().fixtures).slice(0, 12)) {
        await buildInsights(f.id).catch(() => undefined);
      }
    })
    .catch(() => undefined);

  timers.push(startKeeperLoop(15_000));

  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors({ origin: cfg.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "256kb" }));
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger: log,
      autoLogging: {
        ignore: (req) => req.url === "/api/live" || req.url === "/api/metrics",
      },
      customProps: (req) => ({ requestId: (req as express.Request).requestId }),
    })
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      max: cfg.rateLimitPerMin,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "rate limit exceeded" },
    })
  );
  app.use("/api", createRouter(cfg));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        event: "hello",
        payload: {
          ...publicMeta(cfg, getFixtureSource()),
          fixtures: Object.keys(getState().fixtures).length,
        },
      })
    );
  });

  const publicSocketEvents = new Set([
    "fixtures",
    "fixture",
    "score",
    "scores",
    "odds",
    "market",
    "locked",
    "settled",
    "void",
    "price",
    "stats",
    "insights",
  ]);

  subscribe((event) => {
    if (!publicSocketEvents.has(event)) return;
    // Public clients only need an invalidation signal. Never fan out owners,
    // invite codes, position data, or private squad payloads.
    const msg = JSON.stringify({ event });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg);
    }
  });

  server.listen(cfg.port, () => {
    log.info(
      {
        port: cfg.port,
        meta: publicMeta(cfg, getFixtureSource()),
      },
      `Whistle API listening on :${cfg.port}`
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "shutting down");
    for (const timer of timers) clearInterval(timer);
    stopSse?.();
    server.close(() => {
      try {
        flushStateSync();
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => {
      try {
        flushStateSync();
      } finally {
        process.exit(1);
      }
    }, 10_000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
