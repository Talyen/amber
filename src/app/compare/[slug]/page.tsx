import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSearchIndex } from "@/data/repository";
import { CompareStudio } from "@/components/CompareStudio";
import { POPULAR_COMPARE_SLUGS } from "@/app/sitemap";

export const revalidate = 86400;
export const dynamicParams = true;

function parseSlugTickers(slug: string): string[] {
  return slug
    .split(/-vs-/i)
    .map((s) => s.trim().toUpperCase())
    .filter((t) => /^[A-Z0-9.-]{1,10}$/.test(t))
    .slice(0, 4);
}

export function generateStaticParams() {
  return POPULAR_COMPARE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tickers = parseSlugTickers(slug);
  if (tickers.length < 2) return { title: "Comparison Not Found" };

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
  const tickers = parseSlugTickers(slug);
  if (tickers.length < 2) notFound();

  const entries = await getSearchIndex();
  const validSet = new Set(entries.map((e) => e.ticker));
  const initialTickers = tickers.filter((t) => validSet.has(t));

  if (initialTickers.length === 0) notFound();

  return <CompareStudio entries={entries} initialTickers={initialTickers} />;
}
