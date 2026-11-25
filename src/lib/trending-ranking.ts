import type { SearchIndexEntry } from "../data/search-index.ts";

export interface TrendingTickerItem {
  ticker: string;
  name: string;
  reason: "Trending" | "Insider Buy" | "Most Watched";
}

export interface TrendingSignalInputs {
  yahooSymbols: string[];
  recentBuyTickers: string[];
  communityTickers: string[];
}

export const FALLBACK_BELLWETHERS = [
  "NVDA",
  "AAPL",
  "MSFT",
  "AMZN",
  "TSLA",
  "META",
  "PLTR",
  "GOOGL",
  "AMD",
  "AVGO",
  "JPM",
  "NFLX",
];

// Market cap floors (in $M) so obscure small/mid-cap tickers don't hijack "Trending".
export const MIN_YAHOO_MARKET_CAP_M = 35_000; // $35B+
export const MIN_INSIDER_BUY_MARKET_CAP_M = 30_000; // $30B+
export const MIN_INSIDER_BUY_VALUE_M = 0.5; // $500K+ open-market purchase
export const INSIDER_BUY_LOOKBACK_DAYS = 30;
export const MIN_COMMUNITY_MARKET_CAP_M = 50_000; // $50B+
export const MIN_WATCHLIST_USERS = 3;
export const MIN_ARENA_POSITIONS = 5;

const MAX_YAHOO_SLOTS = 7;
const MAX_INSIDER_BUY_SLOTS = 2;
const MAX_COMMUNITY_SLOTS = 2;
const TOTAL_TRENDING_SLOTS = 10;

function normalizeTicker(rawSym: string): string {
  const sym = rawSym.trim().toUpperCase();
  return sym === "GOOG" ? "GOOGL" : sym;
}

/**
 * Pure ranking/filtering logic for trending tickers.
 * - Filters Yahoo Finance trending candidates to recognizable large-cap companies
 *   and blends Yahoo position with market-cap prominence so mega-cap movers aren't
 *   crowded out by smaller specialty names.
 * - Caps secondary DB signals per source so an upstream Yahoo outage doesn't fill
 *   90% of the strip with random insider buys.
 * - Backfills remaining slots with liquid market bellwethers.
 */
export function rankTrendingTickers(
  entries: Pick<SearchIndexEntry, "ticker" | "name" | "marketCap">[],
  inputs: TrendingSignalInputs
): TrendingTickerItem[] {
  const byTicker = new Map(entries.map((e) => [e.ticker, e]));
  const trending: TrendingTickerItem[] = [];
  const seen = new Set<string>();

  const pushIfValid = (
    rawSym: string,
    reason: TrendingTickerItem["reason"],
    minMarketCapM = 0
  ): boolean => {
    const sym = normalizeTicker(rawSym);
    const entry = byTicker.get(sym);
    if (!entry || seen.has(sym)) return false;
    if (entry.marketCap < minMarketCapM) return false;
    seen.add(sym);
    trending.push({
      ticker: sym,
      name: entry.name,
      reason,
    });
    return true;
  };

  // 1. Live Yahoo Finance US Market Trending Tickers (filtered & prominence-weighted)
  const yahooCandidates: Array<{ sym: string; score: number }> = [];
  const yahooSeen = new Set<string>();
  inputs.yahooSymbols.forEach((rawSym, index) => {
    const sym = normalizeTicker(rawSym);
    if (yahooSeen.has(sym)) return;
    const entry = byTicker.get(sym);
    if (!entry || entry.marketCap < MIN_YAHOO_MARKET_CAP_M) return;
    yahooSeen.add(sym);

    // Preserve Yahoo's live trending order while boosting mega-caps ($100B+)
    // over smaller $35B-$50B names further up the raw Yahoo list.
    const rankScore = Math.max(0, 25 - index);
    const sizeBonus = Math.log10(Math.max(1, entry.marketCap)) * 8;
    yahooCandidates.push({ sym, score: rankScore + sizeBonus });
  });

  yahooCandidates.sort((a, b) => b.score - a.score);
  let yahooAdded = 0;
  for (const candidate of yahooCandidates) {
    if (yahooAdded >= MAX_YAHOO_SLOTS) break;
    if (pushIfValid(candidate.sym, "Trending", MIN_YAHOO_MARKET_CAP_M)) {
      yahooAdded++;
    }
  }

  // 2. Recent high-conviction large-cap open-market insider buys (strictly capped)
  let buysAdded = 0;
  for (const sym of inputs.recentBuyTickers) {
    if (
      buysAdded >= MAX_INSIDER_BUY_SLOTS ||
      trending.length >= TOTAL_TRENDING_SLOTS
    ) {
      break;
    }
    if (pushIfValid(sym, "Insider Buy", MIN_INSIDER_BUY_MARKET_CAP_M)) {
      buysAdded++;
    }
  }

  // 3. Community Watchlist / Arena signals (strictly capped, large-cap only)
  let communityAdded = 0;
  for (const sym of inputs.communityTickers) {
    if (
      communityAdded >= MAX_COMMUNITY_SLOTS ||
      trending.length >= TOTAL_TRENDING_SLOTS
    ) {
      break;
    }
    if (pushIfValid(sym, "Most Watched", MIN_COMMUNITY_MARKET_CAP_M)) {
      communityAdded++;
    }
  }

  // 4. Guarantee 10 recognizable trending items using liquid bellwethers
  for (const f of FALLBACK_BELLWETHERS) {
    if (trending.length >= TOTAL_TRENDING_SLOTS) break;
    pushIfValid(f, "Trending");
  }

  return trending.slice(0, TOTAL_TRENDING_SLOTS);
}
