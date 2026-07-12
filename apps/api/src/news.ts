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

type Cache = { at: number; articles: NewsArticle[] };
let cache: Cache | null = null;
const TTL_MS = 8 * 60 * 1000;

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
    .replace(/&#39;/g, "'")
    .trim();
}

async function fetchRss(feed: string, source: string): Promise<NewsArticle[]> {
  const res = await fetch(feed, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml, */*",
      "User-Agent": "WhistleBot/1.0 (+https://github.com/Afnanksalal/whistle-worldcup)",
    },
  });
  if (!res.ok) throw new Error(`RSS ${res.status} ${feed}`);
  const xml = await res.text();
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const out: NewsArticle[] = [];
  for (const item of items.slice(0, 20)) {
    const title = item.match(/<title>([\s\S]*?)<\/title>/i);
    const link =
      item.match(/<link>([\s\S]*?)<\/link>/i) ||
      item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const desc = item.match(/<description>([\s\S]*?)<\/description>/i);
    const pub = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const t = decodeXml(title?.[1] || "");
    const u = decodeXml(link?.[1] || "");
    if (!t || !u || !u.startsWith("http")) continue;
    out.push({
      id: hashId(u),
      title: t,
      description:
        decodeXml(desc?.[1] || "")
          .replace(/<[^>]+>/g, "")
          .slice(0, 280) || null,
      url: u,
      source,
      imageUrl: null,
      publishedAt: pub?.[1] ? new Date(decodeXml(pub[1])).toISOString() : new Date().toISOString(),
    });
  }
  return out;
}

/** Keyless news — public RSS only (BBC + ESPN + Guardian sport). */
export async function getWorldCupNews(opts?: {
  force?: boolean;
}): Promise<{ articles: NewsArticle[]; source: "rss"; cached: boolean }> {
  if (cache && !opts?.force && Date.now() - cache.at < TTL_MS) {
    return { articles: cache.articles, source: "rss", cached: true };
  }

  const feeds: Array<[string, string]> = [
    ["https://feeds.bbci.co.uk/sport/football/rss.xml", "BBC Sport"],
    ["https://www.espn.com/espn/rss/soccer/news", "ESPN"],
    ["https://www.theguardian.com/football/rss", "The Guardian"],
  ];

  const merged: NewsArticle[] = [];
  for (const [url, source] of feeds) {
    try {
      merged.push(...(await fetchRss(url, source)));
    } catch (err) {
      getLogger().warn({ err, url }, "rss fetch failed");
    }
  }

  const seen = new Set<string>();
  const articles = merged
    .filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 40);

  if (!articles.length) {
    throw new Error("All RSS feeds failed");
  }

  cache = { at: Date.now(), articles };
  return { articles, source: "rss", cached: false };
}
