"use client";

import type { InsightCard } from "@whistle/shared";

function relativeTime(ts: number | undefined, now: number | null) {
  if (!ts || now === null) return null;
  const minutes = Math.max(0, Math.round((now - ts) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function InsightsPanel({
  insights,
  now,
}: {
  insights: InsightCard[];
  now: number | null;
}) {
  const hasNarrative = insights.some((insight) => insight.source === "llm");

  return (
    <section className="panel intelligence-panel" aria-labelledby="intelligence-title">
      <header className="intelligence-header">
        <div>
          <p className="section-kicker">What is changing</p>
          <h2 id="intelligence-title">Match intelligence</h2>
        </div>
        <span>{hasNarrative ? "Grounded AI + data" : "Data-backed"}</span>
      </header>

      {!insights.length && (
        <div className="intelligence-empty">
          <strong>Waiting for a real signal</strong>
          <p>Pool movement, verified match events, and relevant team news will appear here.</p>
        </div>
      )}

      <div className="intelligence-list">
        {insights.map((card) => (
          <article
            key={card.id}
            className={`intelligence-card is-${card.severity}${card.reason ? " is-waiting" : ""}`}
          >
            <div className="intelligence-card-meta">
              <span>{card.source === "llm" ? "AI desk note" : card.tags[0] || "Match data"}</span>
              <span suppressHydrationWarning>
                {card.confidence ? `${card.confidence} confidence` : "Observed"}
                {relativeTime(card.asOf || card.ts, now)
                  ? ` · ${relativeTime(card.asOf || card.ts, now)}`
                  : ""}
              </span>
            </div>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            {!!card.evidence?.length && (
              <div className="intelligence-evidence" aria-label="Evidence sources">
                {card.evidence.slice(0, 3).map((evidence, index) =>
                  evidence.url ? (
                    <a
                      key={`${evidence.kind}-${index}`}
                      href={evidence.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {evidence.label} ↗
                    </a>
                  ) : (
                    <span key={`${evidence.kind}-${index}`}>
                      {evidence.label} · {evidence.source}
                    </span>
                  )
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
