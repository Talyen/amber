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
  return buildTickerMetadata(ticker, "filings");
}

export default async function TickerFilingsPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  return renderTickerView(ticker, "filings");
}
