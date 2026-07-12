import type { Fixture } from "@whistle/shared";
import { getState } from "./store";

export type StandingRow = {
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

export type GroupTable = {
  group: string;
  standings: StandingRow[];
  fixtures: Fixture[];
};

function emptyRow(team: string, shortName?: string): StandingRow {
  return {
    team,
    shortName,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    pts: 0,
  };
}

function applyResult(row: StandingRow, gf: number, ga: number) {
  row.played += 1;
  row.gf += gf;
  row.ga += ga;
  row.gd = row.gf - row.ga;
  if (gf > ga) {
    row.won += 1;
    row.pts += 3;
  } else if (gf === ga) {
    row.drawn += 1;
    row.pts += 1;
  } else {
    row.lost += 1;
  }
}

function sortStandings(a: StandingRow, b: StandingRow) {
  if (b.pts !== a.pts) return b.pts - a.pts;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return a.team.localeCompare(b.team);
}

/** Build group-stage tables from live fixture metadata + finished scores. */
export function buildGroupTables(): GroupTable[] {
  const fixtures = Object.values(getState().fixtures).filter((f) => f.group);
  const byGroup = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const g = String(f.group);
    const list = byGroup.get(g) || [];
    list.push(f);
    byGroup.set(g, list);
  }

  const tables: GroupTable[] = [];
  for (const [group, groupFixtures] of [...byGroup.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const rows = new Map<string, StandingRow>();
    for (const f of groupFixtures) {
      if (!rows.has(f.home.name)) rows.set(f.home.name, emptyRow(f.home.name, f.home.shortName));
      if (!rows.has(f.away.name)) rows.set(f.away.name, emptyRow(f.away.name, f.away.shortName));
      if (f.status === "finished" && f.score) {
        applyResult(rows.get(f.home.name)!, f.score.home, f.score.away);
        applyResult(rows.get(f.away.name)!, f.score.away, f.score.home);
      }
    }
    tables.push({
      group,
      standings: [...rows.values()].sort(sortStandings),
      fixtures: groupFixtures.sort((a, b) => a.kickoffTs - b.kickoffTs),
    });
  }
  return tables;
}

export function listRounds(): Array<{ round: string; fixtures: Fixture[] }> {
  const map = new Map<string, Fixture[]>();
  for (const f of Object.values(getState().fixtures)) {
    const round = f.round || f.group || "Tournament";
    const list = map.get(round) || [];
    list.push(f);
    map.set(round, list);
  }
  return [...map.entries()]
    .map(([round, fixtures]) => ({
      round,
      fixtures: fixtures.sort((a, b) => a.kickoffTs - b.kickoffTs),
    }))
    .sort((a, b) => a.round.localeCompare(b.round));
}
