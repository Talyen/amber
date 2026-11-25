import type { Metadata } from "next";
import { getCompanySnapshot, getSearchIndex } from "@/data/repository";
import { DEFAULT_COMPARE_TICKERS } from "@/lib/compare";
import { buildCompareCompanyHistory } from "@/lib/compare-history";
import { CompareStudio } from "@/components/CompareStudio";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Compare Companies",
  description:
    "Compare True Free Cash Flow, Stock-Based Compensation burden, net dilution, and Reverse DCF implied growth side-by-side.",
};

export default async function ComparePage() {
  const [entries, defaultSnapshots] = await Promise.all([
    getSearchIndex(),
    Promise.all(DEFAULT_COMPARE_TICKERS.map((t) => getCompanySnapshot(t))),
  ]);
  const initialHistory = defaultSnapshots
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map(buildCompareCompanyHistory);

  return <CompareStudio entries={entries} initialHistory={initialHistory} />;
}
