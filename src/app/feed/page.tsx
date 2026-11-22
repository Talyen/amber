import type { Metadata } from "next";
import { getRecentMarketInsiders, getSearchIndex } from "@/data/repository";
import { SignalFeed } from "@/components/SignalFeed";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "SEC Signal Feed",
  description:
    "Latest SEC 10-K, 10-Q, and Form 4 open-market insider signals updated automatically every night.",
};

export default async function FeedPage() {
  const [entries, insiders] = await Promise.all([
    getSearchIndex(),
    getRecentMarketInsiders(),
  ]);
  return <SignalFeed entries={entries} insiders={insiders} />;
}
