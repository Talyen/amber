import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getAllTickers,
  getCompanySnapshot,
  getInsiderTrades,
  getSectorBenchmark,
} from "@/data/repository";
import { CompanyWorkspace } from "@/components/CompanyWorkspace";

export const revalidate = 86400;
export const dynamicParams = true;

interface TickerPageProps {
  params: Promise<{ ticker: string }>;
}

/**
 * Pre-render the top 40 tickers at build time for instant cold loads;
 * all remaining tickers (41..5,000+) render on-demand and cache at Vercel's edge for 24h.
 */
export async function generateStaticParams() {
  const tickers = await getAllTickers();
  return tickers.slice(0, 40).map((ticker) => ({ ticker }));
}

export async function generateMetadata({
  params,
}: TickerPageProps): Promise<Metadata> {
  const { ticker } = await params;
  const company = await getCompanySnapshot(ticker);
  if (!company) {
    return { title: "Ticker Not Found" };
  }

  return {
    title: `${company.ticker} — ${company.name}`,
    description: `${company.name} (${company.ticker}) SBC-adjusted True Free Cash Flow, Reverse DCF implied growth, and SEC ${company.lastFiling.type} filing diffs.`,
  };
}

export default async function TickerPage({ params }: TickerPageProps) {
  const { ticker } = await params;
  const company = await getCompanySnapshot(ticker);

  if (!company) {
    notFound();
  }

  const [insiderTrades, sectorBenchmark] = await Promise.all([
    getInsiderTrades(company.ticker),
    getSectorBenchmark(company.sector),
  ]);

  return (
    <CompanyWorkspace
      company={company}
      insiderTrades={insiderTrades}
      sectorBenchmark={sectorBenchmark}
    />
  );
}
