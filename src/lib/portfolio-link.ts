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

export function serializePortfolioHoldings(
  weights: ReadonlyMap<string, number>,
  unit: "fraction" | "percent" = "fraction"
) {
  const scale = unit === "fraction" ? 100 : 1;
  return [...weights].map(([ticker, weight]) => `${ticker}:${weight * scale}`).join(",");
}

export function arenaPortfolioAnalysisHref(
  positions: readonly { ticker: string; weightPct: number }[]
) {
  const weights = new Map(positions.map(({ ticker, weightPct }) => [ticker, weightPct]));
  return `/portfolio?h=${encodeURIComponent(serializePortfolioHoldings(weights, "percent"))}`;
}
