const baseUrl = (process.env.SEO_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, expectedType) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "follow" });
  assert(response.ok, `${path} returned ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (expectedType) {
    assert(contentType.includes(expectedType), `${path} returned ${contentType}, expected ${expectedType}`);
  }
  return { response, body: await response.text(), contentType };
}

function expectText(body, value, label) {
  assert(body.includes(value), `${label} is missing ${JSON.stringify(value)}`);
}

function expectPattern(body, pattern, label) {
  assert(pattern.test(body), `${label} did not match ${pattern}`);
}

const home = await request("/", "text/html");
expectText(home.body, "World Cup 2026 match prediction pools", "home title");
expectPattern(home.body, /<meta name="description" content="[^"]+"/i, "home description");
expectPattern(home.body, /<link rel="canonical" href="https?:\/\/[^\"]+\/?"/i, "home canonical");
expectPattern(home.body, /<meta property="og:image" content="https?:\/\/[^\"]+"/i, "Open Graph image");
expectText(home.body, 'name="twitter:card" content="summary_large_image"', "Twitter card");
expectText(home.body, 'type="application/ld+json"', "structured data");
expectText(home.body, 'rel="manifest" href="/manifest.webmanifest"', "web app manifest link");

const groups = await request("/groups", "text/html");
expectText(groups.body, "World Cup 2026 groups, fixtures and standings", "tournament metadata");

const news = await request("/news", "text/html");
expectText(news.body, "World Cup 2026 news and matchday briefing", "news metadata");

const positions = await request("/positions", "text/html");
expectPattern(positions.body, /<meta name="robots" content="[^"]*noindex[^"]*nofollow/i, "positions noindex");

const admin = await request("/admin", "text/html");
expectPattern(admin.body, /<meta name="robots" content="[^"]*noindex[^"]*nofollow/i, "admin noindex");

const robots = await request("/robots.txt", "text/plain");
expectText(robots.body, "User-Agent: OAI-SearchBot", "OpenAI search crawler policy");
expectText(robots.body, "User-Agent: Claude-SearchBot", "Claude search crawler policy");
expectText(robots.body, "User-Agent: PerplexityBot", "Perplexity crawler policy");
expectText(robots.body, "User-Agent: GPTBot", "training crawler policy");
expectText(robots.body, "Sitemap: ", "sitemap declaration");

const sitemap = await request("/sitemap.xml", "application/xml");
expectText(sitemap.body, "/groups</loc>", "tournament sitemap entry");
expectText(sitemap.body, "/news</loc>", "news sitemap entry");
assert(!sitemap.body.includes("/positions</loc>"), "personal positions route must not be in sitemap");
assert(!sitemap.body.includes("/admin</loc>"), "admin route must not be in sitemap");

const llms = await request("/llms.txt", "text/plain");
expectText(llms.body, "TxLINE is the primary sports-data source", "LLM data-source boundary");
expectText(llms.body, "play units with no guaranteed monetary value", "LLM play-unit boundary");

const manifest = await request("/manifest.webmanifest", "application/manifest+json");
const manifestJson = JSON.parse(manifest.body);
assert(manifestJson.icons?.some((icon) => icon.sizes === "192x192"), "manifest lacks a 192x192 icon");
assert(manifestJson.icons?.some((icon) => icon.sizes === "512x512"), "manifest lacks a 512x512 icon");
assert(manifestJson.icons?.some((icon) => icon.purpose === "maskable"), "manifest lacks a maskable icon");

const ogImage = await request("/opengraph-image", "image/png");
assert(ogImage.contentType.includes("image/png"), "Open Graph image is not PNG");

console.log("SEO smoke passed: metadata, crawler policy, sitemap, LLM context, manifest, and social image.");
