import { createHash } from "crypto";
import {
  impliedShares,
  type Fixture,
  type InsightCard,
  type MarketPool,
  type MatchStats,
  type PricePoint,
} from "@whistle/shared";
import { getState, mutate } from "./store";
import { getLogger } from "./observability";
import { getWorldCupNews } from "./news";
import { buildGroupTables } from "./groups";

function idFor(title: string, body: string) {
  return createHash("sha1").update(title + body).digest("hex").slice(0, 12);
}

function slope(points: PricePoint[], key: string): number {
  if (points.length < 2) return 0;
  const a = points[0];
  const b = points[points.length - 1];
  const dt = (b.ts - a.ts) / 60_000; // minutes
  if (dt <= 0) return 0;
  return ((b.implied[key] || 0) - (a.implied[key] || 0)) / dt;
}

function engineInsights(args: {
  fixture: Fixture;
  markets: MarketPool[];
  stats: MatchStats | null;
  history: Record<string, PricePoint[]>;
  headlines: string[];
}): InsightCard[] {
  const { fixture, markets, stats, history, headlines } = args;
  const out: InsightCard[] = [];
  const now = Date.now();
  const home = fixture.home.name;
  const away = fixture.away.name;
  const hs = fixture.score?.home ?? 0;
  const as = fixture.score?.away ?? 0;

  const mr = markets.find((m) => m.marketType === "match_result" && !m.squadId);
  if (mr) {
    const imp = impliedShares(mr.outcomes);
    const leader = Object.entries(imp).sort((a, b) => b[1] - a[1])[0];
    if (leader) {
      const label =
        leader[0] === "home" ? home : leader[0] === "away" ? away : "Draw";
      out.push({
        id: idFor("pool-leader", label),
        severity: leader[1] >= 0.55 ? "signal" : "info",
        title: `Market leans ${label}`,
        body: `Implied probability ${(leader[1] * 100).toFixed(0)}% on ${label} with $${mr.totalPool.toFixed(0)} in the 1X2 pool (${home} ${(imp.home * 100).toFixed(0)}% / Draw ${(imp.draw * 100).toFixed(0)}% / ${away} ${(imp.away * 100).toFixed(0)}%).`,
        tags: ["pool", "1x2"],
        ts: now,
        source: "engine",
      });
    }

    const hist = history[mr.id] || [];
    if (hist.length >= 3) {
      const homeSlope = slope(hist, "home");
      const awaySlope = slope(hist, "away");
      if (Math.abs(homeSlope) > 0.004 || Math.abs(awaySlope) > 0.004) {
        const rising = homeSlope > awaySlope ? home : away;
        const mag = Math.max(Math.abs(homeSlope), Math.abs(awaySlope));
        out.push({
          id: idFor("momentum", rising),
          severity: mag > 0.01 ? "alert" : "signal",
          title: `Money flowing toward ${rising}`,
          body: `Over the last ${Math.max(1, Math.round((hist[hist.length - 1].ts - hist[0].ts) / 60000))} minutes, implied share for ${rising} is moving ${(mag * 100).toFixed(2)} pts/min. Watch for lock at kickoff.`,
          tags: ["momentum", "graph"],
          ts: now,
          source: "engine",
        });
      }
    }

    if (mr.totalPool > 0 && (imp.home || 0) > 0.65) {
      out.push({
        id: idFor("skew", home),
        severity: "alert",
        title: "Heavy home skew",
        body: `${home} is priced above 65% in the pool. Contrarian away/draw tickets get asymmetric payout if the favorite stalls.`,
        tags: ["risk", "skew"],
        ts: now,
        source: "engine",
      });
    }
  }

  if (fixture.status === "live" || fixture.status === "finished") {
    out.push({
      id: idFor("scoreline", `${hs}-${as}`),
      severity: "info",
      title: `Scoreline ${home} ${hs}–${as} ${away}`,
      body:
        hs === as
          ? "Level score keeps draw tickets alive; late goals flip 1X2 settlement hard."
          : `${hs > as ? home : away} lead. Trailing side needs a response before FT lock-in.`,
      tags: ["live", "score"],
      ts: now,
      source: "engine",
    });
  }

  if (stats?.possession) {
    const p = stats.possession;
    const ctrl = p.home >= p.away ? home : away;
    out.push({
      id: idFor("poss", ctrl),
      severity: "info",
      title: `${ctrl} controlling territory`,
      body: `Possession split ${p.home}%–${p.away}%. Shots ${stats.shots?.home ?? 0}–${stats.shots?.away ?? 0}, on target ${stats.shotsOnTarget?.home ?? 0}–${stats.shotsOnTarget?.away ?? 0}.`,
      tags: ["stats", "possession"],
      ts: now,
      source: "engine",
    });
  }

  if (stats?.events?.length) {
    const last = [...stats.events].reverse().find((e) => e.type.includes("goal") || e.type === "red_card");
    if (last) {
      out.push({
        id: idFor("event", `${last.minute}-${last.type}`),
        severity: last.type === "red_card" ? "alert" : "signal",
        title: last.type === "red_card" ? "Red card swing" : "Key event on the tape",
        body: `${last.minute ?? "?"}' ${last.type.replace("_", " ")}${last.player ? ` — ${last.player}` : ""}${last.detail ? ` (${last.detail})` : ""}.`,
        tags: ["events"],
        ts: now,
        source: "engine",
      });
    }
  }

  const tables = buildGroupTables();
  const group = tables.find((g) => g.group === fixture.group);
  if (group) {
    const homeRow = group.standings.find((r) => r.team === home);
    const awayRow = group.standings.find((r) => r.team === away);
    if (homeRow && awayRow) {
      out.push({
        id: idFor("table", fixture.group || ""),
        severity: "info",
        title: `Group ${fixture.group} context`,
        body: `${home} P${homeRow.played} ${homeRow.pts}pts (GD ${homeRow.gd > 0 ? "+" : ""}${homeRow.gd}) vs ${away} P${awayRow.played} ${awayRow.pts}pts (GD ${awayRow.gd > 0 ? "+" : ""}${awayRow.gd}).`,
        tags: ["group", "table"],
        ts: now,
        source: "engine",
      });
    }
  }

  const relevant = headlines.filter((h) => {
    const l = h.toLowerCase();
    return l.includes(home.toLowerCase()) || l.includes(away.toLowerCase());
  });
  if (relevant[0]) {
    out.push({
      id: idFor("news", relevant[0]),
      severity: "signal",
      title: "Wire mention",
      body: relevant[0],
      tags: ["news"],
      ts: now,
      source: "engine",
    });
  }

  return out.slice(0, 8);
}

async function llmNarrative(
  fixture: Fixture,
  cards: InsightCard[]
): Promise<InsightCard | null> {
  const key =
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    "";
  if (!key) return null;

  const prompt = `You are a sharp football markets analyst. In 2 short sentences, give one actionable insight for ${fixture.home.name} vs ${fixture.away.name} (status ${fixture.status}, score ${fixture.score?.home ?? 0}-${fixture.score?.away ?? 0}). Use these signals: ${cards.map((c) => c.title + ": " + c.body).join(" | ")}. No disclaimers. No markdown.`;

  try {
    if (process.env.GROQ_API_KEY) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          max_tokens: 120,
        }),
      });
      if (!res.ok) throw new Error(`groq ${res.status}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) return null;
      return {
        id: idFor("llm", text),
        severity: "signal",
        title: "AI desk note",
        body: text,
        tags: ["ai", "llm"],
        ts: Date.now(),
        source: "llm",
      };
    }

    if (process.env.OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          max_tokens: 120,
        }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) return null;
      return {
        id: idFor("llm", text),
        severity: "signal",
        title: "AI desk note",
        body: text,
        tags: ["ai", "llm"],
        ts: Date.now(),
        source: "llm",
      };
    }

    if (process.env.GEMINI_API_KEY) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      if (!res.ok) throw new Error(`gemini ${res.status}`);
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) return null;
      return {
        id: idFor("llm", text),
        severity: "signal",
        title: "AI desk note",
        body: text,
        tags: ["ai", "llm"],
        ts: Date.now(),
        source: "llm",
      };
    }
  } catch (err) {
    getLogger().warn({ err }, "LLM insight failed");
  }
  return null;
}

export async function buildInsights(fixtureId: string): Promise<InsightCard[]> {
  const state = getState();
  const fixture = state.fixtures[fixtureId];
  if (!fixture) return [];

  const markets = Object.values(state.markets).filter(
    (m) => m.fixtureId === fixtureId && !m.squadId
  );
  const history: Record<string, PricePoint[]> = {};
  for (const m of markets) history[m.id] = state.priceHistory[m.id] || [];

  let headlines: string[] = [];
  try {
    const news = await getWorldCupNews();
    headlines = news.articles.map((a) => a.title);
  } catch {
    headlines = [];
  }

  const cards = engineInsights({
    fixture,
    markets,
    stats: state.matchStats[fixtureId] || null,
    history,
    headlines,
  });

  const llm = await llmNarrative(fixture, cards);
  if (llm) cards.unshift(llm);

  mutate((s) => {
    s.insights[fixtureId] = cards;
  }, "insights", { fixtureId, count: cards.length });

  return cards;
}

export function getInsights(fixtureId: string): InsightCard[] {
  return getState().insights[fixtureId] || [];
}
