"use client";

import { useEffect, useState } from "react";
import { api, formatKickoff } from "../../lib/api";

type NewsArticle = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  imageUrl: string | null;
  publishedAt: string;
};

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [source, setSource] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ articles: NewsArticle[]; source: string }>("/news")
      .then((r) => {
        setArticles(r.articles);
        setSource(r.source);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="shell" style={{ padding: "2rem 0 4rem" }}>
      <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>
        Wire
      </p>
      <h1 className="display rise" style={{ fontSize: "2.1rem", marginBottom: "0.35rem" }}>
        World Cup news
      </h1>
      <p style={{ color: "var(--mute)", maxWidth: 520, marginTop: 0 }}>
        Live headlines from the news pipeline
        {source ? ` · source ${source}` : ""}. Cached server-side for ten minutes.
      </p>

      {error && (
        <div className="panel" style={{ padding: "1rem", color: "var(--signal)" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: "0.75rem", marginTop: "1.5rem" }}>
        {articles.map((a) => (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="panel"
            style={{ padding: "1.1rem 1.2rem", display: "block" }}
          >
            <div className="mono" style={{ color: "var(--mute)", fontSize: "0.7rem", marginBottom: "0.35rem" }}>
              {a.source} · {formatKickoff(new Date(a.publishedAt).getTime())}
            </div>
            <div className="display" style={{ fontSize: "1.15rem", marginBottom: "0.35rem" }}>
              {a.title}
            </div>
            {a.description && (
              <p style={{ color: "var(--mute)", margin: 0, fontSize: "0.9rem", lineHeight: 1.45 }}>
                {a.description}
              </p>
            )}
          </a>
        ))}
        {!articles.length && !error && (
          <p style={{ color: "var(--mute)" }}>No articles yet — check NEWS_API_KEY or RSS connectivity.</p>
        )}
      </div>
    </main>
  );
}
