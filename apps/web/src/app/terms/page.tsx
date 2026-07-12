import Link from "next/link";
import { createPageMetadata } from "../../lib/metadata";

export const metadata = createPageMetadata({
  title: "Terms of Use",
  description: "The terms that govern use of the Whistle prediction product.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <main className="legal-page" id="main-content">
      <header className="legal-hero">
        <p className="legal-eyebrow">Trust centre</p>
        <h1 className="legal-title">Terms of Use</h1>
        <p className="legal-effective">Effective July 13, 2026</p>
        <p className="legal-summary">
          These terms explain the rules for using Whistle. The short version:
          this release is a World Cup prediction product using play units, not a
          promise of profit or a cash account.
        </p>
      </header>

      <div className="legal-layout">
        <nav className="legal-toc" aria-label="On this page">
          <p className="legal-toc-label">On this page</p>
          <ol className="legal-toc-list">
            <li><a href="#acceptance">Acceptance</a></li>
            <li><a href="#eligibility">Eligibility</a></li>
            <li><a href="#product">How Whistle works</a></li>
            <li><a href="#wallets">Wallets and public data</a></li>
            <li><a href="#content">News and AI content</a></li>
            <li><a href="#conduct">Acceptable use</a></li>
            <li><a href="#availability">Availability and risk</a></li>
            <li><a href="#contact">Contact and changes</a></li>
          </ol>
        </nav>

        <article className="legal-content">
          <section className="legal-section" id="acceptance">
            <h2>1. Acceptance</h2>
            <p>
              By accessing or using Whistle, you agree to these Terms of Use and
              the <Link href="/privacy">Privacy Policy</Link>. If you do not
              agree, do not use the product.
            </p>
          </section>

          <section className="legal-section" id="eligibility">
            <h2>2. Eligibility and local rules</h2>
            <p>
              You must be at least 18 years old and legally able to agree to
              these terms. You are responsible for checking whether prediction
              products are permitted where you live and for following applicable
              laws. Whistle is not offered where its use would be unlawful.
            </p>
          </section>

          <section className="legal-section" id="product">
            <h2>3. How Whistle works</h2>
            <p>
              Whistle offers parimutuel World Cup prediction pools. The share of
              a settled pool shown to a participant depends on the pool rules,
              the final outcome, and participation on each side. Estimates can
              change until a pool locks.
            </p>
            <div className="legal-callout">
              <h3>Play-unit release</h3>
              <p>
                The current product records stakes, returns, and refunds in a
                play-unit ledger. Play units are not currency, have no guaranteed
                monetary value, cannot be redeemed for cash through Whistle, and
                should not be treated as an investment.
              </p>
            </div>
            <p>
              TxLINE is the primary sports-data source when it is configured. A
              pool can settle only from a canonical TxLINE final record that
              passes the product’s validation requirements. A public fallback
              feed may keep the schedule visible, but its scores do not verify
              settlement. If a result cannot be verified safely, the affected
              pool may be voided and its play units refunded.
            </p>
            <p>
              Match times, pool status, estimated returns, results, and other
              product information can be delayed, corrected, or unavailable.
              No displayed outcome or return is guaranteed until the product
              records a valid settlement.
            </p>
          </section>

          <section className="legal-section" id="wallets">
            <h2>4. Wallets and public-chain data</h2>
            <p>
              You control your wallet, private keys, and recovery phrase. Whistle
              will never ask for a private key or recovery phrase. Review every
              wallet prompt before approving it; connecting a wallet does not
              make Whistle a custodian of that wallet.
            </p>
            <p>
              Wallet addresses and transactions written to a public blockchain
              are public by design and may remain available permanently. Network
              fees, wallet software, and blockchain availability are controlled
              by third parties. See the <Link href="/privacy">Privacy Policy</Link>
              for more information.
            </p>
          </section>

          <section className="legal-section" id="content">
            <h2>5. News, odds, and AI-assisted content</h2>
            <p>
              News links and article metadata may come from public RSS feeds.
              Odds, statistics, pool movement, and AI-assisted match summaries
              are informational signals only. They may be incomplete, delayed,
              or wrong, and they are not financial, betting, or legal advice.
              Always make your own decision.
            </p>
            <p>
              Third-party articles, feeds, wallets, data providers, and websites
              operate under their own terms. A link or reference does not mean
              Whistle endorses their content.
            </p>
          </section>

          <section className="legal-section" id="conduct">
            <h2>6. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>use Whistle for unlawful, fraudulent, or abusive activity;</li>
              <li>manipulate pools, identities, results, feeds, or access controls;</li>
              <li>interfere with the product, overload it, or probe it without permission;</li>
              <li>impersonate another person or misrepresent wallet ownership; or</li>
              <li>copy or exploit the product in violation of applicable rights or repository licences.</li>
            </ul>
            <p>
              Access may be limited or removed when reasonably necessary to
              protect participants, product integrity, or legal compliance.
            </p>
          </section>

          <section className="legal-section" id="availability">
            <h2>7. Availability, disclaimers, and responsibility</h2>
            <p>
              Whistle is an evolving competition project provided on an “as is”
              and “as available” basis. To the extent permitted by law, there are
              no warranties that it will be uninterrupted, error-free, secure,
              or suitable for a particular purpose.
            </p>
            <p>
              You remain responsible for your decisions, wallet security, device,
              connectivity, taxes, and compliance obligations. Do not rely on
              Whistle as financial advice or as a guaranteed source of returns.
              Nothing in these terms excludes rights or liability that cannot
              legally be excluded.
            </p>
            <p>
              For safer participation habits, read our
              {" "}<Link href="/responsible-play">Responsible Play guide</Link>.
            </p>
          </section>

          <section className="legal-section" id="contact">
            <h2>8. Changes and contact</h2>
            <p>
              These terms may change as the product changes. The effective date
              above will be updated when a revised version is published. Material
              changes may also be highlighted in the product or project repository.
            </p>
            <p>
              Questions or concerns can be raised through the
              {" "}<a href="https://github.com/Afnanksalal/whistle-worldcup" target="_blank" rel="noreferrer">Whistle project repository</a>.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
