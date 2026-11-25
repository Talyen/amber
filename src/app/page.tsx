import { SignalIndex } from "@/components/SignalIndex";
import {
  getFilingDiffsForTickers,
  getInsiderBuySummaries,
  getInsiderTradesForTickers,
  getMaterialEventSummaries,
  getRecentFilingDiffs,
  getRecentMarketInsiders,
  getSearchIndex,
} from "@/data/repository";
import { getTrendingTickers } from "@/lib/trending";

export const revalidate = 900;

export default async function HomePage() {
  const [entries, trending, insiderBuySummaries, materialEventSummaries] =
    await Promise.all([
      getSearchIndex(),
      getTrendingTickers(),
      getInsiderBuySummaries(),
      getMaterialEventSummaries(),
    ]);
  const trendingSyms = trending.map((t) => t.ticker);

  const [trendingDiffs, trendingInsiders, fallbackDiffs, fallbackInsiders] =
    await Promise.all([
      getFilingDiffsForTickers(trendingSyms, 30),
      getInsiderTradesForTickers(trendingSyms, 40),
      getRecentFilingDiffs(40),
      getRecentMarketInsiders(),
    ]);

  const seenDiffIds = new Set(trendingDiffs.map((d) => d.id));
  const recentDiffs = [
    ...trendingDiffs,
    ...fallbackDiffs.filter((fd) => !seenDiffIds.has(fd.id)),
  ];
  const seenInsiderIds = new Set(trendingInsiders.map((ti) => ti.id));
  const recentInsiders = [
    ...trendingInsiders,
    ...fallbackInsiders.filter((fi) => !seenInsiderIds.has(fi.id)),
  ];

  return (
    <SignalIndex
      entries={entries}
      recentDiffs={recentDiffs}
      recentInsiders={recentInsiders}
      trendingTickers={trendingSyms}
      insiderBuySummaries={insiderBuySummaries}
      materialEventSummaries={materialEventSummaries}
    />
  );
}
