import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanySnapshot, getSearchIndex } from "@/data/repository";
import { CompareStudio } from "@/components/CompareStudio";
import { POPULAR_COMPARE_SLUGS, resolveComparisonTickers } from "@/lib/compare";
import { buildCompareCompanyHistory } from "@/lib/compare-history";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const entries = await getSearchIndex();
  const available = new Set(entries.map((entry) => entry.ticker));
  return POPULAR_COMPARE_SLUGS
    .filter((slug) => resolveComparisonTickers(slug, available).length > 0)
    .map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entries = await getSearchIndex();
  const tickers = resolveComparisonTickers(slug, new Set(entries.map((entry) => entry.ticker)));
  if (tickers.length === 0) notFound();

  const title = `${tickers.join(" vs. ")}: True FCF, SBC & Valuation`;
  return {
    title,
    description: `Compare ${tickers.join(" and ")} side-by-side on SBC-adjusted True Free Cash Flow, net share dilution, and Reverse DCF implied growth.`,
  };
}

export default async function HeadToHeadComparePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entries = await getSearchIndex();
  const initialTickers = resolveComparisonTickers(slug, new Set(entries.map((entry) => entry.ticker)));
  if (initialTickers.length === 0) notFound();

  const snapshots = await Promise.all(initialTickers.map((t) => getCompanySnapshot(t)));
  const initialHistory = snapshots
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map(buildCompareCompanyHistory);

  return (
    <CompareStudio
      entries={entries}
      initialTickers={initialTickers}
      initialHistory={initialHistory}
    />
  );
}
