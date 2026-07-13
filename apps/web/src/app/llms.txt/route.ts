import { absoluteUrl } from "../../lib/site";

export const revalidate = 3600;

export async function GET() {
  const content = `# Whistle

> Whistle is a World Cup 2026 football prediction product built around the matchday loop: schedule → pick → live context → final whistle → settle or refund → next kickoff.

Whistle offers parimutuel prediction pools. Participants choose a match result or goals line; the completed pool determines each winning share. The current public release uses play units with no guaranteed monetary value.

## Public product pages

- [Matches](${absoluteUrl("/")}): upcoming fixtures, pool state, and the next kickoff.
- [Tournament](${absoluteUrl("/groups")}): fixtures, final scores, standings context, and tournament progress.
- [News](${absoluteUrl("/news")}): attributed World Cup headlines linked to their original publishers.
- [Squads](${absoluteUrl("/squads")}): private prediction groups and shared leaderboards.
- [Responsible play](${absoluteUrl("/responsible-play")}): participation and safety guidance.
- [Terms](${absoluteUrl("/terms")}): product terms and play-unit limitations.
- [Privacy](${absoluteUrl("/privacy")}): wallet, service, public-chain, news, and AI data practices.

## Data and settlement truth

- TxLINE is the primary sports-data source when a real token is configured.
- A public TheSportsDB schedule fallback can keep fixtures visible, but fallback scores do not verify settlement.
- Pools settle only from a canonical TxLINE final record that passes validation. If that record is unavailable, the safe outcome is to keep the pool pending or void and refund it.
- Match news comes from attributed public RSS publishers. Whistle links to the source and does not claim authorship.
- Match pages include a deterministic home/draw/away forecast with expected goals, evidence quality, freshness, and explicit coverage gaps. Fan-pool shares are displayed separately and never change the model.
- Groq, when configured, explains only supplied forecast evidence. It cannot set the probabilities, invent player availability, recommend a pick, or settle a pool.
- Forecasts and AI-assisted notes are informational, uncertain, and can be incomplete or wrong.

## Source and technical detail

- [Public repository](https://github.com/Afnanksalal/whistle-worldcup)
- [Full LLM context](${absoluteUrl("/llms-full.txt")})
- [Sitemap](${absoluteUrl("/sitemap.xml")})
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
