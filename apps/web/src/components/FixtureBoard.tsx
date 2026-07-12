"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Fixture, MarketPool } from "@whistle/shared";
import { api, formatKickoff, statusLabel, wsUrl } from "../lib/api";

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
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl());
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
    <section className="shell rise" style={{ padding: "0 0 3.5rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1.5rem",
          alignItems: "end",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>
            Order book
          </p>
          <h2 className="display" style={{ fontSize: "1.75rem", margin: 0 }}>
            Active fixtures
          </h2>
        </div>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          {(["all", "live", "upcoming", "finished"] as const).map((f) => (
            <button
              key={f}
              className={filter === f ? "btn btn-primary" : "btn btn-ghost"}
              style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="panel" style={{ padding: "1rem", marginBottom: "1rem", color: "var(--signal)" }}>
          Markets offline — start the API. ({error})
        </div>
      )}

      {groups.map((g) => (
        <div key={g} style={{ marginBottom: "1.75rem" }}>
          <h3
            className="mono"
            style={{
              color: "var(--mute)",
              fontSize: "0.7rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: "0.65rem",
              fontWeight: 500,
            }}
          >
            {g}
          </h3>
          <div style={{ display: "grid", gap: "0.55rem" }}>
            {filtered
              .filter((f) => (f.group || f.round || "Tournament") === g)
              .map((f) => (
                <Link key={f.id} href={`/match/${f.id}`} className="panel ticket">
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.4rem",
                      }}
                    >
                      {f.status === "live" && <span className="live-dot" />}
                      <span
                        className="mono"
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          color:
                            f.status === "live"
                              ? "var(--signal)"
                              : f.status === "finished"
                                ? "var(--cyan)"
                                : "var(--mute)",
                        }}
                      >
                        {statusLabel(f.status)}
                        {f.score ? `  ${f.score.home}-${f.score.away}` : ""}
                      </span>
                      <span className="mono" style={{ color: "var(--mute)", fontSize: "0.7rem" }}>
                        {formatKickoff(f.kickoffTs)}
                      </span>
                    </div>
                    <div className="display" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                      {f.home.name}{" "}
                      <span style={{ color: "var(--mute)", fontWeight: 500 }}>vs</span>{" "}
                      {f.away.name}
                    </div>
                  </div>
                  <div className="pool-chip">
                    ${poolByFixture(f.id).toFixed(0)}
                    <div style={{ color: "var(--mute)", fontSize: "0.65rem", fontWeight: 500 }}>
                      pool
                    </div>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      ))}

      {!filtered.length && !error && (
        <div className="panel" style={{ padding: "1.5rem", color: "var(--mute)" }}>
          {fixtures.length === 0
            ? "No fixtures from the data feed yet — check API health / TxLINE credentials."
            : "No fixtures in this filter."}
        </div>
      )}
    </section>
  );
}
