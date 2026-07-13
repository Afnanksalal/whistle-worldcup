"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import {
  formatCalendarDate,
  type LocalTimeContext,
  useLocalTimeContext,
} from "../../lib/local-time";
import type { NewsArticle, NewsInitialData } from "../../lib/seo-data";

type LoadState = "loading" | "ready" | "error";

const ALL_SOURCES = "__all__";

function sourceLabel(source: string) {
  return source.trim() || "News desk";
}

function sourceMonogram(source: string) {
  const words = sourceLabel(source)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return words.map((word) => word[0]).join("").toUpperCase();
}

function articleLinkLabel(article: NewsArticle) {
  return `Read ${article.title} at ${sourceLabel(article.source)} (opens in a new tab)`;
}

function ArticleImage({
  article,
  featured = false,
}: {
  article: NewsArticle;
  featured?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [article.imageUrl]);

  const showImage = Boolean(article.imageUrl) && !imageFailed;
  const className = [
    "news-image",
    featured ? "news-image--featured" : "news-image--card",
    showImage ? "" : "is-fallback",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} aria-hidden="true">
      {showImage ? (
        // News images come from arbitrary publisher hosts, so next/image cannot safely
        // optimize them without maintaining an incomplete remote-host allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="news-image__asset"
          src={article.imageUrl || undefined}
          alt=""
          loading={featured ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={featured ? "high" : "auto"}
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="news-image__fallback">
          <span className="news-image__fallback-mark">{sourceMonogram(article.source)}</span>
          <span className="news-image__fallback-label">
            {sourceLabel(article.source)} · Text report
          </span>
        </div>
      )}
    </div>
  );
}

function StoryMeta({
  article,
  localTime,
}: {
  article: NewsArticle;
  localTime: LocalTimeContext;
}) {
  return (
    <p className="news-story-meta">
      <span className="news-story-meta__source">{sourceLabel(article.source)}</span>
      <span className="news-story-meta__divider" aria-hidden="true">
        /
      </span>
      <time
        className="news-story-meta__time"
        dateTime={article.publishedAt}
        suppressHydrationWarning
      >
        {formatCalendarDate(article.publishedAt, localTime, true)}
      </time>
    </p>
  );
}

export default function NewsClient({
  initialData,
}: {
  initialData: NewsInitialData | null;
}) {
  const [articles, setArticles] = useState<NewsArticle[]>(initialData?.articles ?? []);
  const [feedSource, setFeedSource] = useState(initialData?.source ?? "");
  const [activeSource, setActiveSource] = useState(ALL_SOURCES);
  const [loadState, setLoadState] = useState<LoadState>(
    initialData === null ? "loading" : "ready"
  );
  const [requestVersion, setRequestVersion] = useState(0);
  const initiallySeeded = initialData !== null;
  const localTime = useLocalTimeContext();

  useEffect(() => {
    const controller = new AbortController();

    async function loadArticles() {
      const isSeededRefresh = initiallySeeded && requestVersion === 0;
      if (!isSeededRefresh) setLoadState("loading");

      try {
        const response = await api<NewsInitialData>("/news", {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setArticles(response.articles);
        setFeedSource(response.source);
        setActiveSource((current) =>
          current === ALL_SOURCES ||
          response.articles.some((article) => sourceLabel(article.source) === current)
            ? current
            : ALL_SOURCES
        );
        setLoadState("ready");
      } catch {
        if (!controller.signal.aborted) {
          setLoadState(isSeededRefresh ? "ready" : "error");
        }
      }
    }

    void loadArticles();
    return () => controller.abort();
  }, [initiallySeeded, requestVersion]);

  const sortedArticles = useMemo(
    () =>
      [...articles].sort((a, b) => {
        const aTime = Date.parse(a.publishedAt) || 0;
        const bTime = Date.parse(b.publishedAt) || 0;
        return bTime - aTime;
      }),
    [articles]
  );

  const sources = useMemo(
    () =>
      Array.from(
        new Set(sortedArticles.map((article) => sourceLabel(article.source)))
      ).sort((a, b) => a.localeCompare(b)),
    [sortedArticles]
  );

  const filteredArticles = useMemo(
    () =>
      activeSource === ALL_SOURCES
        ? sortedArticles
        : sortedArticles.filter(
            (article) => sourceLabel(article.source) === activeSource
          ),
    [activeSource, sortedArticles]
  );

  const featuredArticle =
    filteredArticles.slice(0, 12).find((article) => article.imageUrl) ||
    filteredArticles[0];
  const latestArticles = filteredArticles.filter(
    (article) => article.id !== featuredArticle?.id
  );
  const visualArticles = latestArticles.filter((article) => article.imageUrl);
  const headlineArticles = latestArticles.filter((article) => !article.imageUrl);
  const storyCountLabel = `${filteredArticles.length} ${
    filteredArticles.length === 1 ? "story" : "stories"
  }`;

  const retry = () => setRequestVersion((version) => version + 1);

  return (
    <main id="main-content" className="news-page">
      <div className="shell news-page__shell">
        <header className="news-masthead">
          <div className="news-masthead__topline">
            <p className="news-masthead__kicker">Matchday briefing</p>
            {loadState === "ready" && articles.length > 0 && (
              <p
                className="news-masthead__feed"
                title={feedSource ? `Feed: ${feedSource}` : undefined}
              >
                <span className="news-masthead__feed-dot" aria-hidden="true" />
                {sources.length} {sources.length === 1 ? "source" : "sources"} reporting
              </p>
            )}
          </div>
          <h1 className="news-masthead__title">The World Cup desk</h1>
          <p className="news-masthead__dek">
            Team news, tournament context, and the stories shaping the next kickoff.
          </p>
        </header>

        {loadState === "loading" && (
          <section
            className="news-state news-state--loading"
            aria-live="polite"
            aria-busy="true"
          >
            <p className="news-state__label">Live desk</p>
            <h2 className="news-state__title">Gathering the latest reports</h2>
            <p className="news-state__copy">
              Pulling together the newest tournament coverage from trusted publishers.
            </p>
            <div className="news-loading-grid" aria-hidden="true">
              <span className="news-loading-card news-loading-card--featured" />
              <span className="news-loading-card" />
              <span className="news-loading-card" />
            </div>
          </section>
        )}

        {loadState === "error" && (
          <section className="news-state news-state--error" role="alert">
            <p className="news-state__label">Feed unavailable</p>
            <h2 className="news-state__title">The desk missed an update</h2>
            <p className="news-state__copy">
              Latest stories are temporarily unavailable. Try the feed again in a moment.
            </p>
            <button className="news-state__action" type="button" onClick={retry}>
              Try again
            </button>
          </section>
        )}

        {loadState === "ready" && articles.length === 0 && (
          <section className="news-state news-state--empty">
            <p className="news-state__label">Between updates</p>
            <h2 className="news-state__title">No fresh stories yet</h2>
            <p className="news-state__copy">
              New tournament coverage will appear here as soon as publishers file it.
            </p>
            <button className="news-state__action" type="button" onClick={retry}>
              Refresh news
            </button>
          </section>
        )}

        {loadState === "ready" && featuredArticle && (
          <>
            <section className="news-controls" aria-labelledby="news-source-heading">
              <div className="news-controls__heading">
                <h2 className="news-controls__title" id="news-source-heading">
                  Sources
                </h2>
                <p className="news-controls__count" aria-live="polite">
                  {storyCountLabel}
                </p>
              </div>
              <div
                className="news-source-filters"
                role="group"
                aria-labelledby="news-source-heading"
              >
                <button
                  className={`news-source-filter${
                    activeSource === ALL_SOURCES ? " is-active" : ""
                  }`}
                  type="button"
                  aria-pressed={activeSource === ALL_SOURCES}
                  onClick={() => setActiveSource(ALL_SOURCES)}
                >
                  All sources
                </button>
                {sources.map((source) => (
                  <button
                    className={`news-source-filter${
                      activeSource === source ? " is-active" : ""
                    }`}
                    key={source}
                    type="button"
                    aria-pressed={activeSource === source}
                    onClick={() => setActiveSource(source)}
                  >
                    {source}
                  </button>
                ))}
              </div>
            </section>

            <section className="news-feature" aria-labelledby="featured-story-title">
              <p className="news-section-label">Top story</p>
              <article className="news-feature__story">
                <a
                  className={`news-feature__link${
                    featuredArticle.imageUrl ? "" : " is-text-only"
                  }`}
                  href={featuredArticle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={articleLinkLabel(featuredArticle)}
                >
                  {featuredArticle.imageUrl && (
                    <ArticleImage key={featuredArticle.id} article={featuredArticle} featured />
                  )}
                  <div className="news-feature__content">
                    <StoryMeta article={featuredArticle} localTime={localTime} />
                    <h2 className="news-feature__title" id="featured-story-title">
                      {featuredArticle.title}
                    </h2>
                    {featuredArticle.description && (
                      <p className="news-feature__description">
                        {featuredArticle.description}
                      </p>
                    )}
                    <span className="news-story-cta">
                      Read at {sourceLabel(featuredArticle.source)}
                      <span className="news-story-cta__icon" aria-hidden="true">
                        ↗
                      </span>
                    </span>
                  </div>
                </a>
              </article>
            </section>

            {latestArticles.length > 0 && (
              <section className="news-latest" aria-labelledby="latest-stories-title">
                <header className="news-latest__header">
                  <h2 className="news-latest__title" id="latest-stories-title">
                    Latest reports
                  </h2>
                  <p className="news-latest__summary">
                    Fresh context for the fixtures and teams in play.
                  </p>
                </header>
                <div
                  className={`news-report-layout${
                    visualArticles.length === 0 ? " is-headlines-only" : ""
                  }${headlineArticles.length === 0 ? " is-images-only" : ""}`}
                >
                  {visualArticles.length > 0 && (
                    <div className="news-grid">
                      {visualArticles.map((article) => (
                        <article className="news-card" key={article.id}>
                          <a
                            className="news-card__link"
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={articleLinkLabel(article)}
                          >
                            <ArticleImage article={article} />
                            <div className="news-card__content">
                              <StoryMeta article={article} localTime={localTime} />
                              <h3 className="news-card__title">{article.title}</h3>
                              {article.description && (
                                <p className="news-card__description">{article.description}</p>
                              )}
                              <span className="news-story-cta news-card__cta">
                                Read story
                                <span className="news-story-cta__icon" aria-hidden="true">
                                  ↗
                                </span>
                              </span>
                            </div>
                          </a>
                        </article>
                      ))}
                    </div>
                  )}

                  {headlineArticles.length > 0 && (
                    <aside className="news-headline-rail" aria-labelledby="latest-headlines-title">
                      <h3 id="latest-headlines-title">Latest headlines</h3>
                      <ol>
                        {headlineArticles.map((article) => (
                          <li key={article.id}>
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={articleLinkLabel(article)}
                            >
                              <StoryMeta article={article} localTime={localTime} />
                              <strong>{article.title}</strong>
                              <span aria-hidden>↗</span>
                            </a>
                          </li>
                        ))}
                      </ol>
                    </aside>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
