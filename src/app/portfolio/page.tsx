import type { Metadata } from "next";
import { getSearchIndex } from "@/data/repository";
import { PortfolioXRay } from "@/components/PortfolioXRay";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Portfolio X-Ray",
  description:
    "Analyze your watchlist's weighted implied growth, real cash margins, stock-comp drag, and sector concentration.",
};

export default async function PortfolioPage() {
  const entries = await getSearchIndex();
  return <PortfolioXRay entries={entries} />;
}
