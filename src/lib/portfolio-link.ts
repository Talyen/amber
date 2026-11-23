export function parsePortfolioHoldings(
  value: string,
  knownTickers: ReadonlyMap<string, unknown>
) {
  const holdings = new Map<string, number>();
  for (const pair of value.split(",")) {
    const [rawTicker, rawWeight] = pair.split(":");
    const ticker = rawTicker.trim().toUpperCase();
    if (!knownTickers.has(ticker) || holdings.has(ticker)) continue;

    const weight = rawWeight?.trim() ? Number(rawWeight) : 10;
    holdings.set(ticker, Number.isFinite(weight) && weight >= 0 ? weight : 10);
  }
  return holdings;
}

export function serializePortfolioHoldings(weights: ReadonlyMap<string, number>) {
  return [...weights].map(([ticker, weight]) => `${ticker}:${weight * 100}`).join(",");
}
