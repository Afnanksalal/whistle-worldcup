"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fixture, MarketPool, Squad } from "@whistle/shared";
import { api, formatKickoff, shortAddr } from "../../../lib/api";
import { useIdentity } from "../../../lib/identity";
import { useRuntime } from "../../../lib/runtime";
import { BrandMark } from "../../../components/BrandMark";
import { FootballLoader } from "../../../components/FootballLoader";

type Leader = { owner: string; staked: number; won: number; pnl: number };
type Notice = { tone: "success" | "error"; text: string };

export default function SquadDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { owner, ready, withWalletAuth } = useIdentity();
  const { stakeLabel } = useRuntime();
  const [squad, setSquad] = useState<Squad | null>(null);
  const [markets, setMarkets] = useState<MarketPool[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [allFixtures, setAllFixtures] = useState<Fixture[]>([]);
  const [leaderboard, setLeaderboard] = useState<Leader[]>([]);
  const [fixtureId, setFixtureId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await api<{
      squad: Squad;
      markets: MarketPool[];
      fixtures: Fixture[];
      leaderboard: Leader[];
    }>(`/squads/${id}`, { signal });
    setSquad(response.squad);
    setMarkets(response.markets);
    setFixtures(response.fixtures || []);
    setLeaderboard(response.leaderboard);
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => {
      if (!controller.signal.aborted) {
        setNotice({
          tone: "error",
          text: cause instanceof Error ? cause.message : "This squad could not be loaded.",
        });
      }
    });
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void api<{ fixtures: Fixture[] }>("/fixtures", { signal: controller.signal })
      .then((response) => {
        const open = response.fixtures.filter(
          (fixture) => fixture.status === "scheduled" || fixture.status === "live"
        );
        setAllFixtures(open);
        setFixtureId((current) => current || open[0]?.id || "");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const createMarket = async () => {
    if (!fixtureId || !owner) return;
    setNotice(null);
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
      setNotice({ tone: "success", text: "The 1X2 pool is open for your squad." });
      await load();
    } catch (cause) {
      setNotice({
        tone: "error",
        text: cause instanceof Error ? cause.message : "This pool could not be opened.",
      });
    }
  };

  const fixtureLabel = (fixtureIdToFind: string) => {
    const fixture =
      allFixtures.find((item) => item.id === fixtureIdToFind) ||
      fixtures.find((item) => item.id === fixtureIdToFind);
    if (!fixture) return fixtureIdToFind;
    return `${fixture.home.name} vs ${fixture.away.name}`;
  };

  const totalPool = useMemo(
    () => markets.reduce((total, market) => total + market.totalPool, 0),
    [markets]
  );

  if (!squad) {
    return (
      <main id="main-content" className="squads-page">
        <div className="shell squad-detail-loading" role={notice?.tone === "error" ? "alert" : undefined}>
          {notice?.tone === "error" ? (
            <>
              <BrandMark className="empty-brand-mark" accessibleLabel={null} />
              <p>{notice.text}</p>
            </>
          ) : (
            <FootballLoader label="Opening the squad room…" />
          )}
          {notice?.tone === "error" && <Link href="/squads" className="text-link">Back to squads <span>→</span></Link>}
        </div>
      </main>
    );
  }

  const isMember = owner ? squad.members.includes(owner) : false;

  return (
    <main id="main-content" className="squads-page squad-detail-page">
      <div className="shell squads-shell">
        <Link href="/squads" className="squad-back-link"><span aria-hidden>←</span> All squads</Link>

        <header className="squad-detail-header">
          <div>
            <p className="section-kicker">Private matchday room</p>
            <h1>{squad.name}</h1>
            <div className="squad-member-line">
              <span className={`squad-member-state${isMember ? " is-member" : ""}`}>
                {isMember ? "Squad member" : "Viewing room"}
              </span>
              {owner ? <span>Signed in as <strong className="mono">{shortAddr(owner)}</strong></span> : <span>Connect to take part</span>}
            </div>
          </div>
          <aside className="squad-invite-card" aria-label={`Invite code ${squad.inviteCode}`}>
            <span>Invite code</span>
            <strong className="mono">{squad.inviteCode}</strong>
            <small>Share privately with your group</small>
          </aside>
        </header>

        <section className="squad-pulse" aria-label="Squad summary">
          <div><span>Members</span><strong>{squad.members.length}</strong></div>
          <div><span>Match pools</span><strong>{markets.length}</strong></div>
          <div><span>Total in pools</span><strong>{totalPool.toLocaleString()} <small>{stakeLabel}</small></strong></div>
        </section>

        {notice && (
          <div
            className={`squads-notice is-${notice.tone}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </div>
        )}

        <section className="squad-market-maker" aria-labelledby="squad-market-maker-title">
          <div>
            <p className="section-kicker">Choose the next match</p>
            <h2 id="squad-market-maker-title">Open a squad pool</h2>
            <p>Start one winner-takes-share 1X2 pool for the whole room.</p>
          </div>
          <div className="squad-market-control">
            <label htmlFor="squad-fixture">Fixture</label>
            <select
              id="squad-fixture"
              className="field"
              value={fixtureId}
              onChange={(event) => setFixtureId(event.target.value)}
            >
              {!allFixtures.length && <option value="">No open fixtures</option>}
              {allFixtures.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.home.name} vs {fixture.away.name} · {formatKickoff(fixture.kickoffTs)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!ready || !isMember || !fixtureId}
              onClick={() => void createMarket()}
            >
              Open 1X2 pool
            </button>
          </div>
          {ready && !isMember && <small className="squad-market-help">Join this squad before opening a pool.</small>}
        </section>

        <div className="squad-detail-grid">
          <section className="squad-leaderboard" aria-labelledby="squad-leaderboard-title">
            <div className="squads-section-heading">
              <div>
                <p className="section-kicker">Form table</p>
                <h2 id="squad-leaderboard-title">Leaderboard</h2>
              </div>
              <span>{leaderboard.length} ranked</span>
            </div>

            {leaderboard.length ? (
              <div className="squad-leader-list">
                <div className="squad-leader-labels" aria-hidden>
                  <span>Rank / player</span><span>Staked</span><span>Won</span><span>P/L</span>
                </div>
                {leaderboard.map((row, index) => (
                  <div className="squad-leader-row" key={row.owner}>
                    <span className="squad-rank">{String(index + 1).padStart(2, "0")}</span>
                    <strong className="mono">{shortAddr(row.owner)}</strong>
                    <span><small>Staked</small>{row.staked.toFixed(0)}</span>
                    <span><small>Won</small>{row.won.toFixed(0)}</span>
                    <span className={row.pnl >= 0 ? "is-positive" : "is-negative"}>
                      <small>P/L</small>{row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No picks on the board</strong>
                <p>Open a match pool to start the squad table.</p>
              </div>
            )}
          </section>

          <section className="squad-markets" aria-labelledby="squad-markets-title">
            <div className="squads-section-heading">
              <div>
                <p className="section-kicker">Room pools</p>
                <h2 id="squad-markets-title">Squad markets</h2>
              </div>
              <span>{markets.length} total</span>
            </div>

            {markets.length ? (
              <div className="squad-market-list">
                {markets.map((market) => (
                  <Link
                    key={market.id}
                    href={`/match/${market.fixtureId}?squad=${id}`}
                    className="squad-market-row"
                  >
                    <span className={`squad-market-status is-${market.status}`}>{market.status}</span>
                    <span className="squad-market-name">
                      <strong>{fixtureLabel(market.fixtureId)}</strong>
                      <small>{market.marketType === "match_result" ? "Match result · 1X2" : `Goals · O/U ${market.line}`}</small>
                    </span>
                    <span className="squad-market-pool">
                      <small>Pool</small>
                      <strong>{market.totalPool.toLocaleString()} {stakeLabel}</strong>
                    </span>
                    <span className="squad-list-arrow" aria-hidden>→</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No squad pools yet</strong>
                <p>Choose an upcoming fixture above to open the room’s first market.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
