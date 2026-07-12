import dotenv from "dotenv";
import path from "path";
import http from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { router } from "./routes";
import { subscribe } from "./store";
import { bootstrapFixtures, startDemoMatchSimulator, startSseIngest } from "./txline/ingest";
import { networkConfig, refreshGuestJwt } from "./txline/client";
import { configureKeeper, startKeeperLoop } from "./settlement/keeper";
import { ensureMarket } from "./markets/service";
import { getState } from "./store";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
  const port = Number(process.env.PORT || 4000);
  const demoMode = process.env.DEMO_MODE === "true" || !process.env.TXLINE_API_TOKEN;
  const network = process.env.TXLINE_NETWORK || "devnet";
  const net = networkConfig(network);
  const apiOrigin = process.env.TXLINE_API_ORIGIN || net.apiOrigin;

  let guestJwt = process.env.TXLINE_GUEST_JWT || "";
  const apiToken = process.env.TXLINE_API_TOKEN || "";

  if (apiToken && !guestJwt) {
    try {
      guestJwt = await refreshGuestJwt(apiOrigin);
      console.log("[txline] refreshed guest JWT");
    } catch (e) {
      console.warn("[txline] guest JWT refresh failed", e);
    }
  }

  const txlineCfg =
    apiToken && guestJwt
      ? { apiOrigin, guestJwt, apiToken }
      : null;

  configureKeeper(txlineCfg, process.env.KEEP_SETTLE_ENABLED !== "false");

  await bootstrapFixtures(txlineCfg, demoMode);

  // Auto-create public match_result markets for upcoming/live fixtures
  for (const f of Object.values(getState().fixtures)) {
    if (f.status === "cancelled") continue;
    ensureMarket({ fixtureId: f.id, marketType: "match_result" });
    ensureMarket({ fixtureId: f.id, marketType: "total_goals", line: 2.5 });
  }

  if (txlineCfg) {
    startSseIngest(txlineCfg);
  } else {
    console.log("[txline] no API token — demo mode ingest");
    startDemoMatchSimulator();
  }

  startKeeperLoop(15_000);

  const app = express();
  app.use(
    cors({
      origin: process.env.API_CORS_ORIGIN?.split(",") || true,
    })
  );
  app.use(express.json());
  app.use("/api", router);

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        event: "hello",
        payload: {
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

  server.listen(port, () => {
    console.log(`Whistle API on http://localhost:${port}`);
    console.log(`  demoMode=${demoMode} network=${network}`);
    console.log(`  data dir ready under ${path.join(process.cwd(), "data")}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
