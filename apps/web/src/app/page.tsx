import Link from "next/link";
import { FixtureBoard } from "../components/FixtureBoard";
import { HomeNews } from "../components/HomeNews";
import { getHomeInitialData, getNewsInitialData } from "../lib/seo-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [initialData, newsData] = await Promise.all([
    getHomeInitialData(),
    getNewsInitialData(2_500),
  ]);

  return (
    <main id="main-content">
      <FixtureBoard
        initialFixtures={initialData?.fixtures ?? []}
        initialMarkets={initialData?.markets ?? []}
        initialServerNow={initialData?.serverNow}
      />

      <HomeNews articles={newsData?.articles ?? []} />

      <section className="home-squads shell" aria-label="Squads">
        <div>
          <strong>Picking with friends?</strong>
          <span>Create or join a squad leaderboard.</span>
        </div>
        <Link href="/squads" className="btn btn-secondary">
          Open squads <span aria-hidden>↗</span>
        </Link>
      </section>
    </main>
  );
}
