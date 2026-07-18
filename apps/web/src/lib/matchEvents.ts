import type { MatchEvent } from "@whistle/shared";

/** TxLINE emits a noisy possession/clock tape; keep fan-facing highlights. */
const TAPE_NOISE = new Set([
  "standby",
  "kickoff",
  "kickoff_team",
  "attack_possession",
  "safe_possession",
  "danger_possession",
  "high_danger_possession",
  "possession",
  "possible",
  "action_discarded",
  "action_amend",
  "throw_in",
  "goal_kick",
  "additional_time",
  "status",
  "clock_adjustment",
  "halftime_finalised",
  "halftime_finalized",
  "comment",
  "heartbeat",
  "game_started",
  "connected",
  "coverage_update",
  "jersey",
  "pitch",
  "venue",
  "weather",
  "lineups",
  "players_on_the_pitch",
  "players_warming_up",
]);

export function isHighlightMatchEvent(event: MatchEvent): boolean {
  if (event.player) return true;
  const type = (event.type || "").toLowerCase();
  if (TAPE_NOISE.has(type)) return false;
  return Boolean(type);
}

export function filterMatchEventTape(events: MatchEvent[]): MatchEvent[] {
  const filtered = events.filter(isHighlightMatchEvent);
  // If the feed only has noise (pre-kickoff), keep the raw list so the UI is not empty.
  return filtered.length ? filtered : events;
}

export function preferRicherEventTape(
  primary: MatchEvent[] | undefined,
  fallback: MatchEvent[] | undefined
): MatchEvent[] {
  const a = primary || [];
  const b = fallback || [];
  if (!a.length) return b;
  if (!b.length) return a;
  const richness = (events: MatchEvent[]) =>
    events.reduce(
      (score, event) =>
        score +
        (event.player ? 10 : 0) +
        (event.teamName || event.team ? 1 : 0) +
        (event.assist ? 2 : 0),
      0
    );
  return richness(a) >= richness(b) ? a : b;
}

export function eventTeamLabel(
  event: MatchEvent,
  homeName: string,
  awayName: string
): string | undefined {
  if (event.teamName) return event.teamName;
  if (event.team === "home") return homeName;
  if (event.team === "away") return awayName;
  return undefined;
}

export function formatMatchEventMeta(
  event: MatchEvent,
  homeName: string,
  awayName: string
): string {
  const parts = [
    eventTeamLabel(event, homeName, awayName),
    event.player,
    event.assist && !event.detail?.includes(event.assist)
      ? `assist ${event.assist}`
      : undefined,
    event.detail &&
    event.detail.toLowerCase() !== event.type.toLowerCase() &&
    event.detail.toLowerCase() !== event.player?.toLowerCase()
      ? event.detail
      : undefined,
  ].filter(Boolean);
  return parts.join(" · ");
}
