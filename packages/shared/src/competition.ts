import type { Fixture } from "./index";

/** World Cup / cup competition phase for market product rules. */
export type CompetitionPhase = "group" | "knockout" | "unknown";

const KNOCKOUT_PATTERNS = [
  /\bround of 32\b/i,
  /\blast 32\b/i,
  /\br32\b/i,
  /\bround of 16\b/i,
  /\blast 16\b/i,
  /\br16\b/i,
  /\b1\/8\b/i,
  /\beighth/i,
  /\bquarter[- ]?final/i,
  /\bqf\b/i,
  /\bsemi[- ]?final/i,
  /\bsf\b/i,
  /\bthird[- ]?place\b/i,
  /\b3rd place\b/i,
  /\bfinal\b/i,
  /\bknock[- ]?out\b/i,
];

const GROUP_PATTERNS = [
  /\bgroup\b/i,
  /\bmatchday\b/i,
  /\bmd\s*\d\b/i,
];

/**
 * Map a TxLINE FixtureGroupId cohort size to a round label.
 * 2026 WC board sizes: ~72 group, 16 R32, 8 R16, 4 QF, 2 SF, 1 final/3rd.
 */
export function roundLabelFromFixtureGroupSize(size: number): {
  phase: CompetitionPhase;
  round: string;
  group?: string;
} {
  if (size >= 20) {
    return { phase: "group", round: "Group stage", group: "group" };
  }
  if (size >= 12) {
    return { phase: "knockout", round: "Round of 32" };
  }
  if (size >= 6) {
    return { phase: "knockout", round: "Round of 16" };
  }
  if (size >= 3) {
    return { phase: "knockout", round: "Quarter-finals" };
  }
  if (size === 2) {
    return { phase: "knockout", round: "Semi-finals" };
  }
  if (size === 1) {
    return { phase: "knockout", round: "Final" };
  }
  return { phase: "unknown", round: "" };
}

/**
 * FIFA knockout ties cannot end in a draw — extra time and penalties produce a winner.
 * Group-stage fixtures keep classic 1X2 (home / draw / away).
 */
export function competitionPhase(
  fixture: Pick<Fixture, "round" | "group" | "competition" | "fixtureGroupId">
): CompetitionPhase {
  const round = (fixture.round || "").trim();
  const group = (fixture.group || "").trim();
  const competition = (fixture.competition || "").toLowerCase();

  if (group && !KNOCKOUT_PATTERNS.some((pattern) => pattern.test(round))) {
    return "group";
  }

  if (round && KNOCKOUT_PATTERNS.some((pattern) => pattern.test(round))) {
    return "knockout";
  }

  if (round && GROUP_PATTERNS.some((pattern) => pattern.test(round))) {
    return "group";
  }

  // Prefer explicit labels. Without them, only treat unlabeled World Cup rows as
  // knockout when we also lack a FixtureGroupId (legacy / finals board rows).
  if (!group && !round && !fixture.fixtureGroupId && competition.includes("world cup")) {
    return "knockout";
  }

  if (!group && !round && !fixture.fixtureGroupId && competition.includes("cup")) {
    return "knockout";
  }

  return "unknown";
}

/** True when match-result markets must be two-way (home/away only). */
export function isKnockoutMatchResult(
  fixture: Pick<Fixture, "round" | "group" | "competition" | "fixtureGroupId">
): boolean {
  return competitionPhase(fixture) === "knockout";
}

/**
 * Fill missing round/group from TxLINE FixtureGroupId cohort sizes so product
 * rules (draw vs to-advance) work even when the feed omits stage labels.
 */
export function enrichCompetitionPhases(fixtures: Fixture[]): Fixture[] {
  const cohortSize = new Map<string, number>();
  for (const fixture of fixtures) {
    const groupId = fixture.fixtureGroupId?.trim();
    if (!groupId) continue;
    const key = `${(fixture.competition || "").toLowerCase()}::${groupId}`;
    cohortSize.set(key, (cohortSize.get(key) || 0) + 1);
  }

  return fixtures.map((fixture) => {
    if (fixture.round || fixture.group) return fixture;
    const groupId = fixture.fixtureGroupId?.trim();
    if (!groupId) return fixture;
    const key = `${(fixture.competition || "").toLowerCase()}::${groupId}`;
    const size = cohortSize.get(key) || 0;
    const labeled = roundLabelFromFixtureGroupSize(size);
    if (!labeled.round) return fixture;
    return {
      ...fixture,
      round: labeled.round,
      ...(labeled.group ? { group: labeled.group } : {}),
    };
  });
}
