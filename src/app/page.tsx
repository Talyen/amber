import { SignalIndex } from "@/components/SignalIndex";
import {
  getFilingDiffsForTickers,
  getInsiderBuyTickers,
  getInsiderTradesForTickers,
  getMaterialEventTickers,
  getRecentFilingDiffs,
  getRecentMarketInsiders,
  getSearchIndex,
} from "@/data/repository";
import { getTrendingTickers } from "@/lib/trending";

export const revalidate = 900;

export default async function HomePage() {
  const [entries, trending, insiderBuyTickers, materialEventTickers] =
    await Promise.all([
      getSearchIndex(),
      getTrendingTickers(),
      getInsiderBuyTickers(),
      getMaterialEventTickers(),
    ]);
  const trendingSyms = trending.map((t) => t.ticker);

  const [trendingDiffs, trendingInsiders, fallbackDiffs, fallbackInsiders] =
    await Promise.all([
      getFilingDiffsForTickers(trendingSyms, 30),
      getInsiderTradesForTickers(trendingSyms, 40),
      getRecentFilingDiffs(20),
      getRecentMarketInsiders(),
    ]);

  const recentDiffs =
    trendingDiffs.length > 0 ? trendingDiffs : fallbackDiffs;
  const recentInsiders = [
    ...trendingInsiders,
    ...fallbackInsiders.filter(
      (fi) => !trendingInsiders.some((ti) => ti.id === fi.id)
    ),
  ];

  return (
    <SignalIndex
      entries={entries}
      recentDiffs={recentDiffs}
      recentInsiders={recentInsiders}
      trendingTickers={trendingSyms}
      insiderBuyTickers={insiderBuyTickers}
      materialEventTickers={materialEventTickers}
    />
  );
}
