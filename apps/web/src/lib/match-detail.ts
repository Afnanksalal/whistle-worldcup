import type {
  Fixture,
  InsightCard,
  LiveScoreUpdate,
  MatchForecast,
  MatchInfo,
  MarketPool,
  MatchStats,
  OddsQuote,
  PricePoint,
} from "@whistle/shared";

export type MatchDetail = {
  fixture: Fixture;
  serverNow?: number;
  live?: LiveScoreUpdate;
  odds: OddsQuote[];
  markets: MarketPool[];
  priceHistory?: Record<string, PricePoint[]>;
  stats?: MatchStats | null;
  matchInfo?: MatchInfo | null;
  insights?: InsightCard[];
  forecast?: MatchForecast | null;
};
