import type { Metadata } from "next";
import {
  getRecentFilingDiffs,
  getRecentMarketInsiders,
  getSearchIndex,
} from "@/data/repository";
import { getCachedMarketNews } from "@/lib/market-news";
import { SignalFeed } from "@/components/SignalFeed";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Feed | SEC Filings, 8-K Events & Insider Trades",
  description:
    "Recent SEC 10-K/10-Q filing changes, Form 8-K events, Form 4 insider trades, and headlines across your watchlist or the full market.",
};

export default async function FeedPage() {
  const [entries, insiders, diffs, marketNews] = await Promise.all([
    getSearchIndex(),
    getRecentMarketInsiders(),
    getRecentFilingDiffs(160),
    getCachedMarketNews(),
  ]);
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
