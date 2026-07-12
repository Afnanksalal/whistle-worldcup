"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Fixture, MarketPool } from "@whistle/shared";
import { api, formatKickoff, statusLabel } from "../lib/api";

type FixturesRes = { fixtures: Fixture[] };
type MarketsRes = { markets: MarketPool[] };

export function FixtureBoard() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [markets, setMarkets] = useState<MarketPool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "live" | "upcoming" | "finished">("all");

  const load = async () => {
    try {
      const [f, m] = await Promise.all([
        api<FixturesRes>("/fixtures"),
        api<MarketsRes>("/markets"),
      ]);
      setFixtures(f.fixtures);
      setMarkets(m.markets);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(API.replace("http", "ws") + "/ws");
      ws.onmessage = () => load();
    } catch {
      // polling fallback
    }
    return () => {
      clearInterval(t);
      ws?.close();
    };
  }, []);

  const poolByFixture = (id: string) =>
    markets
      .filter((m) => m.fixtureId === id && !m.squadId)
      .reduce((a, m) => a + m.totalPool, 0);

  const filtered = fixtures.filter((f) => {
    if (filter === "all") return true;
    if (filter === "live") return f.status === "live";
    if (filter === "upcoming") return f.status === "scheduled";
    return f.status === "finished";
  });

  const groups = Array.from(
    new Set(filtered.map((f) => f.group || f.round || "Tournament").filter(Boolean))
  );

  return (
    <section className="rise" style={{ padding: "0 1.5rem 3rem", maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h2 className="display" style={{ fontSize: "1.6rem", margin: 0 }}>
          Tournament board
        </h2>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {(["all", "live", "upcoming", "finished"] as const).map((f) => (
            <button
              key={f}
              className={filter === f ? "btn btn-primary" : "btn btn-ghost"}
              style={{ padding: "0.4rem 0.9rem", fontSize: "0.85rem" }}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="panel" style={{ padding: "1rem", marginBottom: "1rem", color: "#ffb4b4" }}>
          API offline — start `@whistle/api` on port 4000. ({error})
        </div>
      )}

      {groups.map((g) => (
        <div key={g} style={{ marginBottom: "2rem" }}>
          <h3
            style={{
              color: "var(--chalk-dim)",
              fontSize: "0.8rem",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: "0.75rem",
            }}
          >
            {g}
          </h3>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {filtered
              .filter((f) => (f.group || f.round || "Tournament") === g)
              .map((f) => (
                <Link
                  key={f.id}
                  href={`/match/${f.id}`}
                  className="panel"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "1rem",
                    padding: "1.1rem 1.25rem",
                    alignItems: "center",
                    transition: "border-color 0.2s ease, transform 0.2s ease",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.45rem",
                      }}
                    >
                      {f.status === "live" && <span className="live-dot" />}
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color:
                            f.status === "live"
                              ? "#ff6b6b"
                              : f.status === "finished"
                                ? "var(--amber)"
                                : "var(--chalk-dim)",
                        }}
                      >
                        {statusLabel(f.status)}
                        {f.score ? ` · ${f.score.home}-${f.score.away}` : ""}
                      </span>
                      <span style={{ color: "var(--chalk-dim)", fontSize: "0.8rem" }}>
                        {formatKickoff(f.kickoffTs)}
                      </span>
                    </div>
                    <div className="display" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                      {f.home.name}{" "}
                      <span style={{ color: "var(--chalk-dim)", fontWeight: 500 }}>vs</span>{" "}
                      {f.away.name}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "var(--amber)", fontWeight: 700 }}>
                      ${poolByFixture(f.id).toFixed(0)}
                    </div>
                    <div style={{ color: "var(--chalk-dim)", fontSize: "0.8rem" }}>in pools</div>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      ))}

      {!filtered.length && !error && (
        <p style={{ color: "var(--chalk-dim)" }}>No fixtures in this filter yet.</p>
      )}
    </section>
  );
}
