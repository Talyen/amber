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

export interface PortfolioDraft {
  inputMode: "weight" | "dollars";
  holdings: { ticker: string; value: number }[];
}

export function portfolioDraftKey(owner: string | null, params: URLSearchParams) {
  return JSON.stringify(["amber-portfolio-draft", owner, params.get("h"), params.get("add")]);
}

export function parsePortfolioDraft(raw: string | null, knownTickers: ReadonlyMap<string, unknown>): PortfolioDraft | null {
  if (raw === null) return null;
  try {
    const draft = JSON.parse(raw) as PortfolioDraft | null;
    if (!draft || !["weight", "dollars"].includes(draft.inputMode) || !Array.isArray(draft.holdings)) return null;
    const holdings = draft.holdings.filter((item) =>
      item && knownTickers.has(item.ticker) && Number.isFinite(item.value) && item.value >= 0
    );
    if (holdings.length === 0 && draft.holdings.length > 0) return null;
    return { inputMode: draft.inputMode, holdings };
  } catch {
    return null;
  }
}

export function portfolioWeightsUrl(currentUrl: string, weights: ReadonlyMap<string, number>) {
  const url = new URL(currentUrl);
  url.searchParams.set("h", serializePortfolioHoldings(weights));
  url.searchParams.delete("add");
  return url;
}
