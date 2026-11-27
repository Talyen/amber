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
import { selectFeaturedSignals } from "@/lib/featured-signals";
import { toExploreEntry } from "@/data/search-index";
import { getTrendingTickers } from "@/lib/trending";

export const revalidate = 21600;

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

  const { featuredDiffs, featuredInsiderBuy } = selectFeaturedSignals({
    diffs: recentDiffs,
    insiders: recentInsiders,
    entries,
    trendingTickers: trendingSyms,
  });

  return (
    <SignalIndex
      entries={entries.map(toExploreEntry)}
      featuredDiffs={featuredDiffs}
      featuredInsiderBuy={featuredInsiderBuy}
      insiderBuySummaries={insiderBuySummaries}
      materialEventSummaries={materialEventSummaries}
    />
  );
}
