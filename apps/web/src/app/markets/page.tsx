"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useRuntime } from "../../lib/runtime";
import { FootballLoader } from "../../components/FootballLoader";
import { formatKickoff, useLocalTimeContext } from "../../lib/local-time";

type BoardRow = {
  id: string;
  fixtureId: string;
  match: string;
  competition?: string;
  kickoffTs?: number;
  marketType: string;
  line?: number;
  status: string;
  totalPool: number;
  implied: Record<string, number>;
  referenceOdds: Array<{ market: string; selection: string; price: number }>;
};

type BoardResponse = {
  markets: BoardRow[];
  totals: { volume: number; open: number; locked: number; settled: number };
};

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function typeLabel(type: string, line?: number) {
  if (type === "match_result") return "1X2";
  if (type === "total_goals") return `O/U ${line ?? 2.5}`;
  if (type === "total_corners") return `Corners ${line ?? 9.5}`;
  if (type === "first_scorer") return "First scorer";
  if (type === "tournament_winner") return "Tournament winner";
  return type;
}

export default function MarketsBoardPage() {
  const { stakeLabel } = useRuntime();
  const localTime = useLocalTimeContext();
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void api<BoardResponse>("/markets/board", { signal: controller.signal })
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Board unavailable");
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <main id="main-content" className="markets-board-page">
      <div className="shell">
        <header className="markets-board-header">
          <div>
            <p className="section-kicker">Liquidity desk</p>
            <h1>Prediction markets</h1>
            <p>
              Every public pool sorted by volume — implied probabilities, status, and reference odds
              from the live feed.
            </p>
          </div>
          {data && (
            <div className="markets-board-stats" aria-label="Board totals">
              <div>
                <small>Volume</small>
                <strong>
                  {number.format(data.totals.volume)} {stakeLabel}
                </strong>
              </div>
              <div>
                <small>Open</small>
                <strong>{data.totals.open}</strong>
              </div>
              <div>
                <small>Settled</small>
                <strong>{data.totals.settled}</strong>
              </div>
            </div>
          )}
        </header>

        {error && (
          <div className="squads-notice is-error" role="alert">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="squads-loading">
            <FootballLoader label="Loading market board…" />
          </div>
        )}

        {data && (
          <div className="markets-board-table-wrap">
            <table className="markets-board-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Market</th>
                  <th>Status</th>
                  <th>Pool</th>
                  <th>Implied</th>
                  <th>Ref odds</th>
                </tr>
              </thead>
              <tbody>
                {data.markets.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/match/${row.fixtureId}`}>{row.match}</Link>
                      <small>
                        {row.competition || "—"}
                        {row.kickoffTs
                          ? ` · ${formatKickoff(row.kickoffTs, localTime)}`
                          : ""}
                      </small>
                    </td>
                    <td>{typeLabel(row.marketType, row.line)}</td>
                    <td>
                      <span className={`status-chip is-${row.status}`}>{row.status}</span>
                    </td>
                    <td>
                      {number.format(row.totalPool)} {stakeLabel}
                    </td>
                    <td className="mono">
                      {Object.entries(row.implied)
                        .slice(0, 3)
                        .map(([key, value]) => `${key} ${Math.round(value * 100)}%`)
                        .join(" · ")}
                    </td>
                    <td className="mono">
                      {row.referenceOdds.length
                        ? row.referenceOdds
                            .slice(0, 3)
                            .map((quote) => `${quote.selection} ${quote.price.toFixed(2)}`)
                            .join(" · ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.markets.length && (
              <div className="empty-state">
                <strong>No public markets yet</strong>
                <p>Pools open as soon as the schedule lands.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
