export const POPULAR_COMPARE_SLUGS = [
  "NVDA-vs-AMD",
  "PLTR-vs-SNOW",
  "AAPL-vs-MSFT",
  "V-vs-MA",
  "COST-vs-WMT",
  "AMZN-vs-GOOGL",
  "META-vs-NFLX",
  "CRWD-vs-PANW",
  "SNOW-vs-DDOG",
  "UBER-vs-ABNB",
  "CRM-vs-NOW",
  "HD-vs-LOW",
  "AVGO-vs-NVDA",
  "SHOP-vs-AMZN",
  "ADBE-vs-INTU",
  "KO-vs-PEP",
];

export function resolveComparisonTickers(
  slug: string,
  available: ReadonlySet<string>
): string[] {
  const tickers = slug.split(/-vs-/i).map((ticker) => ticker.trim().toUpperCase());
  if (tickers.length < 2 || tickers.length > 4 || new Set(tickers).size !== tickers.length) {
    return [];
  }
  return tickers.every((ticker) => available.has(ticker)) ? tickers : [];
}
