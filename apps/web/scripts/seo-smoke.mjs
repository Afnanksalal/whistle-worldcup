import {
  SEO_ARTICLE_TITLE,
  SEO_AWAY_TEAM,
  SEO_FIXTURE_ID,
  SEO_HOME_TEAM,
  SEO_UNKNOWN_FIXTURE_ID,
} from "./seo-smoke-data.mjs";

const baseUrl = (process.env.SEO_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const expectedSiteUrl = new URL(process.env.SEO_EXPECTED_ORIGIN || "https://whistle.example");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  expectedSiteUrl.pathname === "/" && !expectedSiteUrl.search && !expectedSiteUrl.hash,
  "SEO_EXPECTED_ORIGIN must be an origin without a path, query, or fragment"
);
assert(
  !expectedSiteUrl.username && !expectedSiteUrl.password,
  "SEO_EXPECTED_ORIGIN must not include credentials"
);

const expectedOrigin = expectedSiteUrl.origin;

async function request(path, expectedType, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "follow" });
  assert(
    response.status === expectedStatus,
    `${path} returned ${response.status}, expected ${expectedStatus}`
  );
  const contentType = response.headers.get("content-type") || "";
  if (expectedType) {
    assert(
      contentType.includes(expectedType),
      `${path} returned ${contentType}, expected ${expectedType}`
    );
  }
  return { response, body: await response.text(), contentType };
}

function expectText(body, value, label) {
  assert(body.includes(value), `${label} is missing ${JSON.stringify(value)}`);
}

function expectPattern(body, pattern, label) {
  assert(pattern.test(body), `${label} did not match ${pattern}`);
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (entity, name) => named[name.toLowerCase()] ?? entity);
}

function bodyMarkup(html) {
  const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  assert(match, "HTML response is missing a body element");
  return match[1]
    .replace(/<(?:script|style|template)\b[^>]*>[\s\S]*?<\/(?:script|style|template)>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");
}

function textFromMarkup(markup) {
  return decodeEntities(markup.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function expectVisibleText(html, value, label) {
  expectText(textFromMarkup(bodyMarkup(html)), value, label);
}

function attributes(tag) {
  const result = {};
  const pattern = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function elements(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  return [...html.matchAll(pattern)].map((match) => attributes(match[0]));
}

function expectAbsoluteUrl(value, path, label) {
  assert(value, `${label} URL is missing`);
  let actual;
  try {
    actual = new URL(value);
  } catch {
    throw new Error(`${label} is not an absolute URL`);
  }
  assert(
    actual.origin === expectedOrigin,
    `${label} uses ${actual.origin}, expected ${expectedOrigin}`
  );
  const expected = new URL(path, expectedSiteUrl).href;
  assert(actual.href === expected, `${label} is ${actual.href}, expected ${expected}`);
}

function expectPageOrigins(html, path, label) {
  const canonical = elements(html, "link").filter((item) =>
    (item.rel || "").toLowerCase().split(/\s+/).includes("canonical")
  );
  assert(canonical.length === 1, `${label} has ${canonical.length} canonical links, expected 1`);
  expectAbsoluteUrl(canonical[0].href, path, `${label} canonical`);

  const openGraphUrls = elements(html, "meta").filter(
    (item) => (item.property || "").toLowerCase() === "og:url"
  );
  assert(openGraphUrls.length === 1, `${label} has ${openGraphUrls.length} og:url tags, expected 1`);
  expectAbsoluteUrl(openGraphUrls[0].content, path, `${label} og:url`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const home = await request("/", "text/html");
expectText(home.body, "World Cup 2026 match prediction pools", "home title");
expectPattern(home.body, /<meta name="description" content="[^"]+"/i, "home description");
expectPageOrigins(home.body, "/", "home");
const homeOgImages = elements(home.body, "meta").filter(
  (item) => (item.property || "").toLowerCase() === "og:image"
);
assert(homeOgImages.length > 0, "Open Graph image metadata is missing");
for (const image of homeOgImages) {
  const imageUrl = new URL(image.content);
  assert(imageUrl.origin === expectedOrigin, "Open Graph image uses the wrong canonical origin");
}
expectText(home.body, 'name="twitter:card" content="summary_large_image"', "Twitter card");
expectText(home.body, 'type="application/ld+json"', "structured data");
expectText(home.body, 'rel="manifest" href="/manifest.webmanifest"', "web app manifest link");
expectVisibleText(home.body, SEO_HOME_TEAM, "home server-rendered fixture home team");
expectVisibleText(home.body, SEO_AWAY_TEAM, "home server-rendered fixture away team");
expectPattern(
  bodyMarkup(home.body),
  new RegExp(`href=["']/match/${escapeRegExp(SEO_FIXTURE_ID)}["']`, "i"),
  "home server-rendered fixture link"
);

const groups = await request("/groups", "text/html");
expectText(groups.body, "World Cup 2026 groups, fixtures and standings", "tournament metadata");
expectPageOrigins(groups.body, "/groups", "groups");
expectVisibleText(groups.body, SEO_HOME_TEAM, "groups server-rendered home team");
expectVisibleText(groups.body, SEO_AWAY_TEAM, "groups server-rendered away team");

const news = await request("/news", "text/html");
expectText(news.body, "World Cup 2026 news and matchday briefing", "news metadata");
expectPageOrigins(news.body, "/news", "news");
expectVisibleText(news.body, SEO_ARTICLE_TITLE, "news server-rendered article");

const matchPath = `/match/${encodeURIComponent(SEO_FIXTURE_ID)}`;
const match = await request(matchPath, "text/html");
expectPageOrigins(match.body, matchPath, "match");
const matchHeadings = [
  ...bodyMarkup(match.body).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi),
];
assert(matchHeadings.length === 1, `match page has ${matchHeadings.length} h1 elements, expected 1`);
const matchHeadingText = textFromMarkup(matchHeadings[0][1]);
expectText(matchHeadingText, SEO_HOME_TEAM, "match h1 home team");
expectText(matchHeadingText, SEO_AWAY_TEAM, "match h1 away team");

await request(`/match/${encodeURIComponent(SEO_UNKNOWN_FIXTURE_ID)}`, "text/html", 404);

const positions = await request("/positions", "text/html");
expectPattern(
  positions.body,
  /<meta name="robots" content="[^"]*noindex[^"]*nofollow/i,
  "positions noindex"
);

const admin = await request("/admin", "text/html");
expectPattern(
  admin.body,
  /<meta name="robots" content="[^"]*noindex[^"]*nofollow/i,
  "admin noindex"
);

const robots = await request("/robots.txt", "text/plain");
expectText(robots.body, "User-Agent: OAI-SearchBot", "OpenAI search crawler policy");
expectText(robots.body, "User-Agent: Claude-SearchBot", "Claude search crawler policy");
expectText(robots.body, "User-Agent: PerplexityBot", "Perplexity crawler policy");
expectText(robots.body, "User-Agent: GPTBot", "training crawler policy");
expectText(robots.body, `Sitemap: ${expectedOrigin}/sitemap.xml`, "canonical sitemap declaration");

const sitemap = await request("/sitemap.xml", "application/xml");
expectText(sitemap.body, `${expectedOrigin}/groups</loc>`, "tournament sitemap entry");
expectText(sitemap.body, `${expectedOrigin}/news</loc>`, "news sitemap entry");
expectText(sitemap.body, `${expectedOrigin}${matchPath}</loc>`, "match sitemap entry");
assert(!sitemap.body.includes("/positions</loc>"), "personal positions route must not be in sitemap");
assert(!sitemap.body.includes("/admin</loc>"), "admin route must not be in sitemap");
const sitemapLocations = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/gi)];
assert(sitemapLocations.length > 0, "sitemap has no locations");
for (const [, location] of sitemapLocations) {
  const sitemapUrl = new URL(decodeEntities(location));
  assert(
    sitemapUrl.origin === expectedOrigin,
    `sitemap location uses ${sitemapUrl.origin}, expected ${expectedOrigin}`
  );
}

const llms = await request("/llms.txt", "text/plain");
expectText(llms.body, "TxLINE is the primary sports-data source", "LLM data-source boundary");
expectText(llms.body, "play units with no guaranteed monetary value", "LLM play-unit boundary");
expectText(llms.body, `${expectedOrigin}/sitemap.xml`, "LLM canonical sitemap URL");

const manifest = await request("/manifest.webmanifest", "application/manifest+json");
const manifestJson = JSON.parse(manifest.body);
assert(manifestJson.icons?.some((icon) => icon.sizes === "192x192"), "manifest lacks a 192x192 icon");
assert(manifestJson.icons?.some((icon) => icon.sizes === "512x512"), "manifest lacks a 512x512 icon");
assert(manifestJson.icons?.some((icon) => icon.purpose === "maskable"), "manifest lacks a maskable icon");

const ogImage = await request("/opengraph-image", "image/png");
assert(ogImage.contentType.includes("image/png"), "Open Graph image is not PNG");

console.log(
  "SEO smoke passed: SSR content, match semantics/404, canonical origins, crawler policy, sitemap, LLM context, manifest, and social image."
);
