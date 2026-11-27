import type { Metadata } from "next";
import { getPortfolioEntries } from "@/data/repository";
import { PortfolioAnalyzer } from "@/components/PortfolioAnalyzer";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Portfolio Analyzer",
  description:
    "Analyze your portfolio's weighted implied growth, real cash margins, stock-comp drag, and sector concentration, or publish it to the Amber Arena.",
};

export default async function PortfolioPage() {
  const entries = await getPortfolioEntries();
  return <PortfolioAnalyzer entries={entries} />;
}
