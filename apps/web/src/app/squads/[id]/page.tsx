"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Fixture, MarketPool, Squad } from "@whistle/shared";
import { api, formatKickoff, shortAddr } from "../../../lib/api";
import { useIdentity } from "../../../lib/identity";

type Leader = { owner: string; staked: number; won: number; pnl: number };

export default function SquadDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { owner, ready, withWalletAuth } = useIdentity();
  const [squad, setSquad] = useState<Squad | null>(null);
  const [markets, setMarkets] = useState<MarketPool[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [allFixtures, setAllFixtures] = useState<Fixture[]>([]);
  const [leaderboard, setLeaderboard] = useState<Leader[]>([]);
  const [fixtureId, setFixtureId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const res = await api<{
      squad: Squad;
      markets: MarketPool[];
      fixtures: Fixture[];
      leaderboard: Leader[];
    }>(`/squads/${id}`);
    setSquad(res.squad);
    setMarkets(res.markets);
    setFixtures(res.fixtures || []);
    setLeaderboard(res.leaderboard);
  };

  useEffect(() => {
    load().catch((e) => setMsg(String(e)));
  }, [id]);

  useEffect(() => {
    api<{ fixtures: Fixture[] }>("/fixtures")
      .then((r) => {
        const open = r.fixtures.filter(
          (f) => f.status === "scheduled" || f.status === "live"
        );
        setAllFixtures(open);
        if (open[0] && !fixtureId) setFixtureId(open[0].id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createMarket = async () => {
    if (!fixtureId || !owner) return;
    try {
      const headers = await withWalletAuth();
      await api(`/squads/${id}/markets`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          fixtureId,
          marketType: "match_result",
          creator: owner,
        }),
      });
      setMsg("Squad market opened");
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  const fixtureLabel = (fid: string) => {
    const f =
      allFixtures.find((x) => x.id === fid) || fixtures.find((x) => x.id === fid);
    if (!f) return fid;
    return `${f.home.name} vs ${f.away.name}`;
  };

  if (!squad) {
    return (
      <main className="shell" style={{ padding: "2rem 0", color: "var(--mute)" }}>
        {msg || "Loading squad…"}
      </main>
    );
  }

  const isMember = owner ? squad.members.includes(owner) : false;

  return (
    <main className="shell" style={{ padding: "2rem 0 4rem" }}>
      <p style={{ color: "var(--mute)", marginBottom: "0.35rem" }}>
        <Link href="/squads" style={{ color: "var(--cyan)" }}>
          ← Squads
        </Link>
      </p>
      <h1 className="display rise" style={{ fontSize: "2.1rem", marginBottom: "0.25rem" }}>
        {squad.name}
      </h1>
      <p style={{ color: "var(--mute)" }}>
        Invite{" "}
        <strong className="mono" style={{ color: "var(--cyan)" }}>
          {squad.inviteCode}
        </strong>
        {owner ? (
          <>
            {" "}
            · you are <span className="mono">{shortAddr(owner)}</span>
            {isMember ? "" : " (not a member)"}
          </>
        ) : (
          " · connect wallet to participate"
        )}
      </p>
      {msg && (
        <p className="mono" style={{ color: "var(--cyan)", fontSize: "0.85rem" }}>
          {msg}
        </p>
      )}

      <div className="panel" style={{ padding: "1.25rem", margin: "1.5rem 0" }}>
        <h2 className="display" style={{ fontSize: "1.15rem", marginTop: 0 }}>
          Open a squad market
        </h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <select
            className="field"
            value={fixtureId}
            onChange={(e) => setFixtureId(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          >
            {!allFixtures.length && <option value="">No open fixtures</option>}
            {allFixtures.map((f) => (
              <option key={f.id} value={f.id}>
                {f.home.name} vs {f.away.name} · {formatKickoff(f.kickoffTs)}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            disabled={!ready || !isMember || !fixtureId}
            onClick={createMarket}
          >
            Create 1X2 pool
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
            <span className="mono" style={{ color: "var(--cyan)", fontWeight: 700 }}>
              #{i + 1}
            </span>
            <span className="mono">{shortAddr(row.owner)}</span>
            <span
              className="mono"
              style={{
                color: row.pnl >= 0 ? "var(--cyan)" : "var(--signal)",
                fontWeight: 700,
              }}
            >
              {row.pnl >= 0 ? "+" : ""}
              {row.pnl.toFixed(2)}
            </span>
          </div>
        ))}
        {!leaderboard.length && (
          <p style={{ color: "var(--mute)" }}>No stakes yet — open a market and play.</p>
        )}
      </div>

      <h2 className="display" style={{ fontSize: "1.25rem" }}>
        Squad markets
      </h2>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {markets.map((m) => (
          <Link
            key={m.id}
            href={`/match/${m.fixtureId}?squad=${id}`}
            className="panel"
            style={{
              padding: "0.9rem 1.1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              {fixtureLabel(m.fixtureId)} ·{" "}
              {m.marketType === "match_result" ? "1X2" : `O/U ${m.line}`} · {m.status}
            </span>
            <span className="mono" style={{ color: "var(--cyan)" }}>
              ${m.totalPool.toFixed(0)}
            </span>
          </Link>
        ))}
        {!markets.length && <p style={{ color: "var(--mute)" }}>No squad markets yet.</p>}
      </div>
    </main>
  );
}
