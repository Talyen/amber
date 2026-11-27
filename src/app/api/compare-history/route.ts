import { NextResponse } from "next/server";
import { getCompareHistory } from "@/data/repository";
import { MAX_COMPARE_TICKERS } from "@/lib/compare";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("tickers") ?? "";
  const tickers = [
    ...new Set(
      raw
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter((t) => /^[A-Z0-9.-]{1,10}$/.test(t))
    ),
  ].slice(0, MAX_COMPARE_TICKERS);

  if (tickers.length === 0) {
    return NextResponse.json({ series: [] });
  }

  const series = await getCompareHistory(tickers);

  return NextResponse.json(
    { series },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
