import type { ReactNode } from "react";
import { createPageMetadata } from "../../lib/metadata";

export const metadata = createPageMetadata({
  title: "Private World Cup prediction leagues",
  description:
    "Create a private Whistle squad, invite friends, and follow a shared World Cup prediction leaderboard.",
  path: "/squads",
});

export default function SquadsLayout({ children }: { children: ReactNode }) {
  return children;
}
