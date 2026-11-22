import type { Metadata } from "next";
import { getArenaLeaderboard } from "@/data/repository";
import { ArenaLeaderboard } from "@/components/ArenaLeaderboard";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Portfolio Arena — Verified Leaderboards",
  description:
    "Tamper-proof equity portfolio leaderboards locked at official closing prices, competing alongside thematic strategy bots.",
};

export default async function ArenaPage() {
  const portfolios = await getArenaLeaderboard();
  return <ArenaLeaderboard portfolios={portfolios} />;
}
