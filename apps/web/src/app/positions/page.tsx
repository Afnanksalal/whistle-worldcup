"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Fixture, MarketPool, Position } from "@whistle/shared";
import { payoutForPosition } from "@whistle/shared";
import { api, shortAddr } from "../../lib/api";
import { useIdentity } from "../../lib/identity";
import { useRuntime } from "../../lib/runtime";

type PosRow = Position & { market?: MarketPool; fixture?: Fixture };

export default function PositionsPage() {
  const { owner, ready, withWalletAuth } = useIdentity();
  const { stakeLabel } = useRuntime();
  const [positions, setPositions] = useState<PosRow[]>([]);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; message: string; ts: number; type: string }>
  >([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    if (!owner) return;
    const [p, n] = await Promise.all([
      api<{ positions: PosRow[] }>(`/positions?owner=${encodeURIComponent(owner)}`),
      api<{ notifications: typeof notifications }>("/notifications"),
    ]);
    setPositions(p.positions);
    setNotifications(n.notifications);
  };

  useEffect(() => {
    if (!owner) return;
    load().catch((e) => setMsg(String(e)));
    const t = setInterval(() => load().catch(() => undefined), 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  const claim = async (id: string) => {
    if (!owner) return;
    try {
      const headers = await withWalletAuth();
      const res = await api<{ payout: number; won: boolean; refund?: boolean }>(
        `/positions/${id}/claim`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ owner }),
        }
      );
      setMsg(
        res.refund
          ? `Refunded ${res.payout.toFixed(2)} ${stakeLabel}`
          : res.won
            ? `Claimed ${res.payout.toFixed(2)} ${stakeLabel}`
            : "Position closed — no payout"
      );
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <main className="shell" style={{ padding: "2rem 0 4rem" }}>
      <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>
        Portfolio
      </p>
      <h1 className="display rise" style={{ fontSize: "2.1rem", marginBottom: "0.35rem" }}>
        Positions
      </h1>
      <p className="mono" style={{ color: "var(--mute)", marginTop: 0, fontSize: "0.8rem" }}>
        {owner ? shortAddr(owner) : "Connect wallet to view positions"}
      </p>
      {msg && <p style={{ color: "var(--cyan)" }}>{msg}</p>}

      {!ready && (
        <div className="panel" style={{ padding: "1.25rem", color: "var(--mute)" }}>
          Connect a wallet to load your book.
        </div>
      )}

      <div style={{ display: "grid", gap: "0.6rem", marginBottom: "2.5rem" }}>
        {positions.map((p) => {
          const m = p.market;
          const f = p.fixture;
          const potential =
            m && m.status === "settled" && m.winningOutcome === p.outcome
              ? payoutForPosition(p.amount, m.outcomes[m.winningOutcome] || 0, m.totalPool)
              : null;
          const title = f
            ? `${f.home.shortName || f.home.name} vs ${f.away.shortName || f.away.name}`
            : m?.fixtureId || p.marketId;
          return (
            <div key={p.id} className="panel" style={{ padding: "1.05rem 1.2rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <Link
                    href={`/match/${m?.fixtureId}${m?.squadId ? `?squad=${m.squadId}` : ""}`}
                    className="display"
                    style={{ fontSize: "1.15rem", color: "inherit" }}
                  >
                    {title}
                  </Link>
                  <div className="mono" style={{ color: "var(--cyan)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                    {p.outcome.toUpperCase()} · {p.amount} {stakeLabel}
                  </div>
                  <div className="mono" style={{ color: "var(--mute)", fontSize: "0.72rem" }}>
                    {m?.marketType === "match_result" ? "1X2" : `O/U ${m?.line}`} · {m?.status}
                    {m?.winningOutcome ? ` · win ${m.winningOutcome}` : ""}
                    {m?.squadId ? " · squad" : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {potential !== null && (
                    <div
                      className="mono"
                      style={{ color: "var(--cyan-bright)", fontWeight: 700, marginBottom: "0.5rem" }}
                    >
                      {potential.toFixed(2)} {stakeLabel}
                    </div>
                  )}
                  {m?.status === "settled" && !p.claimed && (
                    <button className="btn btn-primary" onClick={() => claim(p.id)}>
                      Claim
                    </button>
                  )}
                  {m?.status === "void" && !p.claimed && (
                    <button className="btn btn-primary" onClick={() => claim(p.id)}>
                      Refund
                    </button>
                  )}
                  {p.claimed && (
                    <span className="mono" style={{ color: "var(--mute)", fontSize: "0.75rem" }}>
                      Claimed
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {ready && !positions.length && (
          <p style={{ color: "var(--mute)" }}>No positions yet — open a market and lock a stake.</p>
        )}
      </div>

      <h2 className="display" style={{ fontSize: "1.25rem" }}>
        Settlements
      </h2>
      <div style={{ display: "grid", gap: "0.45rem" }}>
        {notifications.map((n) => (
          <div
            key={n.id}
            className="panel"
            style={{ padding: "0.8rem 1rem", color: "var(--mute)", fontSize: "0.88rem" }}
          >
            <strong className="mono" style={{ color: "var(--cyan)", fontSize: "0.7rem" }}>
              {n.type.toUpperCase()}
            </strong>{" "}
            — {n.message}
          </div>
        ))}
        {!notifications.length && <p style={{ color: "var(--mute)" }}>No settlement events yet.</p>}
      </div>
    </main>
  );
}
