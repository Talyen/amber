import { SignalIndex } from "@/components/SignalIndex";
import {
  getRecentFilingDiffs,
  getRecentMarketInsiders,
  getSearchIndex,
} from "@/data/repository";
import { getTrendingTickers } from "@/lib/trending";

export const revalidate = 900;

export default async function HomePage() {
  const [entries, recentDiffs, recentInsiders, trending] = await Promise.all([
    getSearchIndex(),
    getRecentFilingDiffs(60),
    getRecentMarketInsiders(),
    getTrendingTickers(),
  ]);
  return (
    <SignalIndex
      entries={entries}
      recentDiffs={recentDiffs}
      recentInsiders={recentInsiders}
      trendingTickers={trending.map((t) => t.ticker)}
    />
  );
}
