type WatchlistRequest =
  | { tickers: string[] }
  | { ticker: string; action: "add" | "remove" | "toggle" }
  | { error: string };

function normalizeTicker(value: unknown) {
  const ticker = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9.-]{1,10}$/.test(ticker) ? ticker : "";
}

export function parseWatchlistRequest(body: unknown): WatchlistRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid JSON payload." };
  }

  const { ticker: value, tickers, action = "toggle" } = body as Record<string, unknown>;
  if (Array.isArray(tickers) && tickers.length > 0) {
    return { tickers: [...new Set(tickers.map(normalizeTicker).filter(Boolean))].slice(0, 30) };
  }

  const ticker = normalizeTicker(value);
  if (!ticker) return { error: "Invalid ticker." };
  if (action !== "add" && action !== "remove" && action !== "toggle") {
    return { error: "Invalid watchlist action." };
  }
  return { ticker, action };
}
