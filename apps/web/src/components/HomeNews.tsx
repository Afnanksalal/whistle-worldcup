"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatCalendarDate, useLocalTimeContext } from "../lib/local-time";
import type { NewsArticle, NewsInitialData } from "../lib/seo-data";

function sourceLabel(source: string) {
  return source.trim() || "News desk";
}

function HomeNewsImage({ article }: { article: NewsArticle }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [article.imageUrl]);

  if (!article.imageUrl || failed) {
    return (
      <div className="home-news-card__fallback" aria-hidden="true">
        <span>{sourceLabel(article.source)}</span>
      </div>
    );
  }

  return (
    // Publisher artwork is displayed only when it is supplied by the feed.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="home-news-card__image"
      src={article.imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function HomeNews({ articles }: { articles: NewsArticle[] }) {
  const [feedArticles, setFeedArticles] = useState(articles);
  const localTime = useLocalTimeContext();

  useEffect(() => {
    if (articles.length > 0) return;

    const controller = new AbortController();
    void api<NewsInitialData>("/news", { signal: controller.signal })
      .then((response) => setFeedArticles(response.articles))
      .catch(() => undefined);

    return () => controller.abort();
  }, [articles.length]);

  const stories = useMemo(
    () =>
      [...feedArticles]
        .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
        .filter((article) => article.imageUrl)
        .slice(0, 3),
    [feedArticles]
  );

  if (stories.length === 0) return null;

  return (
    <section className="home-news" aria-labelledby="home-news-title">
      <div className="shell">
        <header className="home-news__header">
          <div>
            <p className="section-kicker">Latest</p>
            <h2 id="home-news-title">World Cup news</h2>
          </div>
          <Link className="text-link" href="/news">
            All stories <span aria-hidden>→</span>
          </Link>
        </header>

        <div className="home-news__grid">
          {stories.map((article) => (
            <article className="home-news-card" key={article.id}>
              <a
                className="home-news-card__link"
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Read ${article.title} at ${sourceLabel(article.source)} (opens in a new tab)`}
              >
                <div className="home-news-card__media">
                  <HomeNewsImage article={article} />
                </div>
                <div className="home-news-card__body">
                  <p className="home-news-card__meta">
                    <span>{sourceLabel(article.source)}</span>
                    <time dateTime={article.publishedAt} suppressHydrationWarning>
                      {formatCalendarDate(article.publishedAt, localTime)}
                    </time>
                  </p>
                  <h3>{article.title}</h3>
                </div>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
