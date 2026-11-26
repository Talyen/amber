import type { Metadata } from "next";
import { getArenaEntryBenchmarks, getArenaLeaderboard, getSpyBenchmarks } from "@/data/arena-repository";
import { getSearchIndex } from "@/data/repository";
import { ArenaLeaderboard } from "@/components/ArenaLeaderboard";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Portfolio Arena | Equity Leaderboards",
  description:
    "Track and compare thematic strategy bots and community equity portfolios over time.",
};

export default async function ArenaPage() {
  const entries = getArenaLeaderboard();
  const [portfolios, entryBenchmarks, benchmarks, searchIndex] = await Promise.all([
    entries,
    entries.then(getArenaEntryBenchmarks),
    getSpyBenchmarks(),
    getSearchIndex(),
  ]);
  return (
    <ArenaLeaderboard
      portfolios={portfolios}
      benchmarks={benchmarks}
      entryBenchmarks={entryBenchmarks}
      searchIndex={searchIndex}
    />
  );
}
