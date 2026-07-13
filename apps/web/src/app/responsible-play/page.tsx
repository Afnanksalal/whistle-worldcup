import Link from "next/link";
import { createPageMetadata } from "../../lib/metadata";

export const metadata = createPageMetadata({
  title: "Responsible Play",
  description: "Practical guidance for keeping World Cup predictions enjoyable.",
  path: "/responsible-play",
});

export default function ResponsiblePlayPage() {
  return (
    <main className="legal-page legal-page--responsible" id="main-content">
      <header className="legal-hero">
        <p className="legal-eyebrow">Know the limit</p>
        <h1 className="legal-title">Keep it about the football.</h1>
        <p className="legal-effective">Responsible Play · Updated July 13, 2026</p>
        <p className="legal-summary">
          Predictions should add a little tension to the match, not create stress
          away from it. Use Whistle deliberately, take breaks, and never treat a
          pick as a guaranteed result.
        </p>
      </header>

      <article className="legal-content legal-content--wide">
        <section className="legal-section" aria-labelledby="responsible-basics">
          <h2 id="responsible-basics">Start with the facts</h2>
          <div className="legal-principles">
            <div className="legal-principle">
              <p className="legal-principle-number" aria-hidden="true">01</p>
              <h3>Play units are not money</h3>
              <p>
                This release uses a play-unit ledger. Units have no guaranteed
                monetary value and cannot be cashed out through Whistle.
              </p>
            </div>
            <div className="legal-principle">
              <p className="legal-principle-number" aria-hidden="true">02</p>
              <h3>Every prediction can lose</h3>
              <p>
                Form, model forecasts, odds, news, graphs, and AI summaries can
                inform a view; none can make an uncertain match certain.
              </p>
            </div>
            <div className="legal-principle">
              <p className="legal-principle-number" aria-hidden="true">03</p>
              <h3>Adults only</h3>
              <p>
                You must be 18 or older and permitted to use prediction products
                where you live.
              </p>
            </div>
          </div>
        </section>

        <section className="legal-section">
          <h2>A simple matchday routine</h2>
          <ol className="legal-steps">
            <li>
              <h3>Choose a limit before kickoff</h3>
              <p>
                Decide how much time and how many play units you are comfortable
                using. Do not increase that limit because a previous pick lost.
              </p>
            </li>
            <li>
              <h3>Make the pick for entertainment</h3>
              <p>
                Do not participate to solve money problems, recover losses, prove
                expertise, or change your mood.
              </p>
            </li>
            <li>
              <h3>Let the final whistle end it</h3>
              <p>
                Review the result, then step away. If participation feels urgent
                or frustrating, skip the next match.
              </p>
            </li>
          </ol>
        </section>

        <section className="legal-section">
          <h2>Know the warning signs</h2>
          <p>Pause participation if you notice yourself:</p>
          <ul>
            <li>chasing a loss or repeatedly raising your intended limit;</li>
            <li>hiding activity or feeling guilt, anxiety, anger, or sleeplessness;</li>
            <li>letting predictions interfere with work, study, relationships, or bills;</li>
            <li>borrowing, selling possessions, or using essential funds to participate; or</li>
            <li>feeling unable to stop even when the experience is no longer enjoyable.</li>
          </ul>
          <div className="legal-callout legal-callout--support">
            <h3>It is always okay to stop</h3>
            <p>
              Disconnect your wallet, leave the site, and speak with someone you
              trust. If prediction or gambling behaviour is causing harm, contact
              a qualified local support service. If you or someone else is in
              immediate danger, contact local emergency services now.
            </p>
          </div>
        </section>

        <section className="legal-section">
          <h2>Understand the product signals</h2>
          <p>
            Pool movement shows participant positioning, not an objective
            probability. Model forecasts are uncertain estimates based on the
            evidence actually available, and missing player-status data lowers
            their confidence. Reference odds are not a promise. News can become
            outdated, and AI-assisted summaries can miss context or make mistakes.
          </p>
          <p>
            TxLINE is the primary result source when configured. Public fallback
            schedules keep the match board useful but cannot verify settlement.
            When a result cannot be verified safely, the pool may be voided and
            play units refunded. A refund is a safety outcome, not a prediction.
          </p>
        </section>

        <section className="legal-section">
          <h2>Protect your wallet</h2>
          <ul>
            <li>Never share a private key or recovery phrase.</li>
            <li>Read the full wallet prompt before approving anything.</li>
            <li>Remember that public wallet activity can be seen by others.</li>
            <li>Use only wallet software and links you trust.</li>
          </ul>
        </section>

        <section className="legal-section legal-section--closing">
          <h2>More detail</h2>
          <p>
            Read the <Link href="/terms">Terms of Use</Link> and
            {" "}<Link href="/privacy">Privacy Policy</Link> for how Whistle
            operates and handles information. Product or safety concerns can be
            raised through the
            {" "}<a href="https://github.com/Afnanksalal/whistle-worldcup" target="_blank" rel="noreferrer">Whistle project repository</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
