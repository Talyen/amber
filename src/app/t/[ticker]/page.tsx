import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PILOT_TICKERS, getCompanyByTicker } from "@/data/pilot-tickers";
import { CompanyWorkspace } from "@/components/CompanyWorkspace";

interface TickerPageProps {
  params: Promise<{ ticker: string }>;
}

export function generateStaticParams() {
  return PILOT_TICKERS.map((company) => ({
    ticker: company.ticker,
  }));
}

export async function generateMetadata({
  params,
}: TickerPageProps): Promise<Metadata> {
  const { ticker } = await params;
  const company = getCompanyByTicker(ticker);
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
  const company = getCompanyByTicker(ticker);

  if (!company) {
    notFound();
  }

  return <CompanyWorkspace company={company} />;
}
