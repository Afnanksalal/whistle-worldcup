"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Fixture, LiveScoreUpdate, MarketPool, OddsQuote } from "@whistle/shared";
import { impliedShares } from "@whistle/shared";
import { api, formatKickoff, statusLabel } from "../../../lib/api";
import { useIdentity } from "../../../lib/identity";

type Detail = {
  fixture: Fixture;
  live?: LiveScoreUpdate;
  odds: OddsQuote[];
  markets: MarketPool[];
};

const OUTCOME_LABELS: Record<string, string> = {
  home: "Home",
  draw: "Draw",
  away: "Away",
  over: "Over",
  under: "Under",
};

export default function MatchPage() {
  const params = useParams();
  const id = String(params.id);
  const { owner } = useIdentity();
  const [data, setData] = useState<Detail | null>(null);
  const [amount, setAmount] = useState(10);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const d = await api<Detail>(`/fixtures/${id}`);
      setData(d);
      if (!selectedMarket && d.markets[0]) {
        setSelectedMarket(d.markets[0].id);
      }
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [id]);

  const market = useMemo(
    () => data?.markets.find((m) => m.id === selectedMarket) || data?.markets[0],
    [data, selectedMarket]
  );

  const implied = market ? impliedShares(market.outcomes) : {};

  const stake = async () => {
    if (!market || !selectedOutcome) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/markets/${market.id}/deposit`, {
        method: "POST",
        body: JSON.stringify({
          outcome: selectedOutcome,
          amount,
          owner,
        }),
      });
      setMsg(`Locked $${amount} on ${OUTCOME_LABELS[selectedOutcome] || selectedOutcome}`);
      await load();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <main style={{ padding: "2rem 1.5rem" }}>
        <div className="panel" style={{ padding: "1.5rem", color: "#ffb4b4" }}>
          {error}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ padding: "3rem 1.5rem", color: "var(--chalk-dim)" }}>Loading match…</main>
    );
  }

  const { fixture, live } = data;
  const home = live?.homeScore ?? fixture.score?.home ?? 0;
  const away = live?.awayScore ?? fixture.score?.away ?? 0;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
      <div className="rise panel" style={{ padding: "1.75rem", marginBottom: "1.25rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.75rem",
          }}
        >
          {fixture.status === "live" && <span className="live-dot" />}
          <span style={{ color: "var(--amber)", fontWeight: 700, fontSize: "0.85rem" }}>
            {statusLabel(fixture.status)}
            {live?.clock ? ` · ${live.clock}` : ""}
          </span>
          <span style={{ color: "var(--chalk-dim)", fontSize: "0.85rem" }}>
            {formatKickoff(fixture.kickoffTs)}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div className="display" style={{ fontSize: "1.6rem", fontWeight: 800, textAlign: "right" }}>
            {fixture.home.name}
          </div>
          <div className="display" style={{ fontSize: "2.4rem", fontWeight: 800, textAlign: "center" }}>
            {home}–{away}
          </div>
          <div className="display" style={{ fontSize: "1.6rem", fontWeight: 800 }}>
            {fixture.away.name}
          </div>
        </div>
        {fixture.status === "finished" && (
          <p style={{ textAlign: "center", color: "var(--amber)", marginTop: "1rem", fontWeight: 600 }}>
            Full time — pools settling automatically
          </p>
        )}
      </div>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        <div className="panel rise" style={{ padding: "1.25rem" }}>
          <h2 className="display" style={{ fontSize: "1.2rem", marginTop: 0 }}>
            Take a side
          </h2>
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {data.markets.map((m) => (
              <button
                key={m.id}
                className={market?.id === m.id ? "btn btn-primary" : "btn btn-ghost"}
                style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem" }}
                onClick={() => {
                  setSelectedMarket(m.id);
                  setSelectedOutcome(null);
                }}
              >
                {m.marketType === "match_result" ? "Match result" : `Totals ${m.line}`}
                {m.status !== "open" ? ` · ${m.status}` : ""}
              </button>
            ))}
          </div>

          {market && (
            <>
              <div style={{ display: "grid", gap: "0.5rem", marginBottom: "1rem" }}>
                {Object.keys(market.outcomes).map((outcome) => {
                  const share = implied[outcome] || 0;
                  const active = selectedOutcome === outcome;
                  return (
                    <button
                      key={outcome}
                      className="btn btn-ghost"
                      disabled={market.status !== "open"}
                      onClick={() => setSelectedOutcome(outcome)}
                      style={{
                        justifyContent: "space-between",
                        borderColor: active ? "var(--amber)" : "var(--line)",
                        background: active ? "rgba(232,163,23,0.12)" : "transparent",
                      }}
                    >
                      <span>
                        {outcome === "home"
                          ? fixture.home.name
                          : outcome === "away"
                            ? fixture.away.name
                            : OUTCOME_LABELS[outcome] || outcome}
                      </span>
                      <span style={{ color: "var(--amber)" }}>
                        {(share * 100).toFixed(0)}% · ${market.outcomes[outcome].toFixed(0)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label style={{ display: "block", marginBottom: "0.75rem", color: "var(--chalk-dim)" }}>
                Stake (USDC)
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "0.35rem",
                    padding: "0.7rem 0.9rem",
                    borderRadius: "0.75rem",
                    border: "1px solid var(--line)",
                    background: "rgba(0,0,0,0.25)",
                    color: "var(--chalk)",
                    fontSize: "1rem",
                  }}
                />
              </label>

              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={busy || !selectedOutcome || market.status !== "open"}
                onClick={stake}
              >
                {market.status === "open" ? "Lock stake" : `Market ${market.status}`}
              </button>
              {market.status === "locked" && (
                <p style={{ marginTop: "0.75rem", color: "var(--chalk-dim)", fontSize: "0.9rem" }}>
                  Kickoff — stakes locked. Payouts unlock at full-time.
                </p>
              )}
              {market.status === "void" && (
                <p style={{ marginTop: "0.75rem", color: "#ffb4b4", fontWeight: 600 }}>
                  Market voided — claim a full refund from Positions.
                </p>
              )}
              {msg && (
                <p style={{ marginTop: "0.75rem", color: "var(--chalk-dim)", fontSize: "0.9rem" }}>
                  {msg}
                </p>
              )}
              {market.status === "settled" && market.winningOutcome && (
                <p style={{ marginTop: "0.75rem", color: "var(--amber)", fontWeight: 700 }}>
                  Settled · {OUTCOME_LABELS[market.winningOutcome]} wins
                  {market.settleTxSig ? ` · ${market.settleTxSig.slice(0, 18)}…` : ""}
                </p>
              )}
            </>
          )}
        </div>

        <div className="panel rise" style={{ padding: "1.25rem" }}>
          <h2 className="display" style={{ fontSize: "1.2rem", marginTop: 0 }}>
            Reference odds
          </h2>
          <p style={{ color: "var(--chalk-dim)", fontSize: "0.9rem", marginTop: 0 }}>
            Live consensus line from the feed — pools set their own prices from stake flow.
          </p>
          {data.odds.length === 0 ? (
            <p style={{ color: "var(--chalk-dim)" }}>No live odds quotes yet for this fixture.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
              {data.odds.slice(0, 12).map((o, i) => (
                <li
                  key={`${o.market}-${o.selection}-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.55rem 0",
                    borderBottom: "1px solid var(--line)",
                    fontSize: "0.9rem",
                  }}
                >
                  <span>
                    {o.market} · {o.selection}
                  </span>
                  <strong style={{ color: "var(--amber)" }}>{o.price.toFixed(2)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
