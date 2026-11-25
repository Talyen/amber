import { NextResponse } from "next/server";
import {
  fetchCuratedNews,
  getCachedMarketNews,
  type HeadlineItem,
  type TrendingTickerItem,
} from "@/lib/market-news";

export type { HeadlineItem, TrendingTickerItem };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawTickers = searchParams.get("tickers");

  const data =
    rawTickers && rawTickers.trim().length > 0
      ? await fetchCuratedNews(rawTickers)
      : await getCachedMarketNews();

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
