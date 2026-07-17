export type NavIcon =
  | "matches"
  | "markets"
  | "tournament"
  | "news"
  | "picks"
  | "squads";

export type NavLink = {
  href: string;
  label: string;
  /** Compact label for the mobile tab bar. */
  short: string;
  icon: NavIcon;
};

/** Single source of truth for primary product navigation. */
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/", label: "Matches", short: "Matches", icon: "matches" },
  { href: "/markets", label: "Markets", short: "Markets", icon: "markets" },
  { href: "/groups", label: "Tournament", short: "Groups", icon: "tournament" },
  { href: "/news", label: "News", short: "News", icon: "news" },
  { href: "/positions", label: "My picks", short: "Picks", icon: "picks" },
  { href: "/squads", label: "Squads", short: "Squads", icon: "squads" },
] as const;
