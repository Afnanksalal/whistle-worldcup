"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Fixture, MarketPool } from "@whistle/shared";
import { impliedShares } from "@whistle/shared";
import { api, statusLabel, wsUrl } from "../lib/api";
import {
  calendarDateKey,
  formatCalendarDate,
  formatClock,
  formatDayLabel,
  formatKickoff,
  timeZoneLabel,
  useLocalTimeContext,
} from "../lib/local-time";
import { useRuntime, type AppMeta } from "../lib/runtime";
import { FootballLoader } from "./FootballLoader";
import { TeamCrest, teamShortCode } from "./TeamCrest";

type FixturesRes = { fixtures: Fixture[]; serverNow?: number; meta?: AppMeta };
type MarketsRes = { markets: MarketPool[] };
type BoardFilter = "next" | "live" | "results";

type FixtureBoardProps = {
  initialFixtures?: Fixture[];
  initialMarkets?: MarketPool[];
  initialServerNow?: number;
};

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function matchStatusClass(status: Fixture["status"]) {
  if (status === "live") return " is-live";
  if (status === "finished") return " is-finished";
  return "";
}

export function FixtureBoard({
  initialFixtures = [],
  initialMarkets = [],
  initialServerNow,
}: FixtureBoardProps) {
  const { meta, stakeLabel } = useRuntime();
  const timeContext = useLocalTimeContext();
  const [fixtures, setFixtures] = useState<Fixture[]>(initialFixtures);
  const [markets, setMarkets] = useState<MarketPool[]>(initialMarkets);
  const [filter, setFilter] = useState<BoardFilter>("next");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialFixtures.length === 0);
  const [now, setNow] = useState<number | null>(initialServerNow ?? null);
  const serverOffset = useRef(0);
  const refreshQueued = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncClock = useCallback((serverNow?: number) => {
    const browserNow = Date.now();
    if (typeof serverNow === "number" && Number.isFinite(serverNow)) {
      serverOffset.current = serverNow - browserNow;
    }
    setNow(browserNow + serverOffset.current);
  }, []);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const [fixtureRes, marketRes] = await Promise.all([
        api<FixturesRes>("/fixtures"),
        api<MarketsRes>("/markets"),
      ]);
      setFixtures(fixtureRes.fixtures);
      setMarkets(marketRes.markets);
      syncClock(fixtureRes.serverNow);
      setError(null);
    } catch {
      setError("The match feed is taking longer than expected. We’ll keep trying.");
    } finally {
      setLoading(false);
    }
  }, [syncClock]);

  useEffect(() => {
    syncClock(initialServerNow);
    void load(initialFixtures.length === 0);
    const poll = setInterval(() => void load(), 20_000);
    const clock = setInterval(
      () => setNow(Date.now() + serverOffset.current),
      30_000
    );
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl());
      socket.onmessage = () => {
        if (refreshQueued.current) return;
        refreshQueued.current = setTimeout(() => {
          refreshQueued.current = null;
          void load();
        }, 700);
      };
    } catch {
      // Polling remains active when WebSocket setup is unavailable.
    }

    return () => {
      clearInterval(poll);
      clearInterval(clock);
      if (refreshQueued.current) clearTimeout(refreshQueued.current);
      socket?.close();
    };
  }, [initialFixtures.length, initialServerNow, load, syncClock]);

  const ordered = useMemo(
    () => [...fixtures].sort((a, b) => a.kickoffTs - b.kickoffTs),
    [fixtures]
  );
  const live = ordered.filter((fixture) => fixture.status === "live");
  const upcoming = ordered.filter(
    (fixture) =>
      fixture.status === "scheduled" && fixture.kickoffTs > (now ?? 0)
  );
  const results = ordered
    .filter((fixture) => fixture.status === "finished")
    .sort((a, b) => b.kickoffTs - a.kickoffTs);
  const featured = live[0] || upcoming[0] || results[0];

  const marketsFor = useCallback(
    (fixtureId: string) => markets.filter((market) => market.fixtureId === fixtureId && !market.squadId),
    [markets]
  );

  const shown = useMemo(() => {
    if (filter === "live") return live;
    // Full WC board is ~104 finished + a few remaining; show the tournament tape.
    if (filter === "results") return results.slice(0, 120);
    return upcoming.slice(0, 24);
  }, [filter, live, results, upcoming]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; fixtures: Fixture[] }>();
    for (const fixture of shown) {
      const key = calendarDateKey(fixture.kickoffTs, timeContext.timeZone);
      const current = map.get(key);
      map.set(key, {
        label: formatDayLabel(fixture.kickoffTs, now, timeContext),
        fixtures: [...(current?.fixtures || []), fixture],
      });
    }
    return [...map.entries()];
  }, [now, shown, timeContext]);

  const featuredMarkets = featured ? marketsFor(featured.id) : [];
  const featuredResult = featuredMarkets.find((market) => market.marketType === "match_result");
  const featuredShares = featuredResult ? impliedShares(featuredResult.outcomes) : {};
  const featuredPool = featuredResult?.totalPool || 0;
  const hasFeaturedLiquidity = featuredPool > 0;
  const sourceIsLive = meta.fixtureSource === "txline" || meta.txlineConfigured;

  return (
    <>
      <section className="home-hero" aria-labelledby="home-title">
        <picture className="home-hero__media">
          <source
            media="(max-width: 900px)"
            srcSet="/brand/pitch-banner-mobile-v2.webp"
            type="image/webp"
          />
          <Image
            className="home-hero__image"
            src="/brand/pitch-banner.webp"
            alt=""
            fill
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
          />
        </picture>
        <div className="home-hero__shade" aria-hidden="true" />

        <div className="shell home-hero-grid">
          <div className="home-intro">
            <div className="tournament-date">
              <span>FIFA WORLD CUP 26</span>
              <time dateTime={now ? new Date(now).toISOString() : undefined} suppressHydrationWarning>
                {now
                  ? formatCalendarDate(now, timeContext)
                  : "Tournament live"}
              </time>
            </div>
            <div className="home-intro__title">
              <p className="section-kicker">Today&apos;s matches</p>
              <h1 id="home-title">Pick today&apos;s matches.</h1>
            </div>
            <div className="home-intro__copy">
              <p className="home-lede">
                Choose before kickoff. Follow the score. See the pool settle at full time.
              </p>
              <div className="hero-actions">
                <a className="btn btn-primary" href="#matches">
                  View matches
                </a>
                <Link className="text-link" href="/positions">
                  Track my picks <span aria-hidden>↗</span>
                </Link>
              </div>
            </div>
          </div>

          <div className="featured-wrap">
            {featured ? (
              <article className="featured-match">
                <div className="featured-topline">
                  <div>
                    <span className={`status-badge${matchStatusClass(featured.status)}`}>
                      {statusLabel(featured.status)}
                    </span>
                    <span>{featured.competition || "World Cup"}</span>
                  </div>
                  <span>{featured.venue || featured.round || "Match centre"}</span>
                </div>

                <div className="featured-kickoff">
                  {featured.status === "scheduled" ? (
                    <>
                      <strong>Next kickoff</strong>
                      <time
                        dateTime={new Date(featured.kickoffTs).toISOString()}
                        suppressHydrationWarning
                      >
                        {formatKickoff(featured.kickoffTs, timeContext)}
                      </time>
                    </>
                  ) : (
                    <strong>{statusLabel(featured.status)}</strong>
                  )}
                </div>

                <div className="featured-teams">
                  <div className="featured-team featured-team-home">
                    <TeamCrest team={featured.home} variant="featured" />
                    <span>{featured.home.name}</span>
                  </div>
                  <div
                    key={featured.score ? `${featured.score.home}-${featured.score.away}` : "pending"}
                    className="featured-score"
                    aria-label={featured.score
                      ? `${featured.home.name} ${featured.score.home}, ${featured.away.name} ${featured.score.away}`
                      : `${featured.home.name} versus ${featured.away.name}`}
                  >
                    {featured.score ? (
                      <>
                        {featured.score.home}<span>:</span>{featured.score.away}
                      </>
                    ) : (
                      <span>vs</span>
                    )}
                  </div>
                  <div className="featured-team featured-team-away">
                    <TeamCrest team={featured.away} variant="featured" />
                    <span>{featured.away.name}</span>
                  </div>
                </div>

                <div className="match-ribbon" aria-label="Match timeline from kickoff to full time">
                  <span className={featured.status === "scheduled" ? "active" : "passed"}>0′</span>
                  <i />
                  <span className={featured.status === "live" ? "active" : featured.status === "finished" ? "passed" : ""}>HT</span>
                  <i />
                  <span className={featured.status === "finished" ? "active" : ""}>90′</span>
                </div>

                <div className="featured-market">
                  <div className="featured-market-heading">
                    <div>
                      <span>Match winner pool</span>
                      <strong>
                        {hasFeaturedLiquidity
                          ? `${number.format(featuredPool)} ${stakeLabel}`
                          : "Ready for the first pick"}
                      </strong>
                    </div>
                    <span>{featuredResult?.status === "open" ? "Open" : featuredResult?.status || "View"}</span>
                  </div>
                  <div className="featured-outcomes">
                    {(["home", "draw", "away"] as const).map((outcome) => (
                      <div key={outcome}>
                        <span>
                          {outcome === "home"
                            ? teamShortCode(featured.home.name, featured.home.shortName)
                            : outcome === "away"
                              ? teamShortCode(featured.away.name, featured.away.shortName)
                              : "DRAW"}
                        </span>
                        <strong>
                          {hasFeaturedLiquidity && featuredResult
                            ? `${Math.round((featuredShares[outcome] || 0) * 100)}%`
                            : "—"}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>

                <Link className="featured-cta" href={`/match/${featured.id}`}>
                  Open match pool <span aria-hidden>→</span>
                </Link>
              </article>
            ) : (
              <div className="featured-match featured-empty">
                <p className="section-kicker">Match feed</p>
                {loading ? (
                  <FootballLoader label="Loading the tournament…" inverse />
                ) : (
                  <>
                    <h2>The next kickoff is being confirmed.</h2>
                    <Image
                      className="featured-empty-mascot"
                      src="/brand/pip-mascot.png"
                      alt=""
                      width={1254}
                      height={1254}
                      aria-hidden="true"
                    />
                  </>
                )}
              </div>
            )}
          </div>

          <ol className="match-flow" aria-label="From schedule to settlement">
            <li><span>01</span>Schedule</li>
            <li><span>02</span>Pick &amp; stake</li>
            <li><span>03</span>Live</li>
            <li><span>04</span>Settled at FT</li>
          </ol>
        </div>
      </section>

      <section id="matches" className="match-board shell" aria-labelledby="matches-title">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Tournament schedule</p>
            <h2 id="matches-title">Match centre</h2>
          </div>
          <div className="board-summary" aria-label="Tournament status">
            <span className={live.length ? "is-live" : ""}>
              {live.length ? `${live.length} live` : "No match live"}
            </span>
            <span>{results.length} results</span>
          </div>
        </div>

        {!sourceIsLive && (
          <div className="source-notice" role="status">
            <span aria-hidden>i</span>
            <p>
              <strong>Schedule preview.</strong> Picks use {stakeLabel} until live results are
              connected; unsettled matches are refunded.
            </p>
          </div>
        )}

        <div className="board-toolbar">
          <div className="segmented-control" aria-label="Filter matches">
            {(
              [
                ["next", "Next", upcoming.length],
                ["live", "Live", live.length],
                ["results", "Results", results.length],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "active" : ""}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </div>
          <span className="timezone-note">
            Times shown in {timeZoneLabel(timeContext)}
          </span>
        </div>

        {error && (
          <div className="empty-state is-error" role="alert">
            <strong>Match centre unavailable</strong>
            <p>{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void load(true)}>
              Try again
            </button>
          </div>
        )}

        {loading && !fixtures.length && (
          <div className="fixture-loading">
            <FootballLoader label="Loading matches…" compact />
            <div className="fixture-skeletons" aria-hidden="true">
              {[0, 1, 2].map((item) => <span key={item} />)}
            </div>
          </div>
        )}

        {((!loading && !error) || fixtures.length > 0) && grouped.map(([dayKey, day]) => (
          <div className="fixture-day" key={dayKey}>
            <div className="fixture-day-label">
              <span>{day.label}</span>
              <i />
            </div>
            <div className="fixture-list">
              {day.fixtures.map((fixture) => {
                const fixtureMarkets = marketsFor(fixture.id);
                const resultMarket = fixtureMarkets.find((market) => market.marketType === "match_result");
                const pool = fixtureMarkets.reduce((sum, market) => sum + market.totalPool, 0);
                const shares = resultMarket ? impliedShares(resultMarket.outcomes) : {};
                const hasLiquidity = pool > 0;
                const hasResultLiquidity = (resultMarket?.totalPool || 0) > 0;
                return (
                  <Link className="fixture-card" href={`/match/${fixture.id}`} key={fixture.id}>
                    <div className="fixture-time">
                      <span className={`status-badge${matchStatusClass(fixture.status)}`}>
                        {statusLabel(fixture.status)}
                      </span>
                      <time
                        dateTime={new Date(fixture.kickoffTs).toISOString()}
                        suppressHydrationWarning
                      >
                        {formatClock(fixture.kickoffTs, timeContext)}
                      </time>
                      <small>{fixture.round || fixture.group || "World Cup"}</small>
                    </div>

                    <div className="fixture-teams">
                      <div>
                        <TeamCrest team={fixture.home} />
                        <strong>{fixture.home.name}</strong>
                        {fixture.score && <b>{fixture.score.home}</b>}
                      </div>
                      <div>
                        <TeamCrest team={fixture.away} />
                        <strong>{fixture.away.name}</strong>
                        {fixture.score && <b>{fixture.score.away}</b>}
                      </div>
                    </div>

                    <div className="fixture-prices" aria-label="Current pool shares">
                      {(["home", "draw", "away"] as const).map((outcome) => (
                        <span key={outcome}>
                          <small>{outcome === "draw" ? "Draw" : outcome === "home" ? "Home" : "Away"}</small>
                          <strong>{hasResultLiquidity ? `${Math.round((shares[outcome] || 0) * 100)}%` : "—"}</strong>
                        </span>
                      ))}
                    </div>

                    <div className="fixture-pool">
                      <small>Total pool</small>
                      <strong>{hasLiquidity ? number.format(pool) : "First pick"}</strong>
                      <span>{hasLiquidity ? stakeLabel : "opens evenly"}</span>
                    </div>
                    <span className="fixture-arrow" aria-hidden>→</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {!loading && !error && shown.length === 0 && (
          <div className="empty-state">
            <strong>
              {filter === "live"
                ? "No match is live right now"
                : filter === "next"
                  ? "The next fixtures are being confirmed"
                  : "No results yet"}
            </strong>
            <p>
              {filter === "live"
                ? "Switch to Next to line up your next prediction."
                : "The board will update as soon as the match feed publishes them."}
            </p>
            {filter === "live" && (
              <button type="button" className="btn btn-secondary" onClick={() => setFilter("next")}>
                Show next matches
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
