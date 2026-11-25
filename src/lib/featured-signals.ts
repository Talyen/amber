import type { SearchIndexEntry } from "../data/search-index.ts";
import type {
  MarketFilingDiffItem,
  MarketInsiderFeedItem,
} from "../data/repository.ts";

export interface FeaturedSignals {
  featuredDiffs: MarketFilingDiffItem[];
  featuredInsiderBuy: MarketInsiderFeedItem | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXEC_TITLE_PATTERN = /\b(ceo|cfo|coo|chief|pres|president|founder)\b/i;

function ageInDays(dateStr: string, nowMs: number): number {
  const parsed = Date.parse(dateStr);
  if (!Number.isFinite(parsed)) return 365;
  return Math.max(0, (nowMs - parsed) / MS_PER_DAY);
}

function marketCapScore(marketCapM: number): number {
  if (marketCapM >= 100_000) return 22; // $100B+
  if (marketCapM >= 30_000) return 14; // $30B+
  if (marketCapM >= 15_000) return 6; // $15B+
  return -16; // Deprioritize obscure smaller names
}

function scoreFilingDiff(
  diff: MarketFilingDiffItem,
  marketCapM: number,
  trendingRank: number | undefined,
  nowMs: number
): number {
  const age = ageInDays(diff.filingDate, nowMs);

  let score = 0;

  // Recency is primary: avoid surfacing stale filings over fresh ones
  if (age <= 7) score += 40;
  else if (age <= 14) score += 30;
  else if (age <= 30) score += 18;
  else if (age <= 60) score += 6;
  else score -= 24;

  // Trending boost only applies when the filing itself is reasonably fresh
  if (trendingRank !== undefined && age <= 60) {
    score += Math.max(8, 28 - trendingRank * 1.5);
  }

  // Company prominence
  score += marketCapScore(marketCapM);

  // Materiality
  if (diff.materiality === "High") score += 18;
  else if (diff.materiality === "Medium") score += 8;

  return score;
}

function scoreInsiderBuy(
  trade: MarketInsiderFeedItem,
  marketCapM: number,
  trendingRank: number | undefined,
  nowMs: number
): number {
  const age = ageInDays(trade.filingDate, nowMs);

  let score = 0;

  // Recency
  if (age <= 14) score += 35;
  else if (age <= 30) score += 24;
  else if (age <= 60) score += 8;
  else score -= 30;

  // Trending boost when recent
  if (trendingRank !== undefined && age <= 45) {
    score += Math.max(6, 20 - trendingRank);
  }

  // Company prominence
  if (marketCapM >= 100_000) score += 24;
  else if (marketCapM >= 30_000) score += 16;
  else if (marketCapM >= 15_000) score += 6;
  else score -= 18;

  // Dollar conviction ($M)
  if (trade.totalValue >= 5) score += 20;
  else if (trade.totalValue >= 1) score += 14;
  else if (trade.totalValue >= 0.5) score += 8;
  else if (trade.totalValue >= 0.2) score += 3;
  else score -= 10;

  // Executive conviction bonus
  if (EXEC_TITLE_PATTERN.test(trade.insiderTitle)) {
    score += 10;
  }

  return score;
}

/**
 * Selects up to 3 genuine filing & insider-activity cards for the homepage
 * "Trending Filings & Insider Activity" strip:
 * - Up to 2 distinct-ticker SEC filing changes + 1 distinct-ticker Form 4 insider buy
 * - If no qualifying recent insider buy exists, fills up to 3 filing cards
 * - Strictly excludes non-filing / non-insider cards (such as Reverse DCF)
 */
export function selectFeaturedSignals({
  diffs,
  insiders,
  entries,
  trendingTickers,
  now = new Date(),
}: {
  diffs: MarketFilingDiffItem[];
  insiders: MarketInsiderFeedItem[];
  entries: Pick<SearchIndexEntry, "ticker" | "marketCap">[];
  trendingTickers: string[];
  now?: Date;
}): FeaturedSignals {
  const nowMs = now.getTime();
  const marketCapByTicker = new Map(entries.map((e) => [e.ticker, e.marketCap]));
  const trendingRank = new Map(trendingTickers.map((t, idx) => [t, idx]));

  // Rank insider buys first so a standout C-suite / large-cap buy isn't blocked,
  // while keeping tickers distinct across all 3 cards.
  const allBuys = insiders.filter(
    (i) => i.transactionType === "Buy" && i.totalValue > 0
  );
  const qualifyingBuys = allBuys.filter(
    (i) => i.totalValue >= 0.2 && ageInDays(i.filingDate, nowMs) <= 60
  );
  const buyPool = qualifyingBuys.length > 0 ? qualifyingBuys : allBuys;

  const rankedBuys = [...buyPool].sort((a, b) => {
    const scoreDiff =
      scoreInsiderBuy(
        b,
        marketCapByTicker.get(b.ticker) ?? 0,
        trendingRank.get(b.ticker),
        nowMs
      ) -
      scoreInsiderBuy(
        a,
        marketCapByTicker.get(a.ticker) ?? 0,
        trendingRank.get(a.ticker),
        nowMs
      );
    if (scoreDiff !== 0) return scoreDiff;
    return (
      b.filingDate.localeCompare(a.filingDate) || b.totalValue - a.totalValue
    );
  });

  const featuredInsiderBuy = rankedBuys[0] ?? null;

  const rankedDiffs = [...diffs].sort((a, b) => {
    const scoreDiff =
      scoreFilingDiff(
        b,
        marketCapByTicker.get(b.ticker) ?? 0,
        trendingRank.get(b.ticker),
        nowMs
      ) -
      scoreFilingDiff(
        a,
        marketCapByTicker.get(a.ticker) ?? 0,
        trendingRank.get(a.ticker),
        nowMs
      );
    if (scoreDiff !== 0) return scoreDiff;
    return b.filingDate.localeCompare(a.filingDate);
  });

  const targetDiffCount = featuredInsiderBuy ? 2 : 3;
  const featuredDiffs: MarketFilingDiffItem[] = [];
  const usedTickers = new Set<string>();
  if (featuredInsiderBuy) {
    usedTickers.add(featuredInsiderBuy.ticker);
  }

  for (const diff of rankedDiffs) {
    if (featuredDiffs.length >= targetDiffCount) break;
    if (usedTickers.has(diff.ticker)) continue;
    usedTickers.add(diff.ticker);
    featuredDiffs.push(diff);
  }

  return {
    featuredDiffs,
    featuredInsiderBuy,
  };
}
