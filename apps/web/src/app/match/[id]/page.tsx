"use client";

import { Suspense } from "react";
import MatchPageInner from "./MatchInner";

export default function MatchPage() {
  return (
    <Suspense
      fallback={
        <main className="shell" style={{ padding: "3rem 0", color: "var(--mute)" }}>
          Syncing market…
        </main>
      }
    >
      <MatchPageInner />
    </Suspense>
  );
}
