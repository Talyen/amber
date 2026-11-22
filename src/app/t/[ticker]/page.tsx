import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllTickers, getCompanySnapshot } from "@/data/repository";
import { CompanyWorkspace } from "@/components/CompanyWorkspace";

export const revalidate = 86400;

interface TickerPageProps {
  params: Promise<{ ticker: string }>;
}

export async function generateStaticParams() {
  const tickers = await getAllTickers();
  return tickers.map((ticker) => ({ ticker }));
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

  return <CompanyWorkspace company={company} />;
}
