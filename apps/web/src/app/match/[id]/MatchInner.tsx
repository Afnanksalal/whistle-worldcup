"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Fixture, MarketOutcome, MatchForecast } from "@whistle/shared";
import { impliedShares, isKnockoutMatchResult } from "@whistle/shared";
import { api, statusLabel, wsUrl } from "../../../lib/api";
import { useIdentity } from "../../../lib/identity";
import {
  formatClock,
  formatKickoff,
  useLocalTimeContext,
} from "../../../lib/local-time";
import { useRuntime } from "../../../lib/runtime";
import { PredictionChart } from "../../../components/PredictionChart";
import { MatchStatsPanel } from "../../../components/MatchStatsPanel";
import { InsightsPanel } from "../../../components/InsightsPanel";
import { TeamCrest } from "../../../components/TeamCrest";
import { FootballLoader } from "../../../components/FootballLoader";
import { ForecastPanel } from "../../../components/ForecastPanel";
import { SettlementReceiptCard } from "../../../components/SettlementReceiptCard";
import type { MatchDetail } from "../../../lib/match-detail";
import { useSolanaTransactions } from "../../../lib/solana";

const OUTCOME_LABELS: Record<string, string> = {
  home: "Home",
  draw: "Draw",
  away: "Away",
  over: "Over",
  under: "Under",
  none: "No goal",
};

function marketTabLabel(
  type: string,
  line?: number,
  outcomes?: Record<string, number>,
  knockout = false
) {
  if (type === "match_result") {
    return knockout || (outcomes && !("draw" in outcomes)) ? "To advance" : "1X2";
  }
  if (type === "total_goals") return line != null ? `Goals ${line}` : "Goals";
  if (type === "total_corners") return line != null ? `Corners ${line}` : "Corners";
  if (type === "first_scorer") return "First scorer";
  if (type === "tournament_winner") return "Winner";
  return type.replace(/_/g, " ");
}

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function friendlyStakeError(cause: unknown, stakeLabel = "units"): string {
  const message = cause instanceof Error ? cause.message : String(cause || "");
  if (
    /0x177d/i.test(message) ||
    /OutcomeCannotChange/i.test(message) ||
    /cannot switch outcomes/i.test(message)
  ) {
    return "This wallet already has a pick on the other side of this market. Add to the same outcome, or use another wallet.";
  }
  if (/Simulation failed/i.test(message) && message.length > 220) {
    return `The on-chain stake could not be simulated. Check your ${stakeLabel} balance and try again.`;
  }
  if (/valid signed challenge|wallet identity/i.test(message)) {
    return "Wallet signature required. Reconnect your wallet and confirm again.";
  }
  return message || "The prediction could not be confirmed.";
}

function outcomeName(outcome: string, fixture: Fixture, marketType?: string) {
  if (marketType === "first_scorer") {
    if (outcome === "home") return `${fixture.home.name} first`;
    if (outcome === "away") return `${fixture.away.name} first`;
    if (outcome === "none") return "No goal";
  }
  if (marketType === "tournament_winner") {
    return outcome
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
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
  const { deposit: depositOnchain } = useSolanaTransactions();
  const timeContext = useLocalTimeContext();
  const [data, setData] = useState<MatchDetail | null>(initialDetail);
  const [now, setNow] = useState<number | null>(initialDetail.serverNow ?? null);
  const serverOffset = useRef(0);
  const [amount, setAmount] = useState(10);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(
    initialDetail.markets[0]?.id || null
  );
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncClock = useCallback((serverNow?: number) => {
    const browserNow = Date.now();
    if (typeof serverNow === "number" && Number.isFinite(serverNow)) {
      serverOffset.current = serverNow - browserNow;
    }
    setNow(browserNow + serverOffset.current);
  }, []);

  const load = useCallback(async () => {
    try {
      const query = squadId ? `?squadId=${encodeURIComponent(squadId)}` : "";
      const detail = await api<MatchDetail>(`/fixtures/${id}${query}`);
      setData(detail);
      syncClock(detail.serverNow);
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
  }, [id, squadId, syncClock]);

  useEffect(() => {
    syncClock(initialDetail.serverNow);
    const clock = setInterval(
      () => setNow(Date.now() + serverOffset.current),
      30_000
    );
    return () => clearInterval(clock);
  }, [initialDetail.serverNow, syncClock]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), data?.fixture.status === "live" ? 4_000 : 12_000);
    return () => clearInterval(poll);
  }, [data?.fixture.status, load]);

  useEffect(() => {
    const socket = new WebSocket(wsUrl());
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { event?: string };
        if (
          message.event === "score" ||
          message.event === "odds" ||
          message.event === "settled" ||
          message.event === "receipt" ||
          message.event === "fixtures"
        ) {
          void load();
        }
      } catch {
        // ignore malformed fanout
      }
    };
    return () => socket.close();
  }, [load]);

  const market = useMemo(
    () => data?.markets.find((item) => item.id === selectedMarket) || data?.markets[0],
    [data, selectedMarket]
  );
  const shares = market ? impliedShares(market.outcomes) : {};
  const history = market ? data?.priceHistory?.[market.id] || [] : [];

  const knockoutResult =
    !!data &&
    !!market &&
    market.marketType === "match_result" &&
    isKnockoutMatchResult(data.fixture);

  const chartLabels = useMemo(() => {
    if (!data || !market) return {};
    return Object.fromEntries(
      Object.keys(market.outcomes)
        .filter((key) => !(knockoutResult && key === "draw"))
        .map((key) => [key, outcomeName(key, data.fixture, market.marketType)])
    );
  }, [data, market, knockoutResult]);

  const quote = useMemo(() => {
    if (!market || !selectedOutcome || !Number.isFinite(amount) || amount <= 0) return null;
    const currentOutcome = market.outcomes[selectedOutcome] || 0;
    const nextTotal = market.totalPool + amount;
    const nextOutcome = currentOutcome + amount;
    const grossPayout = nextOutcome > 0 ? (amount / nextOutcome) * nextTotal : 0;
    const feeBps =
      meta.settlementRail === "onchain" ? Math.max(0, meta.platformFeeBps || 0) : 0;
    const estimatedPayout = grossPayout * (1 - feeBps / 10_000);
    return {
      nextShare: nextTotal > 0 ? nextOutcome / nextTotal : 0,
      estimatedPayout,
      estimatedProfit: estimatedPayout - amount,
      currentOutcome,
      feeBps,
    };
  }, [amount, market, meta.platformFeeBps, meta.settlementRail, selectedOutcome]);

  const stake = async () => {
    if (!market || !selectedOutcome || !owner || !quote || amount <= 0) return;
    setBusy(true);
    setNotice(null);
    try {
      let txSignature: string | undefined = undefined;
      const outcome = selectedOutcome as MarketOutcome;

      if (meta.settlementRail === "onchain") {
        if (!meta.whistleProgramId || !meta.usdcMint) {
          throw new Error("On-chain staking configuration is unavailable");
        }
        // Challenges are single-use — sign once for prepare, again for deposit.
        const prepareHeaders = await withWalletAuth();
        try {
          await api(`/markets/${market.id}/prepare`, {
            method: "POST",
            headers: prepareHeaders,
          });
        } catch (prepareError) {
          const message =
            prepareError instanceof Error ? prepareError.message : String(prepareError);
          // One automatic retry helps when public Solana RPC rate-limits create_market.
          if (message.includes("could not be prepared") || message.includes("429")) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const retryHeaders = await withWalletAuth();
            await api(`/markets/${market.id}/prepare`, {
              method: "POST",
              headers: retryHeaders,
            });
          } else {
            throw prepareError;
          }
        }

        txSignature = await depositOnchain({
          programId: meta.whistleProgramId,
          usdcMint: meta.usdcMint,
          fixtureId: data!.fixture.id,
          marketType: market.marketType,
          line: market.line,
          squadId: market.squadId,
          outcome,
          amount,
        });
      }

      const depositHeaders = await withWalletAuth();
      await api(`/markets/${market.id}/deposit`, {
        method: "POST",
        headers: depositHeaders,
        body: JSON.stringify({ outcome: selectedOutcome, amount, owner, txSignature }),
      });
      setNotice({
        tone: "success",
        text: txSignature
          ? `${amount} ${stakeLabel} transaction confirmed: ${txSignature.slice(0, 8)}...`
          : `${amount} ${stakeLabel} confirmed on ${outcomeName(selectedOutcome, data!.fixture, market.marketType)}.`,
      });
      await load();
    } catch (cause) {
      setNotice({
        tone: "error",
        text: friendlyStakeError(cause, stakeLabel),
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
    now !== null &&
    fixture.kickoffTs > now;

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
              {formatKickoff(fixture.kickoffTs, timeContext)}
            </time>
            {(fixture.venue || data?.matchInfo?.venue) && (
              <span>{fixture.venue || data?.matchInfo?.venue}</span>
            )}
            {data?.matchInfo?.city && <span>{data.matchInfo.city}</span>}
            {(data?.matchInfo?.homeFormation || data?.matchInfo?.awayFormation) && (
              <span>
                {[data.matchInfo.homeFormation, data.matchInfo.awayFormation]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
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
            className={`match-score${hasScore ? " has-score" : ""}${
              fixture.status === "live" && hasScore ? " is-pulsing" : ""
            }`}
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
                  {formatClock(fixture.kickoffTs, timeContext)}
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
          {data.receipt && (
            <SettlementReceiptCard
              receipt={data.receipt}
              homeName={fixture.home.name}
              awayName={fixture.away.name}
            />
          )}

          {(fixture.status === "live" || (live?.events && live.events.length > 0)) && (
            <section className="match-event-tape" aria-label="Match events">
              <div>
                <p className="section-kicker">Live tape</p>
                <h2>Match events</h2>
                <p>Goals, cards, and corners from the live feed as they land.</p>
              </div>
              {live?.events?.length ? (
                <ol className="event-tape-list">
                  {[...live.events].reverse().map((event, index) => (
                    <li key={`${event.type}-${event.minute}-${event.player}-${index}`}>
                      <span className="mono">{event.minute != null ? `${event.minute}'` : "—"}</span>
                      <strong>{event.type.replace(/_/g, " ")}</strong>
                      <span>
                        {[event.team, event.player, event.detail].filter(Boolean).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="reference-empty">
                  <strong>Waiting for the next event</strong>
                  <span>
                    {meta.fixtureSource === "txline" || meta.txlineConfigured
                      ? "The tape fills as TxLINE score actions arrive."
                      : "The tape fills as live match events arrive."}
                  </span>
                </div>
              )}
            </section>
          )}

          <ForecastPanel forecast={data.forecast} fixture={fixture} />

          <PredictionChart
            history={history}
            labels={chartLabels}
            omitKeys={knockoutResult ? ["draw"] : []}
          />

          <div className="match-intelligence-grid">
            <MatchStatsPanel
              stats={data.stats || null}
              homeName={fixture.home.shortName || fixture.home.name}
              awayName={fixture.away.shortName || fixture.away.name}
              liveEvents={live?.events}
            />
            <InsightsPanel insights={data.insights || []} now={now} />
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
                    {marketTabLabel(
                      item.marketType,
                      item.line,
                      item.outcomes,
                      item.marketType === "match_result" &&
                        isKnockoutMatchResult(fixture)
                    )}
                  </button>
                ))}
              </div>

              {market && (
                <>
                  {market.marketType === "match_result" &&
                    isKnockoutMatchResult(fixture) && (
                      <p className="knockout-market-note">
                        Knockout tie — no draw. Winner after extra time / penalties advances.
                      </p>
                    )}
                  <div className="outcome-options">
                    {Object.keys(market.outcomes)
                      .filter(
                        (outcome) =>
                          !(
                            market.marketType === "match_result" &&
                            isKnockoutMatchResult(fixture) &&
                            outcome === "draw"
                          )
                      )
                      .map((outcome) => {
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
                            <strong>
                              {outcomeName(outcome, fixture, market.marketType)}
                            </strong>
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
                      Closes {formatKickoff(fixture.kickoffTs, timeContext)}
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
