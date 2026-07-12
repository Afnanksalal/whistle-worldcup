import type { ReactNode } from "react";
import { createPageMetadata } from "../../lib/metadata";

export const metadata = createPageMetadata({
  title: "Operations console",
  description: "Restricted Whistle operations console.",
  path: "/admin",
  index: false,
});

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
