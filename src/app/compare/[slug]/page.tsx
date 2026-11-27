import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompareHistory, getSearchIndex } from "@/data/repository";
import { CompareStudio } from "@/components/CompareStudio";
import { POPULAR_COMPARE_SLUGS, resolveComparisonTickers, toComparisonEntry } from "@/lib/compare";
import { SITE_URL } from "@/lib/site";

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
  const description = `Compare ${tickers.join(" and ")} side-by-side on SBC-adjusted True Free Cash Flow, net share dilution, and Reverse DCF implied growth.`;
  const canonicalUrl = `${SITE_URL}/compare/${tickers.join("-vs-")}`;
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl },
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

  const initialHistory = await getCompareHistory(initialTickers);

  return (
    <CompareStudio
      entries={entries.map(toComparisonEntry)}
      initialTickers={initialTickers}
      initialHistory={initialHistory}
    />
  );
}
