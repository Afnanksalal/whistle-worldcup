import type { MetadataRoute } from "next";
import { getFixturesForSeo } from "../lib/seo-data";
import { absoluteUrl } from "../lib/site";

export const revalidate = 900;
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastUpdated = new Date("2026-07-13T00:00:00.000Z");
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: lastUpdated, changeFrequency: "hourly", priority: 1 },
    { url: absoluteUrl("/groups"), lastModified: lastUpdated, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/markets"), lastModified: lastUpdated, changeFrequency: "hourly", priority: 0.85 },
    { url: absoluteUrl("/news"), lastModified: lastUpdated, changeFrequency: "hourly", priority: 0.8 },
    { url: absoluteUrl("/squads"), lastModified: lastUpdated, changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl("/terms"), lastModified: lastUpdated, changeFrequency: "monthly", priority: 0.3 },
    { url: absoluteUrl("/privacy"), lastModified: lastUpdated, changeFrequency: "monthly", priority: 0.3 },
    { url: absoluteUrl("/responsible-play"), lastModified: lastUpdated, changeFrequency: "monthly", priority: 0.4 },
  ];

  const now = Date.now();
  const fixtures = await getFixturesForSeo();
  const matchRoutes: MetadataRoute.Sitemap = fixtures.map((fixture) => ({
    url: absoluteUrl(`/match/${encodeURIComponent(fixture.id)}`),
    lastModified: new Date(Math.min(fixture.kickoffTs, now)),
    changeFrequency: fixture.status === "finished" ? "weekly" : "hourly",
    priority: fixture.status === "finished" ? 0.55 : 0.75,
  }));

  return [...staticRoutes, ...matchRoutes];
}
