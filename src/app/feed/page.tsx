import type { Metadata } from "next";
import { getRecentMarketInsiders, getSearchIndex } from "@/data/repository";
import { SignalFeed } from "@/components/SignalFeed";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Feed | Market & Watchlist Stream",
  description:
    "Headlines, upcoming earnings, SEC filings, and Form 4 insider trades across your watchlist or the full market.",
};

export default async function FeedPage() {
  const [entries, insiders] = await Promise.all([
    getSearchIndex(),
    getRecentMarketInsiders(),
  ]);
  return <SignalFeed entries={entries} insiders={insiders} />;
}
