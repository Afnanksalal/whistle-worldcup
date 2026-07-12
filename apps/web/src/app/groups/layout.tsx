import type { ReactNode } from "react";
import { createPageMetadata } from "../../lib/metadata";

export const metadata = createPageMetadata({
  title: "World Cup 2026 groups, fixtures and standings",
  description:
    "Follow the World Cup 2026 tournament road with fixtures, final scores, group context, and the next kickoff.",
  path: "/groups",
});

export default function TournamentLayout({ children }: { children: ReactNode }) {
  return children;
}
