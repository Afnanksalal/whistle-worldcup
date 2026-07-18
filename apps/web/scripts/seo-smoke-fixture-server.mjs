import { createServer } from "node:http";
import {
  SEO_FIXTURE_ID,
  seoArticle,
  seoFixture,
  seoFixtureKickoffTs,
  seoGroup,
  seoMarket,
  seoMeta,
} from "./seo-smoke-data.mjs";

function liveSeoFixture() {
  return {
    ...seoFixture,
    kickoffTs: seoFixtureKickoffTs(),
  };
}

const host = "127.0.0.1";
const rawPort = Number(process.env.SEO_FIXTURE_PORT || 4010);
if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65_535) {
  throw new Error("SEO_FIXTURE_PORT must be an integer from 1 to 65535");
}

function send(response, status, payload, contentType = "application/json; charset=utf-8") {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${rawPort}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    response.end();
    return;
  }

  if (url.pathname === "/health") {
    send(response, 200, "ok", "text/plain; charset=utf-8");
    return;
  }
  if (url.pathname === "/api/meta") {
    send(response, 200, seoMeta);
    return;
  }
  if (url.pathname === "/api/fixtures") {
    send(response, 200, {
      fixtures: [liveSeoFixture()],
      serverNow: Date.now(),
      meta: seoMeta,
    });
    return;
  }
  if (url.pathname === "/api/markets") {
    send(response, 200, { markets: [seoMarket] });
    return;
  }
  if (url.pathname === "/api/groups") {
    const fixture = liveSeoFixture();
    send(response, 200, {
      groups: [{ ...seoGroup, fixtures: [fixture] }],
      rounds: ["Semi-final"],
    });
    return;
  }
  if (url.pathname === "/api/news") {
    send(response, 200, {
      articles: [seoArticle],
      source: "deterministic SEO fixture",
      cached: false,
      stale: false,
    });
    return;
  }

  const fixtureMatch = url.pathname.match(/^\/api\/fixtures\/([^/]+)$/);
  if (fixtureMatch) {
    const fixtureId = decodeURIComponent(fixtureMatch[1]);
    if (fixtureId !== SEO_FIXTURE_ID) {
      send(response, 404, { error: "fixture not found" });
      return;
    }
    send(response, 200, {
      fixture: liveSeoFixture(),
      serverNow: Date.now(),
      live: null,
      odds: [],
      markets: [seoMarket],
      priceHistory: { [seoMarket.id]: [] },
      stats: null,
      insights: [],
      forecast: null,
      meta: seoMeta,
    });
    return;
  }

  send(response, 404, { error: "not found" });
});

server.listen(rawPort, host, () => {
  console.log(`SEO fixture API listening on http://${host}:${rawPort}`);
});

function close() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
