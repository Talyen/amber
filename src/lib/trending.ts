import { unstable_cache } from "next/cache";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { arenaPositions, insiderTrades, userWatchlists } from "@/db/schema";
import { getSearchIndex } from "@/data/repository";
import type { SearchIndexEntry } from "@/data/search-index";

export interface TrendingTickerItem {
  ticker: string;
  name: string;
  reason: "Trending" | "Insider Buy" | "Most Watched";
}

const FALLBACK_BELLWETHERS = [
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

async function computeTrendingTickers(
  entries: SearchIndexEntry[]
): Promise<TrendingTickerItem[]> {
  const byTicker = new Map(entries.map((e) => [e.ticker, e]));
  const trending: TrendingTickerItem[] = [];
  const seen = new Set<string>();

  const pushIfValid = (
    rawSym: string,
    reason: TrendingTickerItem["reason"]
  ) => {
    const sym = rawSym === "GOOG" ? "GOOGL" : rawSym.toUpperCase();
    const entry = byTicker.get(sym);
    if (!entry || seen.has(sym)) return;
    seen.add(sym);
    trending.push({
      ticker: sym,
      name: entry.name,
      reason,
    });
  };

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
        if (q.symbol) pushIfValid(q.symbol, "Trending");
        if (trending.length >= 6) break;
      }
    }
  } catch {
    // Fallback gracefully
  }

  // 2. Recent High-Value Open-Market Insider Buys & Community Watchlist/Arena Signals from Neon
  const db = getDb();
  if (db) {
    try {
      const [recentBuys, topWatched, topArena] = await Promise.all([
        db
          .select({ ticker: insiderTrades.ticker })
          .from(insiderTrades)
          .where(eq(insiderTrades.transactionType, "Buy"))
          .orderBy(desc(insiderTrades.filingDate), desc(insiderTrades.totalValue))
          .limit(12),
        db
          .select({
            ticker: userWatchlists.ticker,
            cnt: sql<number>`count(*)`,
          })
          .from(userWatchlists)
          .groupBy(userWatchlists.ticker)
          .orderBy(desc(sql`count(*)`))
          .limit(6),
        db
          .select({
            ticker: arenaPositions.ticker,
            cnt: sql<number>`count(*)`,
          })
          .from(arenaPositions)
          .groupBy(arenaPositions.ticker)
          .orderBy(desc(sql`count(*)`))
          .limit(6),
      ]);

      for (const b of recentBuys) {
        if (trending.length >= 9) break;
        pushIfValid(b.ticker, "Insider Buy");
      }
      for (const w of [...topWatched, ...topArena]) {
        if (trending.length >= 11) break;
        pushIfValid(w.ticker, "Most Watched");
      }
    } catch {
      // Fallback gracefully
    }
  }

  // 3. Guarantee at least 10 trending items using bellwethers
  for (const f of FALLBACK_BELLWETHERS) {
    if (trending.length >= 10) break;
    pushIfValid(f, "Trending");
  }

  return trending.slice(0, 10);
}

const getCachedTrendingTickers = unstable_cache(
  async () => {
    const entries = await getSearchIndex();
    return computeTrendingTickers(entries);
  },
  ["amber-trending-tickers-v1"],
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
