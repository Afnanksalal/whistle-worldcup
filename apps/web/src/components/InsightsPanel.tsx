"use client";

import type { InsightCard } from "@whistle/shared";

export function InsightsPanel({ insights }: { insights: InsightCard[] }) {
  return (
    <div className="panel" style={{ padding: "1.2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.85rem" }}>
        <h2 className="display" style={{ fontSize: "1.1rem", margin: 0 }}>
          AI insights
        </h2>
        <span className="mono" style={{ color: "var(--mute)", fontSize: "0.68rem" }}>
          ENGINE{insights.some((i) => i.source === "llm") ? " + LLM" : ""}
        </span>
      </div>
      {!insights.length && (
        <p style={{ color: "var(--mute)", margin: 0 }}>
          Building desk notes from pool, stats, table, and wire…
        </p>
      )}
      <div style={{ display: "grid", gap: "0.65rem" }}>
        {insights.map((card) => (
          <article
            key={card.id}
            style={{
              padding: "0.85rem 0.95rem",
              borderRadius: "0.65rem",
              border: "1px solid var(--line)",
              background:
                card.severity === "alert"
                  ? "rgba(251,113,133,0.08)"
                  : card.severity === "signal"
                    ? "rgba(45,212,191,0.07)"
                    : "transparent",
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.08em",
                color:
                  card.severity === "alert"
                    ? "var(--signal)"
                    : card.severity === "signal"
                      ? "var(--cyan)"
                      : "var(--mute)",
                marginBottom: "0.35rem",
              }}
            >
              {card.severity.toUpperCase()}
              {card.tags.length ? ` · ${card.tags.join(" · ")}` : ""}
            </div>
            <h3 className="display" style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>
              {card.title}
            </h3>
            <p style={{ margin: 0, color: "var(--mute)", fontSize: "0.9rem", lineHeight: 1.45 }}>
              {card.body}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
