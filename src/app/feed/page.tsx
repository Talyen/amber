import type { Metadata } from "next";
import {
  getRecentFilingDiffs,
  getRecentMarketInsiders,
  getSearchIndex,
} from "@/data/repository";
import { SignalFeed } from "@/components/SignalFeed";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Feed | SEC Filings, 8-K Events & Insider Trades",
  description:
    "Recent SEC 10-K/10-Q filing changes, Form 8-K events, Form 4 insider trades, and headlines across your watchlist or the full market.",
};

export default async function FeedPage() {
  const [entries, insiders, diffs] = await Promise.all([
    getSearchIndex(),
    getRecentMarketInsiders(),
    getRecentFilingDiffs(160),
  ]);
  return <SignalFeed entries={entries} insiders={insiders} diffs={diffs} />;
}
