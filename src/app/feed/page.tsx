import type { Metadata } from "next";
import {
  getRecentFilingDiffs,
  getRecentMarketInsiders,
  getSearchIndex,
} from "@/data/repository";
import { getCachedMarketNews } from "@/lib/market-news";
import { SignalFeed, type FeedCompanyEntry } from "@/components/SignalFeed";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Feed | SEC Filings, 8-K Events & Insider Trades",
  description:
    "Recent SEC 10-K/10-Q filing changes, Form 8-K events, Form 4 insider trades, and headlines across your watchlist or the full market.",
};

export default async function FeedPage() {
  const [fullEntries, insiders, diffs, marketNews] = await Promise.all([
    getSearchIndex(),
    getRecentMarketInsiders(),
    getRecentFilingDiffs(160),
    getCachedMarketNews(),
  ]);
  const entries: FeedCompanyEntry[] = fullEntries.map((e) => ({
    ticker: e.ticker,
    name: e.name,
    sector: e.sector,
    marketCap: e.marketCap,
    lastFilingDate: e.lastFilingDate,
    trueFcf: e.trueFcf,
    trueFcfMargin: e.trueFcfMargin,
    sbcPctRevenue: e.sbcPctRevenue,
    impliedCagr: e.impliedCagr,
    equityLensOnly: Boolean(e.scenarioBasis?.equityLensOnly),
  }));
  return (
    <SignalFeed
      entries={entries}
      insiders={insiders}
      diffs={diffs}
      initialTrending={marketNews.trending}
      initialHeadlines={marketNews.items}
    />
  );
}
