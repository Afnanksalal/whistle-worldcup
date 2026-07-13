import { getLogger } from "./observability";
import { isCurrentWorldCupArticle } from "./newsRelevance";

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

type Cache = { at: number; articles: NewsArticle[]; stale: boolean };

let cache: Cache | null = null;

const TTL_MS = positiveEnv("NEWS_CACHE_TTL_MS", 8 * 60 * 1000);
const FETCH_TIMEOUT_MS = positiveEnv("NEWS_FETCH_TIMEOUT_MS", 8_000);
const FEEDS: ReadonlyArray<readonly [string, string]> = [
  ["https://feeds.bbci.co.uk/sport/football/world-cup/rss.xml", "BBC Sport"],
  ["https://www.theguardian.com/football/world-cup-2026/rss", "The Guardian"],
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

type ImageCandidate = {
  url: string;
  width: number | null;
  height: number | null;
};

function tagAttribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    tag.match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ||
    ""
  );
}

function imageDimension(raw: string): number | null {
  const value = Number(decodeXml(raw));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function secureImageUrl(raw: string): string | null {
  const safe = safeHttpUrl(raw);
  if (!safe) return null;
  const url = new URL(safe);
  return url.protocol === "https:" ? url.toString() : null;
}

function hasImageExtension(url: string): boolean {
  return /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(new URL(url).pathname);
}

function hasNonImageExtension(url: string): boolean {
  return /\.(?:aac|avi|m4a|m4v|mkv|mov|mp3|mp4|mpeg|mpg|ogg|ogv|wav|webm)$/i.test(
    new URL(url).pathname
  );
}

function candidateFromTag(
  tag: string,
  kind: "media:content" | "media:thumbnail" | "enclosure" | "html"
): ImageCandidate | null {
  const rawUrl = tagAttribute(tag, kind === "html" ? "src" : "url");
  const url = rawUrl ? secureImageUrl(rawUrl) : null;
  if (!url || hasNonImageExtension(url)) return null;

  const type = decodeXml(tagAttribute(tag, "type")).toLowerCase();
  const medium = decodeXml(tagAttribute(tag, "medium")).toLowerCase();
  if (type && !type.startsWith("image/")) return null;
  if (medium && medium !== "image") return null;

  // Thumbnail and <img> elements are image-specific. Generic media/enclosure
  // elements need either image metadata or an image filename when metadata is absent.
  if (
    (kind === "media:content" || kind === "enclosure") &&
    !type &&
    !medium &&
    !hasImageExtension(url)
  ) {
    return null;
  }

  return {
    url,
    width: imageDimension(tagAttribute(tag, "width")),
    height: imageDimension(tagAttribute(tag, "height")),
  };
}

function candidateSize(candidate: ImageCandidate): number {
  if (candidate.width && candidate.height) {
    return candidate.width * candidate.height;
  }
  const declaredEdge = candidate.width || candidate.height || 0;
  return declaredEdge * declaredEdge;
}

function extractImage(item: string): string | null {
  const candidates: ImageCandidate[] = [];
  const mediaTags =
    item.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi) || [];
  for (const tag of mediaTags) {
    const kind = tag.match(/^<\s*([^\s>]+)/)?.[1]?.toLowerCase();
    if (
      kind === "media:content" ||
      kind === "media:thumbnail" ||
      kind === "enclosure"
    ) {
      const candidate = candidateFromTag(tag, kind);
      if (candidate) candidates.push(candidate);
    }
  }

  for (const match of item.matchAll(/<image(?:\s[^>]*)?>([\s\S]*?)<\/image>/gi)) {
    const block = match[1];
    const url = secureImageUrl(firstTagValue(block, "url"));
    if (!url || hasNonImageExtension(url)) continue;
    candidates.push({
      url,
      width: imageDimension(firstTagValue(block, "width")),
      height: imageDimension(firstTagValue(block, "height")),
    });
  }

  const descriptionBlocks = [
    firstTagValue(item, "description"),
    firstTagValue(item, "content:encoded"),
  ];
  for (const rawBlock of descriptionBlocks) {
    const block = decodeXml(rawBlock);
    for (const tag of block.match(/<img\b[^>]*>/gi) || []) {
      const candidate = candidateFromTag(tag, "html");
      if (candidate) candidates.push(candidate);
    }
  }

  let best: ImageCandidate | null = null;
  for (const candidate of candidates) {
    if (!best || candidateSize(candidate) > candidateSize(best)) {
      best = candidate;
    }
  }
  return best?.url || null;
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
  for (const item of items.slice(0, 60)) {
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
    const body = await res.text();
    const contentType = res.headers.get("content-type") || "";
    const prefix = body.slice(0, 2_000);
    if (
      /text\/html/i.test(contentType) ||
      /<!doctype\s+html|<html\b/i.test(prefix) ||
      !/<(?:rss|rdf:RDF)\b/i.test(prefix)
    ) {
      throw new Error(`Invalid RSS document ${feed}`);
    }
    const articles = parseRss(body, source);
    if (!articles.length) {
      throw new Error(`RSS contained no usable items ${feed}`);
    }
    return articles;
  } finally {
    clearTimeout(timeout);
  }
}

function mergeArticles(articles: NewsArticle[], now: number): NewsArticle[] {
  const seen = new Set<string>();
  return articles
    .filter((article) => isCurrentWorldCupArticle(article, now))
    .filter((article) => {
      if (seen.has(article.url)) return false;
      seen.add(article.url);
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 40);
}

/** Keyless news from the BBC and Guardian's World Cup-scoped RSS feeds. */
export async function getWorldCupNews(opts?: {
  force?: boolean;
}): Promise<NewsResult> {
  const now = Date.now();
  if (cache && !opts?.force && now - cache.at < TTL_MS) {
    return {
      articles: mergeArticles(cache.articles, now),
      source: "rss",
      cached: true,
      stale: cache.stale,
    };
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

  if (failedSources.size === FEEDS.length && cache) {
    getLogger().warn(
      { ageMs: now - cache.at },
      "all rss feeds failed; serving stale cache"
    );
    cache.stale = true;
    return {
      articles: mergeArticles(cache.articles, now),
      source: "rss",
      cached: true,
      stale: true,
    };
  }
  if (failedSources.size === FEEDS.length) {
    throw new Error("All RSS feeds failed");
  }

  // Preserve the last successful copy for a publisher during a partial outage.
  if (cache && failedSources.size) {
    merged.push(
      ...cache.articles.filter((article) => failedSources.has(article.source))
    );
  }
  const articles = mergeArticles(merged, now);
  cache = { at: now, articles, stale: failedSources.size > 0 };
  return {
    articles,
    source: "rss",
    cached: false,
    stale: failedSources.size > 0,
  };
}
