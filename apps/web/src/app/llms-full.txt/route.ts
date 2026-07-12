import { absoluteUrl } from "../../lib/site";

export const revalidate = 3600;

export async function GET() {
  const content = `# Whistle — full product context

## Product

Whistle is a World Cup 2026 match prediction product. Its primary user journey is schedule → stake play units → follow the match and pool → settle at full time or refund when verification is unavailable → move to the next kickoff. It is not a wallet-first dashboard and does not present oracle or proof terminology as the main experience.

Whistle supports parimutuel pools only. There is no automated market maker or order book. A participant's estimated return can change as the pool composition changes. The current release records positions, payouts, and refunds in play units. Play units are not currency, have no guaranteed monetary value, and cannot be redeemed for cash through Whistle.

## Public routes

- ${absoluteUrl("/")} — World Cup fixtures and match pools.
- ${absoluteUrl("/groups")} — tournament road, results, and group context.
- ${absoluteUrl("/news")} — attributed football news links and matchday briefing.
- ${absoluteUrl("/squads")} — explanation and entry point for private squads.
- ${absoluteUrl("/terms")} — Terms of Use.
- ${absoluteUrl("/privacy")} — Privacy Policy.
- ${absoluteUrl("/responsible-play")} — Responsible Play guidance.

Wallet-specific picks, the operations console, and private squad-detail URLs are intentionally excluded from search indexing.

## Public machine-readable endpoints

- ${absoluteUrl("/api/fixtures")} — fixture list with data-source metadata.
- ${absoluteUrl("/api/groups")} — computed group context.
- ${absoluteUrl("/api/markets")} — public pool state.
- ${absoluteUrl("/api/news")} — attributed news metadata.
- ${absoluteUrl("/api/health")} — service health and explicit data/settlement capability flags.
- ${absoluteUrl("/sitemap.xml")} — indexable page inventory.
- ${absoluteUrl("/robots.txt")} — crawler policy.

## Sports data and settlement

TxLINE is the primary schedule, live-data, and result source. When the configured token is missing, placeholder, or unavailable, Whistle can use TheSportsDB to keep the public schedule useful. The fallback is never a settlement authority. A pool can settle only when a canonical TxLINE final record passes the shared deterministic resolution checks. An unverifiable result must remain pending or be voided and refunded.

Shared match-result and goals-line resolution logic lives in @whistle/shared so the API keeper and on-chain program can remain aligned. User-facing states are Open, Locked, Settled, Paid, and Refund rather than implementation-specific proof terminology.

## News and AI

The news desk uses public RSS article metadata from established publishers and links readers to the original article. Whistle does not republish or claim authorship of the full articles. AI-assisted desk notes are generated only from available match, pool, price, statistics, event, table, and news evidence. They are informational signals, not predictions, financial advice, guarantees, or verified probabilities.

## Wallet and privacy boundaries

Public fixture and news pages do not require a wallet. When a wallet is connected, Whistle receives the public address and can associate it with picks, play-unit positions, claims, refunds, and squad participation. Whistle does not need or request private keys or recovery phrases. Public blockchain activity can be visible and effectively permanent.

## Source

- Repository: https://github.com/Afnanksalal/whistle-worldcup
- Architecture: https://github.com/Afnanksalal/whistle-worldcup/blob/master/docs/TECH.md
- Deployment: https://github.com/Afnanksalal/whistle-worldcup/blob/master/docs/DEPLOY.md
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
