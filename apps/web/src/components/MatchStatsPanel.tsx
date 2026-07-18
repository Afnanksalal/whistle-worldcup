"use client";

import type { MatchEvent, MatchStats } from "@whistle/shared";
import { formatClock, useLocalTimeContext } from "../lib/local-time";
import {
  filterMatchEventTape,
  formatMatchEventMeta,
  preferRicherEventTape,
} from "../lib/matchEvents";

function Bar({
  label,
  home,
  away,
  homeName,
  awayName,
}: {
  label: string;
  home: number;
  away: number;
  homeName: string;
  awayName: string;
}) {
  const total = home + away || 1;
  const hp = (home / total) * 100;
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.78rem",
          marginBottom: "0.3rem",
          color: "var(--mute)",
        }}
      >
        <span className="mono" style={{ color: "var(--cyan)" }}>
          {home}
        </span>
        <span>{label}</span>
        <span className="mono" style={{ color: "var(--signal)" }}>
          {away}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          height: 8,
          borderRadius: 999,
          overflow: "hidden",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ width: `${hp}%`, background: "var(--cyan)" }} />
        <div style={{ flex: 1, background: "var(--signal)", opacity: 0.85 }} />
      </div>
      <div
        className="mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.65rem",
          color: "var(--mute)",
          marginTop: "0.25rem",
        }}
      >
        <span>{homeName}</span>
        <span>{awayName}</span>
      </div>
    </div>
  );
}

export function MatchStatsPanel({
  stats,
  homeName,
  awayName,
  liveEvents,
}: {
  stats: MatchStats | null;
  homeName: string;
  awayName: string;
  liveEvents?: MatchEvent[];
}) {
  const localTime = useLocalTimeContext();
  const events = filterMatchEventTape(
    preferRicherEventTape(stats?.events, liveEvents)
  );

  if (!stats && !events.length) {
    return (
      <div className="panel" style={{ padding: "1.25rem", color: "var(--mute)" }}>
        Syncing live match statistics…
      </div>
    );
  }

  const rows: Array<[string, number, number]> = [];
  if (stats?.possession) rows.push(["Possession %", stats.possession.home, stats.possession.away]);
  if (stats?.shots) rows.push(["Shots", stats.shots.home, stats.shots.away]);
  if (stats?.shotsOnTarget)
    rows.push(["On target", stats.shotsOnTarget.home, stats.shotsOnTarget.away]);
  if (stats?.corners) rows.push(["Corners", stats.corners.home, stats.corners.away]);
  if (stats?.fouls) rows.push(["Fouls", stats.fouls.home, stats.fouls.away]);
  if (stats?.yellowCards)
    rows.push(["Yellow cards", stats.yellowCards.home, stats.yellowCards.away]);
  if (stats?.redCards) rows.push(["Red cards", stats.redCards.home, stats.redCards.away]);
  if (stats?.offsides) rows.push(["Offsides", stats.offsides.home, stats.offsides.away]);

  return (
    <div className="panel" style={{ padding: "1.2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h2 className="display" style={{ fontSize: "1.1rem", margin: 0 }}>
          Match statistics
        </h2>
        <span className="mono" style={{ color: "var(--mute)", fontSize: "0.68rem" }}>
          {(stats?.source || "feed").toUpperCase()}
          {stats ? ` · ${formatClock(stats.updatedAt, localTime)}` : ""}
        </span>
      </div>
      {!rows.length && (
        <p style={{ color: "var(--mute)", margin: "0 0 0.85rem", fontSize: "0.88rem" }}>
          Provider has not published box-score rows for this fixture yet. Event tape below updates
          live.
        </p>
      )}
      {rows.map(([label, h, a]) => (
        <Bar key={label} label={label} home={h} away={a} homeName={homeName} awayName={awayName} />
      ))}

      <h3 className="display" style={{ fontSize: "0.95rem", margin: "1.2rem 0 0.6rem" }}>
        Event tape
      </h3>
      <div style={{ display: "grid", gap: "0.35rem", maxHeight: 220, overflowY: "auto" }}>
        {events.length === 0 && (
          <p style={{ color: "var(--mute)", margin: 0, fontSize: "0.88rem" }}>
            No timed events yet for this fixture.
          </p>
        )}
        {events.map((e, i) => {
          const meta = formatMatchEventMeta(e, homeName, awayName);
          return (
            <div
              key={`${e.minute}-${e.type}-${e.player}-${i}`}
              className="mono"
              style={{
                fontSize: "0.75rem",
                padding: "0.45rem 0.55rem",
                borderBottom: "1px solid var(--line)",
                color: "var(--mute)",
              }}
            >
              <span style={{ color: "var(--cyan)" }}>{e.minute ?? "—"}&apos;</span>{" "}
              <span style={{ color: "var(--ink)" }}>{e.type.replace(/_/g, " ")}</span>
              {meta ? ` · ${meta}` : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}
