"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MarketPool, Position } from "@whistle/shared";
import { payoutForPosition } from "@whistle/shared";
import { api } from "../../lib/api";
import { useIdentity } from "../../lib/identity";

type PosRow = Position & { market?: MarketPool };

export default function PositionsPage() {
  const { owner } = useIdentity();
  const [positions, setPositions] = useState<PosRow[]>([]);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; message: string; ts: number; type: string }>
  >([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const [p, n] = await Promise.all([
      api<{ positions: PosRow[] }>(`/positions?owner=${encodeURIComponent(owner)}`),
      api<{ notifications: typeof notifications }>("/notifications"),
    ]);
    setPositions(p.positions);
    setNotifications(n.notifications);
  };

  useEffect(() => {
    load().catch((e) => setMsg(String(e)));
    const t = setInterval(() => load().catch(() => undefined), 6000);
    return () => clearInterval(t);
  }, [owner]);

  const claim = async (id: string) => {
    try {
      const res = await api<{ payout: number; won: boolean }>(`/positions/${id}/claim`, {
        method: "POST",
        body: JSON.stringify({ owner }),
      });
      setMsg(res.won ? `Claimed $${res.payout.toFixed(2)}` : "No payout — claimed loss");
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
      <h1 className="display rise" style={{ fontSize: "2rem", marginBottom: "0.35rem" }}>
        Your positions
      </h1>
      <p style={{ color: "var(--chalk-dim)", marginTop: 0 }}>Signed in as {owner}</p>
      {msg && <p style={{ color: "var(--amber)" }}>{msg}</p>}

      <div style={{ display: "grid", gap: "0.75rem", marginBottom: "2.5rem" }}>
        {positions.map((p) => {
          const m = p.market;
          const potential =
            m && m.status === "settled" && m.winningOutcome === p.outcome
              ? payoutForPosition(p.amount, m.outcomes[m.winningOutcome] || 0, m.totalPool)
              : null;
          return (
            <div key={p.id} className="panel" style={{ padding: "1.1rem 1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <Link href={`/match/${m?.fixtureId}`} style={{ color: "var(--amber)", fontWeight: 600 }}>
                    {m?.fixtureId || p.marketId}
                  </Link>
                  <div className="display" style={{ fontSize: "1.15rem", marginTop: "0.25rem" }}>
                    {p.outcome.toUpperCase()} · ${p.amount}
                  </div>
                  <div style={{ color: "var(--chalk-dim)", fontSize: "0.85rem" }}>
                    {m?.marketType} · {m?.status}
                    {m?.winningOutcome ? ` · winner ${m.winningOutcome}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {potential !== null && (
                    <div style={{ color: "var(--amber)", fontWeight: 700, marginBottom: "0.5rem" }}>
                      ${potential.toFixed(2)}
                    </div>
                  )}
                  {m?.status === "settled" && !p.claimed && (
                    <button className="btn btn-primary" onClick={() => claim(p.id)}>
                      Claim
                    </button>
                  )}
                  {p.claimed && (
                    <span style={{ color: "var(--chalk-dim)", fontSize: "0.85rem" }}>Claimed</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!positions.length && (
          <p style={{ color: "var(--chalk-dim)" }}>No positions yet — pick a fixture and lock a stake.</p>
        )}
      </div>

      <h2 className="display" style={{ fontSize: "1.35rem" }}>
        Settlements
      </h2>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {notifications.map((n) => (
          <div
            key={n.id}
            className="panel"
            style={{ padding: "0.85rem 1rem", color: "var(--chalk-dim)", fontSize: "0.9rem" }}
          >
            <strong style={{ color: "var(--chalk)" }}>{n.type}</strong> — {n.message}
          </div>
        ))}
        {!notifications.length && (
          <p style={{ color: "var(--chalk-dim)" }}>No settlement events yet.</p>
        )}
      </div>
    </main>
  );
}
