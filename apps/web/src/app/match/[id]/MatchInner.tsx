"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { Fixture, LiveScoreUpdate, MarketPool, OddsQuote } from "@whistle/shared";
import { impliedShares } from "@whistle/shared";
import { api, formatKickoff, statusLabel } from "../../../lib/api";
import { useIdentity } from "../../../lib/identity";
import { useRuntime } from "../../../lib/runtime";

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

export default function MatchPageInner() {
  const params = useParams();
  const search = useSearchParams();
  const id = String(params.id);
  const squadId = search.get("squad") || undefined;
  const { owner, ready, withWalletAuth } = useIdentity();
  const { stakeLabel, meta } = useRuntime();
  const [data, setData] = useState<Detail | null>(null);
  const [amount, setAmount] = useState(10);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const q = squadId ? `?squadId=${encodeURIComponent(squadId)}` : "";
      const d = await api<Detail>(`/fixtures/${id}${q}`);
      setData(d);
      setSelectedMarket((prev) => prev || d.markets[0]?.id || null);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, squadId]);

  const market = useMemo(
    () => data?.markets.find((m) => m.id === selectedMarket) || data?.markets[0],
    [data, selectedMarket]
  );

  const implied = market ? impliedShares(market.outcomes) : {};

  const stake = async () => {
    if (!market || !selectedOutcome || !owner) return;
    setBusy(true);
    setMsg(null);
    try {
      const headers = await withWalletAuth();
      await api(`/markets/${market.id}/deposit`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          outcome: selectedOutcome,
          amount,
          owner,
        }),
      });
      setMsg(
        `Locked ${amount} ${stakeLabel} on ${OUTCOME_LABELS[selectedOutcome] || selectedOutcome}`
      );
      await load();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <main className="shell" style={{ padding: "2rem 0" }}>
        <div className="panel" style={{ padding: "1.5rem", color: "var(--signal)" }}>
          {error}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="shell" style={{ padding: "3rem 0", color: "var(--mute)" }}>
        Syncing market…
      </main>
    );
  }

  const { fixture, live } = data;
  const home = live?.homeScore ?? fixture.score?.home ?? 0;
  const away = live?.awayScore ?? fixture.score?.away ?? 0;

  return (
    <main className="shell" style={{ padding: "2rem 0 4rem" }}>
      {squadId && (
        <p className="mono" style={{ color: "var(--cyan)", fontSize: "0.75rem", marginBottom: "0.75rem" }}>
          SQUAD MARKET
        </p>
      )}
      <div className="rise panel" style={{ padding: "1.6rem 1.4rem", marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1.1rem",
            flexWrap: "wrap",
          }}
        >
          {fixture.status === "live" && <span className="live-dot" />}
          <span className="mono" style={{ color: "var(--cyan)", fontSize: "0.75rem", fontWeight: 600 }}>
            {statusLabel(fixture.status)}
            {live?.clock ? ` · ${live.clock}` : ""}
          </span>
          <span className="mono" style={{ color: "var(--mute)", fontSize: "0.72rem" }}>
            {formatKickoff(fixture.kickoffTs)}
          </span>
          {fixture.competition && (
            <span className="mono" style={{ color: "var(--mute)", fontSize: "0.72rem" }}>
              · {fixture.competition}
              {fixture.round ? ` · ${fixture.round}` : ""}
            </span>
          )}
        </div>

        <div className="score-board">
          <div className="display" style={{ fontSize: "1.35rem", textAlign: "right" }}>
            {fixture.home.name}
          </div>
          <div className="score-num">
            {home}
            <span style={{ color: "var(--mute)", margin: "0 0.15rem" }}>:</span>
            {away}
          </div>
          <div className="display" style={{ fontSize: "1.35rem" }}>
            {fixture.away.name}
          </div>
        </div>

        {fixture.status === "finished" && (
          <p
            className="mono"
            style={{
              textAlign: "center",
              color: "var(--cyan)",
              marginTop: "1.1rem",
              fontSize: "0.75rem",
              letterSpacing: "0.08em",
            }}
          >
            FULL TIME · POOLS SETTLING
          </p>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        <div className="panel rise" style={{ padding: "1.25rem" }}>
          <h2 className="display" style={{ fontSize: "1.15rem", marginTop: 0 }}>
            Place order
          </h2>
          <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {data.markets.map((m) => (
              <button
                key={m.id}
                className={market?.id === m.id ? "btn btn-primary" : "btn btn-ghost"}
                style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
                onClick={() => {
                  setSelectedMarket(m.id);
                  setSelectedOutcome(null);
                }}
              >
                {m.marketType === "match_result" ? "1X2" : `O/U ${m.line}`}
                {m.status !== "open" ? ` · ${m.status}` : ""}
              </button>
            ))}
          </div>

          {!data.markets.length && (
            <p style={{ color: "var(--mute)" }}>No open markets for this fixture yet.</p>
          )}

          {market && (
            <>
              <div style={{ display: "grid", gap: "0.45rem", marginBottom: "1rem" }}>
                {Object.keys(market.outcomes).map((outcome) => {
                  const share = implied[outcome] || 0;
                  const active = selectedOutcome === outcome;
                  return (
                    <button
                      key={outcome}
                      className={`outcome-row${active ? " active" : ""}`}
                      disabled={market.status !== "open"}
                      onClick={() => setSelectedOutcome(outcome)}
                    >
                      <span>
                        {outcome === "home"
                          ? fixture.home.name
                          : outcome === "away"
                            ? fixture.away.name
                            : OUTCOME_LABELS[outcome] || outcome}
                      </span>
                      <span className="mono" style={{ color: "var(--cyan-bright)", fontSize: "0.85rem" }}>
                        {(share * 100).toFixed(0)}% · {market.outcomes[outcome].toFixed(0)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label
                style={{
                  display: "block",
                  marginBottom: "0.85rem",
                  color: "var(--mute)",
                  fontSize: "0.85rem",
                }}
              >
                Stake ({stakeLabel})
                <input
                  className="field mono"
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </label>

              {!ready && (
                <p style={{ color: "var(--signal)", fontSize: "0.88rem" }}>
                  Connect a Solana wallet to stake.
                </p>
              )}

              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={busy || !selectedOutcome || market.status !== "open" || !ready}
                onClick={stake}
              >
                {market.status === "open" ? `Lock ${stakeLabel}` : `Market ${market.status}`}
              </button>

              {meta.settlementRail === "ledger" && (
                <p style={{ marginTop: "0.75rem", color: "var(--mute)", fontSize: "0.8rem" }}>
                  Settlement rail: ledger (on-chain escrow activates when the program is deployed).
                </p>
              )}

              {msg && (
                <p style={{ marginTop: "0.75rem", color: "var(--mute)", fontSize: "0.88rem" }}>
                  {msg}
                </p>
              )}
              {market.status === "locked" && (
                <p style={{ marginTop: "0.75rem", color: "var(--mute)", fontSize: "0.88rem" }}>
                  Kickoff — stakes locked. Payouts unlock at full-time.
                </p>
              )}
              {market.status === "void" && (
                <p style={{ marginTop: "0.75rem", color: "var(--signal)", fontWeight: 600 }}>
                  Market voided — claim a full refund from Positions.
                </p>
              )}
              {market.status === "settled" && market.winningOutcome && (
                <p
                  className="mono"
                  style={{ marginTop: "0.75rem", color: "var(--cyan)", fontSize: "0.8rem" }}
                >
                  SETTLED · {OUTCOME_LABELS[market.winningOutcome].toUpperCase()}
                  {market.settleTxSig ? ` · ${market.settleTxSig.slice(0, 14)}…` : ""}
                </p>
              )}
            </>
          )}
        </div>

        <div className="panel rise" style={{ padding: "1.25rem" }}>
          <h2 className="display" style={{ fontSize: "1.15rem", marginTop: 0 }}>
            Reference odds
          </h2>
          <p style={{ color: "var(--mute)", fontSize: "0.88rem", marginTop: 0 }}>
            Consensus line from the live feed. Pool price is stake-weighted — not the house line.
          </p>
          {data.odds.length === 0 ? (
            <p style={{ color: "var(--mute)" }}>Waiting for odds quotes on this fixture.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.2rem" }}>
              {data.odds.slice(0, 12).map((o, i) => (
                <li
                  key={`${o.market}-${o.selection}-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.55rem 0",
                    borderBottom: "1px solid var(--line)",
                    fontSize: "0.88rem",
                  }}
                >
                  <span style={{ color: "var(--mute)" }}>
                    {o.market} · {o.selection}
                  </span>
                  <strong className="mono" style={{ color: "var(--cyan-bright)" }}>
                    {o.price.toFixed(2)}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
