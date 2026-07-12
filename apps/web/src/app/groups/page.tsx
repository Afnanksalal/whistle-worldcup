"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Fixture } from "@whistle/shared";
import { api, formatKickoff, statusLabel } from "../../lib/api";
import { TeamCrest } from "../../components/TeamCrest";

type StandingRow = {
  team: string;
  shortName?: string;
  logo?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

type GroupTable = { group: string; standings: StandingRow[]; fixtures: Fixture[] };
type TournamentFilter = "all" | "upcoming" | "results";

function teamKey(value?: string) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

export default function TournamentPage() {
  const [groups, setGroups] = useState<GroupTable[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [filter, setFilter] = useState<TournamentFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ groups: GroupTable[] }>("/groups", { signal: controller.signal }),
      api<{ fixtures: Fixture[] }>("/fixtures", { signal: controller.signal }),
    ])
      .then(([groupResponse, fixtureResponse]) => {
        setGroups(groupResponse.groups);
        setFixtures(fixtureResponse.fixtures);
        setActiveGroup(groupResponse.groups[0]?.group ?? null);
        setError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const ordered = useMemo(
    () => [...fixtures].sort((a, b) => a.kickoffTs - b.kickoffTs),
    [fixtures]
  );
  const upcoming = ordered.filter((fixture) => fixture.status === "scheduled" || fixture.status === "live");
  const results = ordered.filter((fixture) => fixture.status === "finished").reverse();
  const shown = filter === "upcoming" ? upcoming : filter === "results" ? results : [...upcoming, ...results].slice(0, 20);
  const currentGroup = groups.find((group) => group.group === activeGroup) || groups[0];
  const teamsByKey = useMemo(() => {
    const teams = new Map<string, Fixture["home"]>();
    const knownFixtures = [...fixtures, ...(currentGroup?.fixtures || [])];
    for (const fixture of knownFixtures) {
      for (const team of [fixture.home, fixture.away]) {
        const names = [team.name, team.shortName];
        for (const name of names) {
          const key = teamKey(name);
          if (key && !teams.has(key)) teams.set(key, team);
        }
      }
    }
    return teams;
  }, [currentGroup?.fixtures, fixtures]);

  const standingTeam = (row: StandingRow): Fixture["home"] =>
    teamsByKey.get(teamKey(row.team)) ||
    teamsByKey.get(teamKey(row.shortName)) || {
      name: row.team,
      shortName: row.shortName,
      logo: row.logo,
    };

  return (
    <main id="main-content" className="tournament-page">
      <div className="shell tournament-shell">
        <header className="tournament-header">
          <div>
            <p className="section-kicker">World Cup 2026</p>
            <h1>The tournament</h1>
            <p>Fixtures, group context, and the road to the final—updated from the match feed.</p>
          </div>
          <div className="tournament-mark" aria-hidden><span>26</span><small>WC</small></div>
        </header>

        <section className="tournament-pulse" aria-label="Tournament summary">
          <div><span>Matches tracked</span><strong>{fixtures.length}</strong></div>
          <div><span>Still to play</span><strong>{upcoming.length}</strong></div>
          <div><span>Final whistles</span><strong>{results.length}</strong></div>
          <div><span>Live now</span><strong>{fixtures.filter((fixture) => fixture.status === "live").length}</strong></div>
        </section>

        {error && (
          <div className="empty-state is-error" role="alert">
            <strong>Tournament feed unavailable</strong>
            <p>The match road will return when the schedule reconnects.</p>
          </div>
        )}

        {loading && <div className="tournament-loading">Building the tournament road…</div>}

        {!loading && !error && groups.length > 0 && currentGroup && (
          <section className="group-stage" aria-labelledby="group-stage-title">
            <div className="tournament-section-heading">
              <div>
                <p className="section-kicker">Group stage</p>
                <h2 id="group-stage-title">Standings</h2>
              </div>
              <div className="group-tabs" aria-label="Select a group">
                {groups.map((group) => (
                  <button
                    type="button"
                    key={group.group}
                    className={currentGroup.group === group.group ? "active" : ""}
                    aria-pressed={currentGroup.group === group.group}
                    onClick={() => setActiveGroup(group.group)}
                  >
                    {group.group}
                  </button>
                ))}
              </div>
            </div>
            <div className="standings-wrap">
              <table className="standings-table">
                <thead>
                  <tr><th>Pos</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>
                </thead>
                <tbody>
                  {currentGroup.standings.map((row, index) => (
                    <tr key={row.team}>
                      <td>{index + 1}</td>
                      <td><TeamCrest team={standingTeam(row)} variant="small" /><strong>{row.team}</strong></td>
                      <td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td>
                      <td>{row.gd > 0 ? `+${row.gd}` : row.gd}</td><td><strong>{row.pts}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!loading && !error && (
          <section className="tournament-road" aria-labelledby="tournament-road-title">
            <div className="tournament-section-heading">
              <div>
                <p className="section-kicker">Match road</p>
                <h2 id="tournament-road-title">Every final whistle</h2>
              </div>
              <div className="segmented-control" aria-label="Filter tournament fixtures">
                {(
                  [["all", "All", fixtures.length], ["upcoming", "Next", upcoming.length], ["results", "Results", results.length]] as const
                ).map(([value, label, count]) => (
                  <button
                    type="button"
                    key={value}
                    className={filter === value ? "active" : ""}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label} <span>{count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="tournament-fixtures">
              {shown.map((fixture, index) => (
                <Link className="tournament-fixture" href={`/match/${fixture.id}`} key={fixture.id}>
                  <div className="tournament-fixture-index">{String(index + 1).padStart(2, "0")}</div>
                  <div className="tournament-fixture-meta">
                    <span className={`status-badge${fixture.status === "live" ? " is-live" : fixture.status === "finished" ? " is-finished" : ""}`}>
                      {statusLabel(fixture.status)}
                    </span>
                    <time dateTime={new Date(fixture.kickoffTs).toISOString()}>{formatKickoff(fixture.kickoffTs)}</time>
                  </div>
                  <div className="tournament-fixture-teams">
                    <div><TeamCrest team={fixture.home} variant="small" /><strong>{fixture.home.name}</strong>{fixture.score && <b>{fixture.score.home}</b>}</div>
                    <div><TeamCrest team={fixture.away} variant="small" /><strong>{fixture.away.name}</strong>{fixture.score && <b>{fixture.score.away}</b>}</div>
                  </div>
                  <span className="tournament-fixture-arrow" aria-hidden>→</span>
                </Link>
              ))}
            </div>

            {!shown.length && (
              <div className="empty-state">
                <strong>No matches in this view</strong>
                <p>The tournament feed will add the next fixture here.</p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
