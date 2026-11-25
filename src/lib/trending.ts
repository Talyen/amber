import { unstable_cache } from "next/cache";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { arenaPositions, insiderTrades, userWatchlists } from "@/db/schema";
import { getSearchIndex } from "@/data/repository";
import type { SearchIndexEntry } from "@/data/search-index";
import {
  INSIDER_BUY_LOOKBACK_DAYS,
  MIN_ARENA_POSITIONS,
  MIN_INSIDER_BUY_VALUE_M,
  MIN_WATCHLIST_USERS,
  rankTrendingTickers,
  type TrendingTickerItem,
} from "@/lib/trending-ranking";

export { rankTrendingTickers, type TrendingTickerItem };

async function computeTrendingTickers(
  entries: SearchIndexEntry[]
): Promise<TrendingTickerItem[]> {
  const yahooSymbols: string[] = [];
  const recentBuyTickers: string[] = [];
  const communityTickers: string[] = [];

  // 1. Live Yahoo Finance US Market Trending Tickers (headline / news-driven momentum)
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/trending/US?count=25",
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 900 },
      }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        finance?: { result?: Array<{ quotes?: Array<{ symbol?: string }> }> };
      };
      const quotes = data.finance?.result?.[0]?.quotes ?? [];
      for (const q of quotes) {
        if (q.symbol) yahooSymbols.push(q.symbol);
      }
    }
  } catch {
    // Fallback gracefully
  }

  // 2. Recent High-Value Open-Market Insider Buys & Community Watchlist/Arena Signals from Neon
  const db = getDb();
  if (db) {
    try {
      const cutoffDate = new Date(
        Date.now() - INSIDER_BUY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .slice(0, 10);

      const [recentBuys, topWatched, topArena] = await Promise.all([
        db
          .select({ ticker: insiderTrades.ticker })
          .from(insiderTrades)
          .where(
            and(
              eq(insiderTrades.transactionType, "Buy"),
              gte(insiderTrades.filingDate, cutoffDate),
              gte(insiderTrades.totalValue, MIN_INSIDER_BUY_VALUE_M)
            )
          )
          .orderBy(desc(insiderTrades.totalValue), desc(insiderTrades.filingDate))
          .limit(15),
        db
          .select({
            ticker: userWatchlists.ticker,
            cnt: sql<number>`count(*)::int`,
          })
          .from(userWatchlists)
          .groupBy(userWatchlists.ticker)
          .having(sql`count(*) >= ${MIN_WATCHLIST_USERS}`)
          .orderBy(desc(sql`count(*)`))
          .limit(6),
        db
          .select({
            ticker: arenaPositions.ticker,
            cnt: sql<number>`count(*)::int`,
          })
          .from(arenaPositions)
          .groupBy(arenaPositions.ticker)
          .having(sql`count(*) >= ${MIN_ARENA_POSITIONS}`)
          .orderBy(desc(sql`count(*)`))
          .limit(6),
      ]);

      for (const b of recentBuys) {
        recentBuyTickers.push(b.ticker);
      }
      for (const w of [...topWatched, ...topArena]) {
        communityTickers.push(w.ticker);
      }
    } catch {
      // Fallback gracefully
    }
  }

  return rankTrendingTickers(entries, {
    yahooSymbols,
    recentBuyTickers,
    communityTickers,
  });
}

const getCachedTrendingTickers = unstable_cache(
  async () => {
    const entries = await getSearchIndex();
    return computeTrendingTickers(entries);
  },
  ["amber-trending-tickers-v2"],
  { revalidate: 900, tags: ["trending", "companies"] }
);

export async function getTrendingTickers(
  entries?: SearchIndexEntry[]
): Promise<TrendingTickerItem[]> {
  if (entries && entries.length > 0 && process.env.NODE_ENV === "test") {
    return computeTrendingTickers(entries);
  }
  return getCachedTrendingTickers();
}
