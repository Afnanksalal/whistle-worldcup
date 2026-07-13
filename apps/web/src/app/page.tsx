import Link from "next/link";
import { FixtureBoard } from "../components/FixtureBoard";
import { getHomeInitialData } from "../lib/seo-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialData = await getHomeInitialData();

  return (
    <main id="main-content">
      <FixtureBoard
        initialFixtures={initialData?.fixtures ?? []}
        initialMarkets={initialData?.markets ?? []}
      />

      <section className="pool-explainer" aria-labelledby="pool-title">
        <div className="shell pool-explainer-grid">
          <div className="pool-explainer-intro">
            <p className="section-kicker">Parimutuel, in plain English</p>
            <h2 id="pool-title">The crowd sets the return.</h2>
            <p>
              There are no fixed house odds. Every pick joins one shared match pool, and
              winners split it in proportion to their stake.
            </p>
            <Link href="/positions" className="text-link">
              See how payouts land <span aria-hidden>→</span>
            </Link>
          </div>

          <ol className="pool-steps">
            <li>
              <span>Before kickoff</span>
              <strong>Choose the result</strong>
              <p>Home, draw, away—or the goals line. Your preview updates before you confirm.</p>
            </li>
            <li>
              <span>While fans join</span>
              <strong>The pool moves</strong>
              <p>Your final return depends on the completed pool, so every new pick can shift it.</p>
            </li>
            <li>
              <span>At full time</span>
              <strong>Winner shares are paid</strong>
              <p>Verified result, clear receipt, then straight on to the next kickoff.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="home-close shell">
        <div>
          <p className="section-kicker">Bring the group chat</p>
          <h2>A private table for your squad.</h2>
          <p>Use the same match pools with a shared leaderboard for your friends.</p>
        </div>
        <Link href="/squads" className="btn btn-inverse">
          Open squads <span aria-hidden>→</span>
        </Link>
      </section>

    </main>
  );
}
