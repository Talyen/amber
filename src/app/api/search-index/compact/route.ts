import { NextResponse } from "next/server";
import { getSearchIndex } from "@/data/repository";

export const revalidate = 21600;

/**
 * Slim edge-cached search index for Cmd+K navigation (omits scenarioBasis & sector-only ratios).
 */
export async function GET() {
  const index = await getSearchIndex();
  const compact = index.map((e) => ({
    ticker: e.ticker,
    name: e.name,
    exchange: e.exchange,
    sector: e.sector,
    marketCap: e.marketCap,
    trueFcfMargin: e.trueFcfMargin,
    impliedCagr: e.impliedCagr,
  }));
  return NextResponse.json(compact, {
    headers: {
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
