import type { Metadata } from "next";
import { getSearchIndex } from "@/data/repository";
import { CompareStudio } from "@/components/CompareStudio";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Compare Companies",
  description:
    "Compare True Free Cash Flow, Stock-Based Compensation burden, net dilution, and Reverse DCF implied growth side-by-side.",
};

export default async function ComparePage() {
  const entries = await getSearchIndex();
  return <CompareStudio entries={entries} />;
}
