import type { Metadata } from "next";
import { getCompareHistory, getSearchIndex } from "@/data/repository";
import { DEFAULT_COMPARE_TICKERS, toComparisonEntry } from "@/lib/compare";
import { CompareStudio } from "@/components/CompareStudio";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Compare Companies",
  description:
    "Compare True Free Cash Flow, Stock-Based Compensation burden, net dilution, and Reverse DCF implied growth side-by-side.",
};

export default async function ComparePage() {
  const [entries, initialHistory] = await Promise.all([
    getSearchIndex(),
    getCompareHistory(DEFAULT_COMPARE_TICKERS),
  ]);
  return <CompareStudio entries={entries.map(toComparisonEntry)} initialHistory={initialHistory} />;
}
