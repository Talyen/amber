import type { Metadata } from "next";
import { buildTickerMetadata, renderTickerView } from "../_shared";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  return buildTickerMetadata(ticker, "valuation");
}

export default async function TickerValuationPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  return renderTickerView(ticker, "valuation");
}
