import type { ReactNode } from "react";
import { createPageMetadata } from "../../lib/metadata";

export const metadata = createPageMetadata({
  title: "My picks",
  description: "Review your active Whistle picks, settled returns, and refunds.",
  path: "/positions",
  index: false,
});

export default function PositionsLayout({ children }: { children: ReactNode }) {
  return children;
}
