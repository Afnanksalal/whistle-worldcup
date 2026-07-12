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
import { subscribe } from "./store";
import {
  bootstrapFixtures,
  getFixtureSource,
  refreshFixtures,
  startSseIngest,
} from "./txline/ingest";
import { networkConfig, refreshGuestJwt } from "./txline/client";
import { configureKeeper, startKeeperLoop } from "./settlement/keeper";
import { ensureMarket } from "./markets/service";
import { getState } from "./store";
import { loadConfig, publicMeta } from "./config";
import { configureLogger, getLogger } from "./observability";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
  const cfg = loadConfig();
  configureLogger(cfg.logLevel);
  const log = getLogger();

  const net = networkConfig(cfg.network);
  const apiOrigin = cfg.apiOrigin || net.apiOrigin;
  const placeholder = cfg.apiToken.startsWith("txl_");

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

  configureKeeper(placeholder ? null : txlineCfg, cfg.keepSettleEnabled);

  await bootstrapFixtures(txlineCfg);

  for (const f of Object.values(getState().fixtures)) {
    if (f.status === "cancelled" || f.status === "postponed") continue;
    ensureMarket({ fixtureId: f.id, marketType: "match_result" });
    ensureMarket({ fixtureId: f.id, marketType: "total_goals", line: 2.5 });
  }

  if (getFixtureSource() === "txline" && txlineCfg && guestJwt) {
    startSseIngest({ ...txlineCfg, guestJwt });
  }

  setInterval(() => {
    void refreshFixtures(txlineCfg)
      .then(() => {
        for (const f of Object.values(getState().fixtures)) {
          if (f.status === "cancelled" || f.status === "postponed") continue;
          ensureMarket({ fixtureId: f.id, marketType: "match_result" });
          ensureMarket({ fixtureId: f.id, marketType: "total_goals", line: 2.5 });
        }
      })
      .catch((e) => log.warn({ err: e }, "fixture refresh failed"));
  }, 60_000);

  startKeeperLoop(15_000);

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

  subscribe((event, payload) => {
    const msg = JSON.stringify({ event, payload });
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
