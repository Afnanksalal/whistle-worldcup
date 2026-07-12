"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Fixture } from "@whistle/shared";
import { api, formatKickoff, statusLabel } from "../../lib/api";

type StandingRow = {
  team: string;
  shortName?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

type GroupTable = {
  group: string;
  standings: StandingRow[];
  fixtures: Fixture[];
};

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupTable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    api<{ groups: GroupTable[] }>("/groups")
      .then((r) => {
        setGroups(r.groups);
        setActive(r.groups[0]?.group ?? null);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const current = groups.find((g) => g.group === active) || groups[0];

  return (
    <main className="shell" style={{ padding: "2rem 0 4rem" }}>
      <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>
        Tournament
      </p>
      <h1 className="display rise" style={{ fontSize: "2.1rem", marginBottom: "0.35rem" }}>
        Group stage
      </h1>
      <p style={{ color: "var(--mute)", maxWidth: 520, marginTop: 0 }}>
        Standings derived from finished fixtures in the live schedule. Tables update as matches settle.
      </p>

      {error && (
        <div className="panel" style={{ padding: "1rem", color: "var(--signal)" }}>
          {error}
        </div>
      )}

      {!groups.length && !error && (
        <div className="panel" style={{ padding: "1.5rem", color: "var(--mute)" }}>
          No group metadata on fixtures yet — waiting for TxLINE schedule fields.
        </div>
      )}

      {groups.length > 0 && (
        <>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", margin: "1.25rem 0" }}>
            {groups.map((g) => (
              <button
                key={g.group}
                className={active === g.group ? "btn btn-primary" : "btn btn-ghost"}
                style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
                onClick={() => setActive(g.group)}
              >
                Group {g.group}
              </button>
            ))}
          </div>

          {current && (
            <div style={{ display: "grid", gap: "1.25rem" }}>
              <div className="panel" style={{ padding: "1rem", overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Team</th>
                      <th>P</th>
                      <th>W</th>
                      <th>D</th>
                      <th>L</th>
                      <th>GF</th>
                      <th>GA</th>
                      <th>GD</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.standings.map((row, i) => (
                      <tr key={row.team}>
                        <td className="mono">{i + 1}</td>
                        <td>{row.shortName || row.team}</td>
                        <td className="mono">{row.played}</td>
                        <td className="mono">{row.won}</td>
                        <td className="mono">{row.drawn}</td>
                        <td className="mono">{row.lost}</td>
                        <td className="mono">{row.gf}</td>
                        <td className="mono">{row.ga}</td>
                        <td className="mono">{row.gd}</td>
                        <td className="mono" style={{ color: "var(--cyan)", fontWeight: 700 }}>
                          {row.pts}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h2 className="display" style={{ fontSize: "1.2rem" }}>
                  Fixtures · Group {current.group}
                </h2>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {current.fixtures.map((f) => (
                    <Link
                      key={f.id}
                      href={`/match/${f.id}`}
                      className="panel ticket"
                      style={{ padding: "0.9rem 1.1rem" }}
                    >
                      <div>
                        <div className="mono" style={{ color: "var(--mute)", fontSize: "0.7rem" }}>
                          {statusLabel(f.status)} · {formatKickoff(f.kickoffTs)}
                          {f.score ? ` · ${f.score.home}-${f.score.away}` : ""}
                        </div>
                        <div className="display" style={{ fontSize: "1.05rem" }}>
                          {f.home.name} vs {f.away.name}
                        </div>
                      </div>
                      <span className="mono" style={{ color: "var(--cyan)", fontSize: "0.75rem" }}>
                        MARKET →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
