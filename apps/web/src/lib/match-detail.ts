import type {
  Fixture,
  InsightCard,
  LiveScoreUpdate,
  MatchForecast,
  MarketPool,
  MatchStats,
  OddsQuote,
  PricePoint,
} from "@whistle/shared";

export type MatchDetail = {
  fixture: Fixture;
  live?: LiveScoreUpdate;
  odds: OddsQuote[];
  markets: MarketPool[];
  priceHistory?: Record<string, PricePoint[]>;
  stats?: MatchStats | null;
  insights?: InsightCard[];
  forecast?: MatchForecast | null;
};
