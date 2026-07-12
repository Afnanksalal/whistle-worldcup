import { impliedShares, type PricePoint } from "@whistle/shared";
import { getState, mutate } from "../store";

const MAX_POINTS = 240;

export function recordMarketPrice(marketId: string) {
  const market = getState().markets[marketId];
  if (!market) return;
  const point: PricePoint = {
    ts: Date.now(),
    marketId,
    totalPool: market.totalPool,
    implied: impliedShares(market.outcomes),
    outcomes: { ...market.outcomes },
  };
  mutate((s) => {
    const list = s.priceHistory[marketId] || [];
    const last = list[list.length - 1];
    // Avoid duplicate stamps when nothing moved
    if (
      last &&
      last.totalPool === point.totalPool &&
      JSON.stringify(last.implied) === JSON.stringify(point.implied) &&
      point.ts - last.ts < 15_000
    ) {
      return;
    }
    list.push(point);
    s.priceHistory[marketId] = list.slice(-MAX_POINTS);
  }, "price", point);
}

export function snapshotAllOpenMarkets() {
  for (const m of Object.values(getState().markets)) {
    if (m.status === "open" || m.status === "locked") {
      recordMarketPrice(m.id);
    }
  }
}

export function priceHistoryForMarket(marketId: string): PricePoint[] {
  return getState().priceHistory[marketId] || [];
}

export function priceHistoryForFixture(fixtureId: string): Record<string, PricePoint[]> {
  const out: Record<string, PricePoint[]> = {};
  for (const m of Object.values(getState().markets)) {
    if (m.fixtureId !== fixtureId || m.squadId) continue;
    out[m.id] = priceHistoryForMarket(m.id);
  }
  return out;
}
