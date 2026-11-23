import { SignalIndex } from "@/components/SignalIndex";
import {
  getRecentFilingDiffs,
  getRecentMarketInsiders,
  getSearchIndex,
} from "@/data/repository";

export const revalidate = 3600;

export default async function HomePage() {
  const [entries, recentDiffs, recentInsiders] = await Promise.all([
    getSearchIndex(),
    getRecentFilingDiffs(30),
    getRecentMarketInsiders(),
  ]);
  return (
    <SignalIndex
      entries={entries}
      recentDiffs={recentDiffs}
      recentInsiders={recentInsiders}
    />
  );
}
