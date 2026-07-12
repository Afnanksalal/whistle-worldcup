import Link from "next/link";
import { createPageMetadata } from "../../lib/metadata";

export const metadata = createPageMetadata({
  title: "Privacy Policy",
  description: "How Whistle handles wallet, product, and service data.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <main className="legal-page" id="main-content">
      <header className="legal-hero">
        <p className="legal-eyebrow">Trust centre</p>
        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-effective">Effective July 13, 2026</p>
        <p className="legal-summary">
          This policy describes the information Whistle uses to run match pools,
          keep the service reliable, and explain what remains public when a wallet
          or blockchain is involved.
        </p>
      </header>

      <div className="legal-layout">
        <nav className="legal-toc" aria-label="On this page">
          <p className="legal-toc-label">On this page</p>
          <ol className="legal-toc-list">
            <li><a href="#scope">Scope</a></li>
            <li><a href="#collect">Information used</a></li>
            <li><a href="#purpose">How it is used</a></li>
            <li><a href="#public">Public data</a></li>
            <li><a href="#sharing">Sharing</a></li>
            <li><a href="#retention">Retention and security</a></li>
            <li><a href="#choices">Your choices</a></li>
            <li><a href="#privacy-contact">Contact</a></li>
          </ol>
        </nav>

        <article className="legal-content">
          <section className="legal-section" id="scope">
            <h2>1. Scope</h2>
            <p>
              This policy applies to the Whistle web product and its supporting
              application programming interfaces. Third-party wallets, public
              blockchains, data feeds, RSS publishers, and linked websites have
              their own privacy practices.
            </p>
          </section>

          <section className="legal-section" id="collect">
            <h2>2. Information Whistle uses</h2>
            <h3>Wallet and product activity</h3>
            <p>
              If you connect a wallet, Whistle receives its public address. The
              product may associate that address with activity such as pool picks,
              play-unit stakes, claims, refunds, and squad participation so it can
              show your positions and maintain the ledger. Whistle does not need
              or request your private key or recovery phrase.
            </p>
            <h3>Service and device information</h3>
            <p>
              Like most web services, hosting and application systems may process
              standard request data such as IP address, browser type, timestamps,
              requested pages, diagnostic events, and security logs. This is used
              to deliver, protect, debug, and improve the product.
            </p>
            <h3>Sports, news, and generated content</h3>
            <p>
              Whistle processes match schedules and results, pool activity,
              reference odds, and public RSS article data. AI-assisted summaries
              may use match, pool, odds, and public-news signals. They are not
              intended to use a participant’s wallet identity as an input.
            </p>
          </section>

          <section className="legal-section" id="purpose">
            <h2>3. How information is used</h2>
            <p>Whistle uses information to:</p>
            <ul>
              <li>display fixtures, pools, positions, squads, and play-unit balances;</li>
              <li>lock, validate, settle, void, refund, and audit pool activity;</li>
              <li>provide relevant match news and evidence-based summaries;</li>
              <li>detect abuse, investigate errors, and secure the service;</li>
              <li>measure reliability and improve product performance; and</li>
              <li>meet applicable legal obligations.</li>
            </ul>
          </section>

          <section className="legal-section" id="public">
            <h2>4. Wallets and public-chain visibility</h2>
            <div className="legal-callout">
              <h3>Public means public</h3>
              <p>
                A wallet address is pseudonymous, not necessarily anonymous.
                Addresses, transactions, balances, and program interactions
                written to a public blockchain can be viewed, copied, and
                analysed by anyone and may be effectively permanent.
              </p>
            </div>
            <p>
              Whistle cannot erase or control records maintained by a public
              blockchain. Avoid using a wallet whose public activity you do not
              want associated with your participation.
            </p>
          </section>

          <section className="legal-section" id="sharing">
            <h2>5. When information is shared</h2>
            <p>
              Whistle does not sell personal information. Limited information may
              be processed by infrastructure, wallet, sports-data, news-feed, and
              AI service providers where needed to operate their part of the
              product. Information may also be disclosed when reasonably required
              by law, to protect rights and safety, or to investigate abuse.
            </p>
            <p>
              Public pool totals and other aggregated product signals may be shown
              to all participants. Wallet-specific positions should be treated as
              associated with a public identifier even when the interface does not
              show them globally.
            </p>
          </section>

          <section className="legal-section" id="retention">
            <h2>6. Retention and security</h2>
            <p>
              Product and service data is retained for as long as reasonably
              needed to run the ledger, preserve pool integrity, resolve disputes,
              protect the service, and satisfy applicable obligations. Retention
              can differ by data type; public-chain records are outside Whistle’s
              control.
            </p>
            <p>
              Whistle uses practical safeguards appropriate to the current product,
              but no web service, wallet, or blockchain system can guarantee
              perfect security. Protect your device and wallet, verify prompts,
              and never share private keys or recovery phrases.
            </p>
          </section>

          <section className="legal-section" id="choices">
            <h2>7. Your choices</h2>
            <p>
              You can use public match and news views without connecting a wallet.
              You can disconnect a wallet through your wallet software, clear
              browser storage through browser settings, and stop using the product.
            </p>
            <p>
              Depending on where you live, you may have legal rights concerning
              personal information. Requests can be raised through the project
              repository. Some requests may require proof that you control the
              relevant wallet, and public-chain records cannot be changed by Whistle.
            </p>
            <p>
              Whistle is intended for adults. If you are under 18, do not connect
              a wallet or participate in pools. See
              {" "}<Link href="/responsible-play">Responsible Play</Link>.
            </p>
          </section>

          <section className="legal-section" id="privacy-contact">
            <h2>8. Changes and contact</h2>
            <p>
              This policy may be revised as the product and its providers change.
              The effective date above will identify the current version.
              Privacy questions or requests can be raised through the
              {" "}<a href="https://github.com/Afnanksalal/whistle-worldcup" target="_blank" rel="noreferrer">Whistle project repository</a>.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
