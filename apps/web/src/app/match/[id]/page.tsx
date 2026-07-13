import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "../../../components/JsonLd";
import { createPageMetadata } from "../../../lib/metadata";
import { getFixtureForSeo, getMatchDetailForSeo } from "../../../lib/seo-data";
import { absoluteUrl } from "../../../lib/site";
import MatchPageInner from "./MatchInner";

type MatchPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ squad?: string | string[] }>;
};

const eventStatus: Record<string, string> = {
  scheduled: "https://schema.org/EventScheduled",
  live: "https://schema.org/EventInProgress",
  finished: "https://schema.org/EventCompleted",
  postponed: "https://schema.org/EventPostponed",
  cancelled: "https://schema.org/EventCancelled",
};

export async function generateMetadata({ params }: MatchPageProps): Promise<Metadata> {
  const { id } = await params;
  const fixture = await getFixtureForSeo(id);

  if (!fixture) {
    return createPageMetadata({
      title: "World Cup match pool",
      description: "Follow the match, pool movement, and final outcome on Whistle.",
      path: `/match/${encodeURIComponent(id)}`,
      index: false,
    });
  }

  const matchup = `${fixture.home.name} vs ${fixture.away.name}`;
  const competition = fixture.competition || "World Cup 2026";
  return createPageMetadata({
    title: `${matchup} — match pool, kickoff and live score`,
    description: `Follow ${matchup} in ${competition}: kickoff, model forecast, expected goals, parimutuel pool movement, live status, and the final result.`,
    path: `/match/${encodeURIComponent(fixture.id)}`,
  });
}

export default async function MatchPage({ params, searchParams }: MatchPageProps) {
  const { id } = await params;
  const requestedSquad = (await searchParams)?.squad;
  const squadId = Array.isArray(requestedSquad) ? requestedSquad[0] : requestedSquad;
  const initialDetail = squadId
    ? await getMatchDetailForSeo(id, squadId)
    : await getMatchDetailForSeo(id);

  if (!initialDetail) notFound();

  const { fixture } = initialDetail;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${fixture.home.name} vs ${fixture.away.name}`,
    description: `${fixture.competition || "World Cup 2026"} football match and Whistle prediction pool.`,
    url: absoluteUrl(`/match/${encodeURIComponent(fixture.id)}`),
    mainEntityOfPage: absoluteUrl(`/match/${encodeURIComponent(fixture.id)}`),
    sport: "Football",
    startDate: new Date(fixture.kickoffTs).toISOString(),
    eventStatus: eventStatus[fixture.status] || "https://schema.org/EventScheduled",
    homeTeam: {
      "@type": "SportsTeam",
      name: fixture.home.name,
      ...(fixture.home.logo?.startsWith("https://") ? { logo: fixture.home.logo } : {}),
    },
    awayTeam: {
      "@type": "SportsTeam",
      name: fixture.away.name,
      ...(fixture.away.logo?.startsWith("https://") ? { logo: fixture.away.logo } : {}),
    },
    ...(fixture.venue
      ? {
          location: {
            "@type": "Place",
            name: fixture.venue,
          },
        }
      : {}),
  };

  return (
    <>
      <JsonLd data={structuredData} />
      <MatchPageInner
        key={`${id}:${squadId || "public"}`}
        fixtureId={id}
        squadId={squadId}
        initialDetail={initialDetail}
      />
    </>
  );
}
