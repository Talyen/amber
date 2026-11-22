import type { Metadata } from "next";
import { getRecentMarketInsiders, getSearchIndex } from "@/data/repository";
import { SignalFeed } from "@/components/SignalFeed";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "SEC Filings | Live 10-K, 10-Q & Form 4 Stream",
  description:
    "Live stream of newly filed SEC 10-K, 10-Q, and Form 4 open-market insider signals, filterable to your personal watchlist.",
};

export default async function FilingsPage() {
  const [entries, insiders] = await Promise.all([
    getSearchIndex(),
    getRecentMarketInsiders(),
  ]);
  return <SignalFeed entries={entries} insiders={insiders} />;
}
