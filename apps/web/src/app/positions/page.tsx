"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fixture, MarketPool, Position } from "@whistle/shared";
import { payoutForPosition } from "@whistle/shared";
import { api, shortAddr } from "../../lib/api";
import { useIdentity } from "../../lib/identity";
import { useRuntime } from "../../lib/runtime";
import { BrandMark } from "../../components/BrandMark";

type PosRow = Position & { market?: MarketPool; fixture?: Fixture };
type View = "active" | "ready" | "history";

function outcomeLabel(position: PosRow) {
  const fixture = position.fixture;
  if (position.outcome === "home") return fixture?.home.name || "Home win";
  if (position.outcome === "away") return fixture?.away.name || "Away win";
  if (position.outcome === "draw") return "Draw";
  return position.outcome === "over" ? `Over ${position.market?.line ?? ""}` : `Under ${position.market?.line ?? ""}`;
}

function payout(position: PosRow) {
  const market = position.market;
  if (!market) return 0;
  if (market.status === "void") return position.amount;
  if (market.status !== "settled" || market.winningOutcome !== position.outcome) return 0;
  return payoutForPosition(
    position.amount,
    market.outcomes[market.winningOutcome] || 0,
    market.totalPool
  );
}

export default function PositionsPage() {
  const { owner, ready, withWalletAuth } = useIdentity();
  const { stakeLabel } = useRuntime();
  const [positions, setPositions] = useState<PosRow[]>([]);
  const [view, setView] = useState<View>("active");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!owner) {
      setPositions([]);
      return;
    }
    setLoading(true);
    try {
      const response = await api<{ positions: PosRow[] }>(
        `/positions?owner=${encodeURIComponent(owner)}`
      );
      setPositions(response.positions);
    } catch {
      setMessage({ tone: "error", text: "Your picks could not be refreshed." });
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => {
    void load();
    if (!owner) return;
    const poll = setInterval(() => void load(), 10_000);
    return () => clearInterval(poll);
  }, [load, owner]);

  const buckets = useMemo(() => {
    const active: PosRow[] = [];
    const claimable: PosRow[] = [];
    const history: PosRow[] = [];
    for (const position of positions) {
      const status = position.market?.status;
      if (!position.claimed && (status === "settled" || status === "void")) claimable.push(position);
      else if (status === "open" || status === "locked") active.push(position);
      else history.push(position);
    }
    return { active, claimable, history };
  }, [positions]);

  const shown = view === "active" ? buckets.active : view === "ready" ? buckets.claimable : buckets.history;
  const activeStake = buckets.active.reduce((sum, position) => sum + position.amount, 0);
  const readyAmount = buckets.claimable.reduce((sum, position) => sum + payout(position), 0);
  const returned = positions
    .filter((position) => position.claimed)
    .reduce((sum, position) => sum + payout(position), 0);

  const claim = async (position: PosRow) => {
    if (!owner) return;
    setMessage(null);
    try {
      const headers = await withWalletAuth();
      const response = await api<{ payout: number; won: boolean; refund?: boolean }>(
        `/positions/${position.id}/claim`,
        { method: "POST", headers, body: JSON.stringify({ owner }) }
      );
      setMessage({
        tone: "success",
        text: response.refund
          ? `${response.payout.toFixed(2)} ${stakeLabel} refunded.`
          : response.won
            ? `${response.payout.toFixed(2)} ${stakeLabel} collected.`
            : "The position closed with no return.",
      });
      await load();
    } catch (cause) {
      setMessage({
        tone: "error",
        text: cause instanceof Error ? cause.message : "This return could not be collected.",
      });
    }
  };

  return (
    <main id="main-content" className="positions-page">
      <div className="shell positions-shell">
        <header className="positions-header">
          <div>
            <p className="section-kicker">From kickoff to payout</p>
            <h1>My picks</h1>
            <p>
              {owner
                ? `Wallet ${shortAddr(owner)} · live status across every match pool.`
                : "Connect your wallet to see active picks, settled returns, and refunds."}
            </p>
          </div>
          <Link href="/#matches" className="btn btn-primary">Find a match</Link>
        </header>

        <section className="positions-summary" aria-label="Position summary">
          <div>
            <span>In play</span>
            <strong>{activeStake.toLocaleString()} <small>{stakeLabel}</small></strong>
            <p>{buckets.active.length} active {buckets.active.length === 1 ? "pick" : "picks"}</p>
          </div>
          <div className={readyAmount > 0 ? "is-highlight" : ""}>
            <span>Ready to collect</span>
            <strong>{readyAmount.toFixed(2)} <small>{stakeLabel}</small></strong>
            <p>{buckets.claimable.length} settled or refunded</p>
          </div>
          <div>
            <span>Returned</span>
            <strong>{returned.toFixed(2)} <small>{stakeLabel}</small></strong>
            <p>From collected positions</p>
          </div>
        </section>

        {message && (
          <div className={`positions-notice is-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
            {message.text}
          </div>
        )}

        {!ready ? (
          <section className="positions-connect">
            <BrandMark className="empty-brand-mark is-large" accessibleLabel={null} />
            <div>
              <h2>Your match journey starts here.</h2>
              <p>Use the wallet button above to load only the picks signed by you.</p>
            </div>
          </section>
        ) : (
          <section className="positions-ledger" aria-labelledby="positions-list-title">
            <div className="positions-toolbar">
              <div>
                <p className="section-kicker">Position ledger</p>
                <h2 id="positions-list-title">Follow every result</h2>
              </div>
              <div className="segmented-control" aria-label="Filter positions">
                {(
                  [
                    ["active", "Active", buckets.active.length],
                    ["ready", "Ready", buckets.claimable.length],
                    ["history", "History", buckets.history.length],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    type="button"
                    key={value}
                    className={view === value ? "active" : ""}
                    aria-pressed={view === value}
                    onClick={() => setView(value)}
                  >
                    {label} <span>{count}</span>
                  </button>
                ))}
              </div>
            </div>

            {loading && !positions.length && <div className="positions-loading">Refreshing your picks…</div>}

            <div className="position-list">
              {shown.map((position) => {
                const market = position.market;
                const fixture = position.fixture;
                const amount = payout(position);
                const href = market
                  ? `/match/${market.fixtureId}${market.squadId ? `?squad=${market.squadId}` : ""}`
                  : "/";
                return (
                  <article className="position-card" key={position.id}>
                    <div className="position-status">
                      <span className={`status-badge${market?.status === "settled" ? " is-finished" : ""}`}>
                        {market?.status === "void" ? "Refund" : market?.status || "Pending"}
                      </span>
                      <small>{new Date(position.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
                    </div>
                    <div className="position-match">
                      <Link href={href}>
                        {fixture ? `${fixture.home.name} vs ${fixture.away.name}` : "Match pool"}
                      </Link>
                      <span>{market?.marketType === "match_result" ? "Match result" : `Goals ${market?.line}`} · {outcomeLabel(position)}</span>
                    </div>
                    <div className="position-stake">
                      <span>Stake</span>
                      <strong>{position.amount.toLocaleString()} {stakeLabel}</strong>
                    </div>
                    <div className="position-return">
                      <span>{market?.status === "open" || market?.status === "locked" ? "Potential" : "Return"}</span>
                      <strong>{market?.status === "open" || market?.status === "locked" ? "Moves with pool" : `${amount.toFixed(2)} ${stakeLabel}`}</strong>
                    </div>
                    <div className="position-action">
                      {!position.claimed && (market?.status === "settled" || market?.status === "void") ? (
                        <button type="button" className="btn btn-primary" onClick={() => void claim(position)}>
                          {market.status === "void" ? "Collect refund" : "Collect"}
                        </button>
                      ) : position.claimed ? (
                        <span>Collected</span>
                      ) : (
                        <Link href={href} aria-label="Open match">→</Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {!loading && shown.length === 0 && (
              <div className="empty-state">
                <strong>
                  {view === "active" ? "No picks in play" : view === "ready" ? "Nothing to collect yet" : "No position history"}
                </strong>
                <p>{view === "active" ? "Choose an upcoming match to start your next prediction." : "This list updates automatically after full time."}</p>
                {view === "active" && <Link href="/#matches" className="btn btn-primary">Browse matches</Link>}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
