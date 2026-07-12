import type { ReactNode } from "react";
import { createPageMetadata } from "../../lib/metadata";

export const metadata = createPageMetadata({
  title: "World Cup 2026 news and matchday briefing",
  description:
    "Read attributed World Cup 2026 headlines and matchday context from established football news sources.",
  path: "/news",
});

export default function NewsLayout({ children }: { children: ReactNode }) {
  return children;
}
