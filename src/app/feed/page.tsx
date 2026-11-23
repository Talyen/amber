import type { Metadata } from "next";
import {
  getRecentFilingDiffs,
  getRecentMarketInsiders,
  getSearchIndex,
} from "@/data/repository";
import { SignalFeed } from "@/components/SignalFeed";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Signals | SEC Fine-Print Diffs, 8-K Events & Insider Buys",
  description:
    "High-signal SEC 10-K/10-Q fine-print changes, Form 8-K material events, cross-filing risk themes, and open-market Form 4 insider moves.",
};

export default async function FeedPage() {
  const [entries, insiders, diffs] = await Promise.all([
    getSearchIndex(),
    getRecentMarketInsiders(),
    getRecentFilingDiffs(160),
  ]);
  return <SignalFeed entries={entries} insiders={insiders} diffs={diffs} />;
}
