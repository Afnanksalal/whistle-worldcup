"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fixture, MatchForecast } from "@whistle/shared";
import { impliedShares } from "@whistle/shared";
import { api, formatKickoff, statusLabel } from "../../../lib/api";
import { useIdentity } from "../../../lib/identity";
import { useRuntime } from "../../../lib/runtime";
import { PredictionChart } from "../../../components/PredictionChart";
import { MatchStatsPanel } from "../../../components/MatchStatsPanel";
import { InsightsPanel } from "../../../components/InsightsPanel";
import { TeamCrest } from "../../../components/TeamCrest";
import { FootballLoader } from "../../../components/FootballLoader";
import { ForecastPanel } from "../../../components/ForecastPanel";
import type { MatchDetail } from "../../../lib/match-detail";

const OUTCOME_LABELS: Record<string, string> = {
  home: "Home win",
  draw: "Draw",
  away: "Away win",
  over: "Over",
  under: "Under",
};

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function outcomeName(outcome: string, fixture: Fixture) {
  if (outcome === "home") return fixture.home.name;
  if (outcome === "away") return fixture.away.name;
  return OUTCOME_LABELS[outcome] || outcome;
}

export default function MatchPageInner({
  fixtureId: id,
  squadId,
  initialDetail,
}: {
  fixtureId: string;
  squadId?: string;
  initialDetail: MatchDetail;
}) {
  const { owner, ready, withWalletAuth } = useIdentity();
  const { stakeLabel, meta } = useRuntime();
  const [data, setData] = useState<MatchDetail | null>(initialDetail);
  const [amount, setAmount] = useState(10);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(
    initialDetail.markets[0]?.id || null
  );
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const query = squadId ? `?squadId=${encodeURIComponent(squadId)}` : "";
      const detail = await api<MatchDetail>(`/fixtures/${id}${query}`);
      setData(detail);
      if (!detail.forecast) {
        void api<{ forecast: MatchForecast }>(`/fixtures/${id}/forecast`)
          .then(({ forecast }) => {
            setData((current) =>
              current?.fixture.id === id ? { ...current, forecast } : current
            );
          })
          .catch(() => undefined);
      }
      setSelectedMarket((current) =>
        current && detail.markets.some((market) => market.id === current)
          ? current
          : detail.markets[0]?.id || null
      );
      setError(null);
    } catch {
      setError("This match is not available from the current tournament feed.");
    }
  }, [id, squadId]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), data?.fixture.status === "live" ? 4_000 : 12_000);
    return () => clearInterval(poll);
  }, [data?.fixture.status, load]);

  const market = useMemo(
    () => data?.markets.find((item) => item.id === selectedMarket) || data?.markets[0],
    [data, selectedMarket]
  );
  const shares = market ? impliedShares(market.outcomes) : {};
  const history = market ? data?.priceHistory?.[market.id] || [] : [];

  const chartLabels = useMemo(() => {
    if (!data || !market) return {};
    return Object.fromEntries(
      Object.keys(market.outcomes).map((key) => [key, outcomeName(key, data.fixture)])
    );
  }, [data, market]);

  const quote = useMemo(() => {
    if (!market || !selectedOutcome || !Number.isFinite(amount) || amount <= 0) return null;
    const currentOutcome = market.outcomes[selectedOutcome] || 0;
    const nextTotal = market.totalPool + amount;
    const nextOutcome = currentOutcome + amount;
    const estimatedPayout = nextOutcome > 0 ? (amount / nextOutcome) * nextTotal : 0;
    return {
      nextShare: nextTotal > 0 ? nextOutcome / nextTotal : 0,
      estimatedPayout,
      estimatedProfit: estimatedPayout - amount,
      currentOutcome,
    };
  }, [amount, market, selectedOutcome]);

  const stake = async () => {
    if (!market || !selectedOutcome || !owner || !quote || amount <= 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const headers = await withWalletAuth();
      await api(`/markets/${market.id}/deposit`, {
        method: "POST",
        headers,
        body: JSON.stringify({ outcome: selectedOutcome, amount, owner }),
      });
      setNotice({
        tone: "success",
        text: `${amount} ${stakeLabel} confirmed on ${outcomeName(selectedOutcome, data!.fixture)}.`,
      });
      await load();
    } catch (cause) {
      setNotice({
        tone: "error",
        text: cause instanceof Error ? cause.message : "The prediction could not be confirmed.",
      });
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <main id="main-content" className="shell match-page match-page-state">
        <div className="empty-state is-error" role="alert">
          <strong>Match unavailable</strong>
          <p>{error}</p>
          <Link href="/" className="btn btn-primary">Back to matches</Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main id="main-content" className="shell match-page match-page-state" aria-busy="true">
        <div className="match-loading">
          <FootballLoader label="Opening the match centre…" />
        </div>
      </main>
    );
  }

  const { fixture, live } = data;
  const homeScore = live?.homeScore ?? fixture.score?.home;
  const awayScore = live?.awayScore ?? fixture.score?.away;
  const hasScore = homeScore !== undefined && awayScore !== undefined;
  const canStake =
    market?.status === "open" &&
    fixture.status === "scheduled" &&
    fixture.kickoffTs > Date.now();

  return (
    <main id="main-content" className="shell match-page">
      <div className="match-breadcrumbs">
        <Link href="/">← All matches</Link>
        {squadId && <span>Squad pool</span>}
      </div>

      <section className="match-scorecard" aria-labelledby="match-title">
        <div className="match-scorecard-top">
          <div>
            <span className={`status-badge${fixture.status === "live" ? " is-live" : fixture.status === "finished" ? " is-finished" : ""}`}>
              {statusLabel(fixture.status)}{live?.clock ? ` · ${live.clock}` : ""}
            </span>
            <span>{fixture.competition || "World Cup"}</span>
          </div>
          <div>
            <time
              dateTime={new Date(fixture.kickoffTs).toISOString()}
              suppressHydrationWarning
            >
              {formatKickoff(fixture.kickoffTs)}
            </time>
            {fixture.venue && <span>{fixture.venue}</span>}
          </div>
        </div>

        <h1 id="match-title" className="sr-only">{fixture.home.name} vs {fixture.away.name}</h1>
        <div className="match-teams">
          <div className="match-team match-team-home">
            <TeamCrest team={fixture.home} variant="hero" />
            <div>
              <small>Home</small>
              <strong>{fixture.home.name}</strong>
            </div>
          </div>
          <div
            key={hasScore ? `${homeScore}-${awayScore}` : "pending"}
            className={`match-score${hasScore ? " has-score" : ""}`}
            aria-label={hasScore
              ? `${fixture.home.name} ${homeScore}, ${fixture.away.name} ${awayScore}`
              : `${fixture.home.name} versus ${fixture.away.name}`}
          >
            {hasScore ? (
              <>{homeScore}<span>:</span>{awayScore}</>
            ) : (
              <>
                <span>VS</span>
                <small suppressHydrationWarning>
                  {new Date(fixture.kickoffTs).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </>
            )}
          </div>
          <div className="match-team match-team-away">
            <TeamCrest team={fixture.away} variant="hero" />
            <div>
              <small>Away</small>
              <strong>{fixture.away.name}</strong>
            </div>
          </div>
        </div>

        <div className="match-ribbon match-ribbon-light" aria-label="Match timeline">
          <span className={fixture.status === "scheduled" ? "active" : "passed"}>Kickoff</span>
          <i />
          <span className={fixture.status === "live" ? "active" : fixture.status === "finished" ? "passed" : ""}>Half-time</span>
          <i />
          <span className={fixture.status === "finished" ? "active" : ""}>Full-time</span>
        </div>
      </section>

      <div className="match-layout">
        <div className="match-analysis">
          <ForecastPanel forecast={data.forecast} fixture={fixture} />

          <PredictionChart history={history} labels={chartLabels} />

          <div className="match-intelligence-grid">
            <MatchStatsPanel
              stats={data.stats || null}
              homeName={fixture.home.shortName || fixture.home.name}
              awayName={fixture.away.shortName || fixture.away.name}
            />
            <InsightsPanel insights={data.insights || []} />
          </div>

          <section className="reference-panel">
            <div>
              <p className="section-kicker">Market context</p>
              <h2>Reference prices</h2>
              <p>Independent reference quotes from the match feed, separate from the fan pool.</p>
            </div>
            {data.odds.length ? (
              <div className="reference-quotes">
                {data.odds.slice(0, 9).map((odds, index) => (
                  <div key={`${odds.market}-${odds.selection}-${index}`}>
                    <span>{odds.market} · {odds.selection}</span>
                    <strong>{odds.price.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="reference-empty">
                <strong>No reference price published</strong>
                <span>The pool still works independently when the external quote is unavailable.</span>
              </div>
            )}
          </section>
        </div>

        <aside className="bet-slip" aria-labelledby="bet-slip-title">
          <div className="bet-slip-heading">
            <div>
              <p className="section-kicker">Your prediction</p>
              <h2 id="bet-slip-title">Pick the outcome</h2>
            </div>
            <span>{stakeLabel === "units" ? "Play units" : stakeLabel}</span>
          </div>

          {data.markets.length > 0 ? (
            <>
              <div className="market-tabs" aria-label="Choose a market">
                {data.markets.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={market?.id === item.id ? "active" : ""}
                    aria-pressed={market?.id === item.id}
                    onClick={() => {
                      setSelectedMarket(item.id);
                      setSelectedOutcome(null);
                      setNotice(null);
                    }}
                  >
                    {item.marketType === "match_result" ? "Match result" : `Goals ${item.line}`}
                  </button>
                ))}
              </div>

              {market && (
                <>
                  <div className="outcome-options">
                    {Object.keys(market.outcomes).map((outcome) => {
                      const active = selectedOutcome === outcome;
                      const outcomePool = market.outcomes[outcome] || 0;
                      const currentReturn = outcomePool > 0 ? market.totalPool / outcomePool : 0;
                      return (
                        <button
                          type="button"
                          key={outcome}
                          className={active ? "active" : ""}
                          aria-pressed={active}
                          disabled={!canStake}
                          onClick={() => {
                            setSelectedOutcome(outcome);
                            setNotice(null);
                          }}
                        >
                          <span>
                            <strong>{outcomeName(outcome, fixture)}</strong>
                            <small>
                              {outcomePool
                                ? `${number.format(outcomePool)} ${stakeLabel} backing`
                                : "No picks yet"}
                            </small>
                          </span>
                          <span>
                            <strong>{market.totalPool > 0 ? `${Math.round((shares[outcome] || 0) * 100)}%` : "—"}</strong>
                            <small>{currentReturn > 0 ? `${currentReturn.toFixed(2)}× now` : "opens evenly"}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="stake-control">
                    <label htmlFor="stake-amount">Stake amount</label>
                    <div className="stake-input-wrap">
                      <input
                        id="stake-amount"
                        type="number"
                        inputMode="decimal"
                        min={1}
                        max={1_000_000}
                        value={Number.isFinite(amount) ? amount : ""}
                        onChange={(event) => setAmount(Number(event.target.value))}
                      />
                      <span>{stakeLabel}</span>
                    </div>
                    <div className="quick-stakes" aria-label="Quick stake amounts">
                      {[10, 25, 50, 100].map((value) => (
                        <button
                          type="button"
                          key={value}
                          className={amount === value ? "active" : ""}
                          onClick={() => setAmount(value)}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`payout-preview${quote ? " is-ready" : ""}`}>
                    <div>
                      <span>Estimated return</span>
                      <strong>{quote ? `${quote.estimatedPayout.toFixed(2)} ${stakeLabel}` : "Choose an outcome"}</strong>
                    </div>
                    {quote && (
                      <dl>
                        <div>
                          <dt>Your share after this pick</dt>
                          <dd>{(quote.nextShare * 100).toFixed(1)}%</dd>
                        </div>
                        <div>
                          <dt>Estimated profit</dt>
                          <dd>{quote.estimatedProfit >= 0 ? "+" : ""}{quote.estimatedProfit.toFixed(2)} {stakeLabel}</dd>
                        </div>
                      </dl>
                    )}
                    <p>The estimate changes as more fans join the pool before kickoff.</p>
                  </div>

                  <div className="bet-rules">
                    <span suppressHydrationWarning>
                      Closes {formatKickoff(fixture.kickoffTs)}
                    </span>
                    <span>{meta.txlineConfigured ? "Result verified at full time" : "Unverified results refund"}</span>
                  </div>

                  {!ready && <p className="wallet-prompt">Connect a wallet to confirm your prediction.</p>}
                  {!canStake && (
                    <p className="wallet-prompt">
                      {market.status === "settled"
                        ? "This pool has settled."
                        : market.status === "void"
                          ? "This pool was refunded."
                          : "Predictions are closed for this match."}
                    </p>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary bet-confirm"
                    disabled={busy || !selectedOutcome || !quote || !ready || !canStake}
                    onClick={stake}
                  >
                    {busy
                      ? "Confirming…"
                      : !selectedOutcome
                        ? "Choose an outcome"
                        : `Confirm ${amount || 0} ${stakeLabel}`}
                  </button>

                  {notice && (
                    <div className={`bet-notice is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
                      <p>{notice.text}</p>
                      {notice.tone === "success" && <Link href="/positions">View my picks →</Link>}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="bet-slip-empty">
              <strong>No pool for this match</strong>
              <p>The match feed has not opened a prediction pool yet.</p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
