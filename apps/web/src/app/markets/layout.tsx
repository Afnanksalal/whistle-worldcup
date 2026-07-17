import type { ReactNode } from "react";
import { createPageMetadata } from "../../lib/metadata";

export const metadata = createPageMetadata({
  title: "Prediction markets board",
  description:
    "Global Whistle market board — volumes, implied probabilities, and reference odds across World Cup pools.",
  path: "/markets",
});

export default function MarketsLayout({ children }: { children: ReactNode }) {
  return children;
}
