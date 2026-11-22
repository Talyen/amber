import type { Metadata } from "next";
import { getArenaLeaderboard } from "@/data/repository";
import { ArenaLeaderboard } from "@/components/ArenaLeaderboard";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Portfolio Arena | Equity Leaderboards",
  description:
    "Track and compare thematic strategy bots and community equity portfolios over time.",
};

export default async function ArenaPage() {
  const portfolios = await getArenaLeaderboard();
  return <ArenaLeaderboard portfolios={portfolios} />;
}
