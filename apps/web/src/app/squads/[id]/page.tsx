"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { MarketPool, Squad } from "@whistle/shared";
import { api } from "../../../lib/api";
import { useIdentity } from "../../../lib/identity";

type Leader = { owner: string; staked: number; won: number; pnl: number };

export default function SquadDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { owner } = useIdentity();
  const [squad, setSquad] = useState<Squad | null>(null);
  const [markets, setMarkets] = useState<MarketPool[]>([]);
  const [leaderboard, setLeaderboard] = useState<Leader[]>([]);
  const [fixtureId, setFixtureId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const res = await api<{
      squad: Squad;
      markets: MarketPool[];
      leaderboard: Leader[];
    }>(`/squads/${id}`);
    setSquad(res.squad);
    setMarkets(res.markets);
    setLeaderboard(res.leaderboard);
  };

  useEffect(() => {
    load().catch((e) => setMsg(String(e)));
  }, [id]);

  useEffect(() => {
    api<{ fixtures: Array<{ id: string }> }>("/fixtures")
      .then((r) => {
        if (r.fixtures[0]) setFixtureId(r.fixtures[0].id);
      })
      .catch(() => undefined);
  }, []);

  const createMarket = async () => {
    if (!fixtureId) return;
    try {
      await api("/markets", {
        method: "POST",
        body: JSON.stringify({
          fixtureId,
          marketType: "match_result",
          squadId: id,
        }),
      });
      setMsg("Squad market opened");
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  if (!squad) {
    return (
      <main style={{ padding: "2rem 1.5rem", color: "var(--chalk-dim)" }}>
        {msg || "Loading squad…"}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
      <p style={{ color: "var(--chalk-dim)", marginBottom: "0.35rem" }}>
        <Link href="/squads">← Squads</Link>
      </p>
      <h1 className="display" style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>
        {squad.name}
      </h1>
      <p style={{ color: "var(--chalk-dim)" }}>
        Invite code <strong style={{ color: "var(--amber)" }}>{squad.inviteCode}</strong> · you are{" "}
        {owner}
      </p>
      {msg && <p style={{ color: "var(--amber)" }}>{msg}</p>}

      <div className="panel" style={{ padding: "1.25rem", margin: "1.5rem 0" }}>
        <h2 className="display" style={{ fontSize: "1.15rem", marginTop: 0 }}>
          Open a squad market
        </h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            value={fixtureId}
            onChange={(e) => setFixtureId(e.target.value)}
            placeholder="Fixture id"
            style={{
              flex: 1,
              minWidth: 200,
              padding: "0.7rem",
              borderRadius: "0.75rem",
              border: "1px solid var(--line)",
              background: "rgba(0,0,0,0.25)",
              color: "var(--chalk)",
            }}
          />
          <button className="btn btn-primary" onClick={createMarket}>
            Create match result pool
          </button>
        </div>
      </div>

      <h2 className="display" style={{ fontSize: "1.25rem" }}>
        Leaderboard
      </h2>
      <div style={{ display: "grid", gap: "0.45rem", marginBottom: "2rem" }}>
        {leaderboard.map((row, i) => (
          <div
            key={row.owner}
            className="panel"
            style={{
              padding: "0.85rem 1rem",
              display: "grid",
              gridTemplateColumns: "2rem 1fr auto",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            <span style={{ color: "var(--amber)", fontWeight: 700 }}>#{i + 1}</span>
            <span>{row.owner}</span>
            <span style={{ color: row.pnl >= 0 ? "var(--amber)" : "#ff8f8f", fontWeight: 700 }}>
              {row.pnl >= 0 ? "+" : ""}
              {row.pnl.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <h2 className="display" style={{ fontSize: "1.25rem" }}>
        Squad markets
      </h2>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {markets.map((m) => (
          <Link
            key={m.id}
            href={`/match/${m.fixtureId}`}
            className="panel"
            style={{ padding: "0.9rem 1.1rem", display: "flex", justifyContent: "space-between" }}
          >
            <span>
              {m.fixtureId} · {m.marketType}
            </span>
            <span style={{ color: "var(--amber)" }}>${m.totalPool.toFixed(0)}</span>
          </Link>
        ))}
        {!markets.length && (
          <p style={{ color: "var(--chalk-dim)" }}>No squad markets yet.</p>
        )}
      </div>
    </main>
  );
}
