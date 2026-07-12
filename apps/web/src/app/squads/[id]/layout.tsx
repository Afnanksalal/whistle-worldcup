import type { ReactNode } from "react";
import { createPageMetadata } from "../../../lib/metadata";

export const metadata = createPageMetadata({
  title: "Private squad",
  description: "A private Whistle squad leaderboard and its match pools.",
  path: "/squads",
  index: false,
});

export default function PrivateSquadLayout({ children }: { children: ReactNode }) {
  return children;
}
