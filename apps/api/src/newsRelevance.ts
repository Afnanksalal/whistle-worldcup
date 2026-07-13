const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 7 * DAY_MS;
const MAX_FUTURE_MS = 2 * 60 * 60 * 1000;

type NewsArticleForRelevance = {
  title: string;
  description: string | null;
  publishedAt: string;
};

const WORLD_CUP = /\bworld[\s-]+cup\b/i;
const CURRENT_WORLD_CUP_EDITION =
  /\b(?:2026\s+(?:fifa\s+)?world[\s-]+cup|(?:fifa\s+)?world[\s-]+cup\s+2026)\b/i;
const CURRENT_CONTEXT =
  /\b(?:this (?:world cup|tournament)|current tournament|this summer(?:'s)?|world cup so far|world cup (?:run|journey|campaign|exit)|group stage|knockout (?:stage|matches?)|round of (?:16|32)|last (?:16|eight)|quarter[\s-]?finals?|semi[\s-]?(?:finals?|finalists?)|third[\s-]?place play[\s-]?off|final|bid to win|match(?:day)?|match reports?|match preview|preview|reports?|analysis|highlights?|tactics?|tactical|line[\s-]?ups?|squads?|team news|fixtures?|results?|bracket|route to|road to|live|as it happened|latest)\b/i;
const EDITION_BEFORE_WORLD_CUP =
  /\b((?:19|20)\d{2})\s+(?:fifa\s+)?world[\s-]+cup\b/gi;
const EDITION_AFTER_WORLD_CUP =
  /\bworld[\s-]+cup(?:\s+(?:edition|in|for|plans? for|hosts? in|set for))?[\s:\u2013\u2014-]+((?:19|20)\d{2})\b/gi;
const RETROSPECTIVE_FRAMING =
  /\b(?:archive|from the archives|retrospective|rewind|throwback|on this day|look(?:ing)? back|relive|remember(?:ing)?|nostalgia|where are they now|classic match|greatest (?:games?|matches?|moments?)|history of|years? ago|quiz)\b/i;
const EXCLUDED_VARIANT =
  /\b(?:club world[\s-]+cup|world[\s-]+cup for clubs|women's world[\s-]+cup|world[\s-]+cup women's|uswnt|lionesses|matildas|u[\s-]?(?:17|20) world[\s-]+cup|under[\s-]?(?:17|20) world[\s-]+cup|youth world[\s-]+cup|junior world[\s-]+cup)\b/i;
const EXCLUDED_AUDIENCE =
  /\b(?:women(?:'s)?|uswnt|wnt|lionesses|matildas|u[\s-]?(?:17|20|21|23)|under[\s-]?(?:17|20|21|23)|youth|junior)\b/i;
const OTHER_SPORT =
  /\b(?:cricket|rugby(?: union| league)?|field hockey|ice hockey|basketball|baseball|softball|netball|darts|futsal|handball|lacrosse)\b/i;
const TRANSFER_TRANSACTION_TITLE =
  /\btransfer(?:s| window)?\b|\bagree(?:s|d|ing)?\s+(?:(?:a|the|new|personal)\s+|(?:£|\$|€)\d+(?:\.\d+)?(?:m|bn)?\s+){0,3}(?:deal|terms)\b|\bworking on\s+(?:(?:a|the|new)\s+)?deal\b|\b(?:hold|holds|held|holding)\s+(?:transfer\s+)?talks?\b|\bin (?:advanced\s+)?talks?\b|\b(?:sign|signs|signed|signing)\b(?!\s+of\b)|\b(?:new contract|contract extension|loan move|transfer fee|undergoes? (?:a )?medical|plots? (?:a )?move)\b/i;
const NON_TRANSFER_SIGN_TITLE =
  /\bsigns?\s+(?:of|point|suggest|indicate|show|emerge|that)\b/i;
const TRANSFER_ADDITIONAL_TITLE =
  /\brelease clause\b|\b(?:bid|move) for\b|\bmove to\b|\blinked with\b|\binterest in\b|\bclose(?:s|d|ing)? in on\b|\b(?:set|poised|ready) to sign\b|\b(?:signs?|signed|signing) (?:for|with|from|at)\b/i;
const TRANSFER_SCOUTING_TITLE =
  /\b(?:eye(?:s|d|ing)?|target(?:s|ed|ing)?|plot(?:s|ted|ting)?|pursue(?:s|d|ing)?)\b(?!\s+(?:injury|problem|issue|test|socket)\b).{0,48}\b(?:midfielder|striker|forward|defender|goalkeeper|keeper|winger|star|player|talent|international)\b/i;
const CLUB_COMPETITION_TITLE =
  /\b(?:premier league|champions league|europa league|conference league|la liga|serie a|bundesliga|ligue 1|major league soccer|mls|fa cup|copa del rey|coppa italia|dfb[\s-]?pokal)\b/i;
const CLUB_TITLE =
  /\b(?:psg|paris saint[\s-]?germain|manchester (?:united|city)|man utd|chelsea|arsenal|liverpool|tottenham|newcastle|aston villa|real madrid|barcelona|atletico madrid|bayern(?: munich)?|borussia dortmund|juventus|inter milan|ac milan|napoli|al hilal|flamengo|palmeiras|\w+ fc)\b/i;

function normalizeText(value: string | null): string {
  return (value || "")
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function referencesNonCurrentEdition(text: string): boolean {
  for (const pattern of [EDITION_BEFORE_WORLD_CUP, EDITION_AFTER_WORLD_CUP]) {
    for (const match of text.matchAll(pattern)) {
      if (match[1] !== "2026") return true;
    }
  }
  return false;
}

/**
 * Conservative tournament gate for public RSS stories. It deliberately uses
 * article text and publication time rather than trusting a publisher's feed path.
 */
export function isCurrentWorldCupArticle(
  article: NewsArticleForRelevance,
  now: number
): boolean {
  if (!Number.isFinite(now)) return false;
  const publishedAt = Date.parse(article.publishedAt);
  if (!Number.isFinite(publishedAt)) return false;
  if (publishedAt < now - MAX_AGE_MS || publishedAt > now + MAX_FUTURE_MS) {
    return false;
  }

  const title = normalizeText(article.title);
  const description = normalizeText(article.description);
  const text = `${title} ${description}`.trim();
  if (!title || !WORLD_CUP.test(text)) return false;

  if (EXCLUDED_VARIANT.test(text) || EXCLUDED_AUDIENCE.test(text)) return false;
  if (OTHER_SPORT.test(text)) return false;
  if (referencesNonCurrentEdition(title)) return false;
  if (RETROSPECTIVE_FRAMING.test(text)) return false;

  // A club or transfer headline remains a club story even when an RSS summary
  // happens to mention a player's World Cup record.
  const hasTransferTransactionTitle =
    TRANSFER_TRANSACTION_TITLE.test(title) &&
    !NON_TRANSFER_SIGN_TITLE.test(title);
  if (
    hasTransferTransactionTitle ||
    TRANSFER_ADDITIONAL_TITLE.test(title) ||
    TRANSFER_SCOUTING_TITLE.test(title) ||
    CLUB_COMPETITION_TITLE.test(title)
  ) {
    return false;
  }
  const hasClubTitle = CLUB_TITLE.test(title);
  const currentTournamentInTitle =
    WORLD_CUP.test(title) && CURRENT_CONTEXT.test(title);
  if (hasClubTitle && !currentTournamentInTitle) return false;

  return CURRENT_WORLD_CUP_EDITION.test(text) || CURRENT_CONTEXT.test(text);
}
