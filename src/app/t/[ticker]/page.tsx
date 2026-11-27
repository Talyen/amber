import type { Metadata } from "next";
import { getAllTickers } from "@/data/repository";
import { buildTickerMetadata, renderTickerView } from "./_shared";

export const revalidate = 86400;
export const dynamicParams = true;

interface TickerPageProps {
  params: Promise<{ ticker: string }>;
}

export async function generateStaticParams() {
  const tickers = await getAllTickers();
  return tickers.slice(0, 40).map((ticker) => ({ ticker }));
}

export async function generateMetadata({
  params,
}: TickerPageProps): Promise<Metadata> {
  const { ticker } = await params;
  return buildTickerMetadata(ticker, "overview");
}

export default async function TickerPage({ params }: TickerPageProps) {
  const { ticker } = await params;
  return renderTickerView(ticker, "overview");
}
