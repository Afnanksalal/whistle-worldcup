import { getLogger } from "./observability";

export type NewsArticle = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  imageUrl: string | null;
  publishedAt: string;
};

export type NewsResult = {
  articles: NewsArticle[];
  source: "rss";
  cached: boolean;
  stale: boolean;
};

type Cache = { at: number; articles: NewsArticle[] };

let cache: Cache | null = null;

const TTL_MS = positiveEnv("NEWS_CACHE_TTL_MS", 8 * 60 * 1000);
const FETCH_TIMEOUT_MS = positiveEnv("NEWS_FETCH_TIMEOUT_MS", 8_000);
const FEEDS: ReadonlyArray<readonly [string, string]> = [
  ["https://feeds.bbci.co.uk/sport/football/rss.xml", "BBC Sport"],
  ["https://www.espn.com/espn/rss/soccer/news", "ESPN"],
  ["https://www.theguardian.com/football/rss", "The Guardian"],
];

function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hashId(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `n${Math.abs(h)}`;
}

function decodeXml(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function firstTagValue(block: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    block.match(
      new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i")
    )?.[1] || ""
  );
}

function safeHttpUrl(raw: string): string | null {
  const value = decodeXml(raw).trim();
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function canonicalUrl(raw: string): string | null {
  const safe = safeHttpUrl(raw);
  if (!safe) return null;
  const url = new URL(safe);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_(?:cid|eid)$)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

function extractImage(item: string): string | null {
  const tags =
    item.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (/^<enclosure/i.test(tag)) {
      const type = tag.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] || "";
      if (type && !type.toLowerCase().startsWith("image/")) continue;
    }
    const raw = tag.match(/\burl\s*=\s*["']([^"']+)["']/i)?.[1];
    const url = raw ? safeHttpUrl(raw) : null;
    if (url) return url;
  }

  const imageTag = firstTagValue(item, "image");
  const nested = imageTag ? safeHttpUrl(firstTagValue(imageTag, "url")) : null;
  if (nested) return nested;

  const htmlImage = item.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
  return htmlImage ? safeHttpUrl(htmlImage) : null;
}

function publishedIso(raw: string): string {
  const ms = Date.parse(decodeXml(raw));
  // Unknown dates sort last and never pass match-intelligence recency gates.
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date(0).toISOString();
}

/** Pure RSS parser exported for focused provider-fixture tests. */
export function parseRss(xml: string, source: string): NewsArticle[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const out: NewsArticle[] = [];
  for (const item of items.slice(0, 20)) {
    const title = decodeXml(firstTagValue(item, "title"));
    const url = canonicalUrl(
      firstTagValue(item, "link") || firstTagValue(item, "guid")
    );
    const rawDescription =
      firstTagValue(item, "description") || firstTagValue(item, "content:encoded");
    if (!title || !url) continue;
    out.push({
      id: hashId(url),
      title,
      description:
        decodeXml(rawDescription)
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .slice(0, 280) || null,
      url,
      source,
      imageUrl: extractImage(item),
      publishedAt: publishedIso(
        firstTagValue(item, "pubDate") || firstTagValue(item, "updated")
      ),
    });
  }
  return out;
}

async function fetchRss(feed: string, source: string): Promise<NewsArticle[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feed, {
      signal: controller.signal,
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent":
          "WhistleBot/1.0 (+https://github.com/Afnanksalal/whistle-worldcup)",
      },
    });
    if (!res.ok) throw new Error(`RSS ${res.status} ${feed}`);
    return parseRss(await res.text(), source);
  } finally {
    clearTimeout(timeout);
  }
}

function mergeArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  return articles
    .filter((article) => {
      if (seen.has(article.url)) return false;
      seen.add(article.url);
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 40);
}

/** Keyless news - public RSS only (BBC + ESPN + Guardian sport). */
export async function getWorldCupNews(opts?: {
  force?: boolean;
}): Promise<NewsResult> {
  if (cache && !opts?.force && Date.now() - cache.at < TTL_MS) {
    return { articles: cache.articles, source: "rss", cached: true, stale: false };
  }

  const results = await Promise.allSettled(
    FEEDS.map(async ([url, source]) => ({
      source,
      articles: await fetchRss(url, source),
    }))
  );
  const merged: NewsArticle[] = [];
  const failedSources = new Set<string>();
  results.forEach((result, index) => {
    const [url, source] = FEEDS[index];
    if (result.status === "fulfilled") {
      merged.push(...result.value.articles);
    } else {
      failedSources.add(source);
      getLogger().warn({ err: result.reason, url, source }, "rss fetch failed");
    }
  });

  if (!merged.length && cache?.articles.length) {
    getLogger().warn(
      { ageMs: Date.now() - cache.at },
      "all rss feeds failed; serving stale cache"
    );
    return { articles: cache.articles, source: "rss", cached: true, stale: true };
  }
  if (!merged.length) {
    throw new Error("All RSS feeds failed");
  }

  // Preserve the last successful copy for a publisher during a partial outage.
  if (cache && failedSources.size) {
    merged.push(
      ...cache.articles.filter((article) => failedSources.has(article.source))
    );
  }
  const articles = mergeArticles(merged);
  cache = { at: Date.now(), articles };
  return {
    articles,
    source: "rss",
    cached: false,
    stale: failedSources.size > 0,
  };
}
