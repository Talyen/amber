import type { Metadata } from "next";
import { getArenaLeaderboard, getSpyBenchmarks } from "@/data/repository";
import { ArenaLeaderboard } from "@/components/ArenaLeaderboard";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Portfolio Arena | Equity Leaderboards",
  description:
    "Track and compare thematic strategy bots and community equity portfolios over time.",
};

export default async function ArenaPage() {
  const [portfolios, benchmarks] = await Promise.all([
    getArenaLeaderboard(),
    getSpyBenchmarks(),
  ]);
  return <ArenaLeaderboard portfolios={portfolios} benchmarks={benchmarks} />;
}
