import { NextResponse } from "next/server";
import { getCompanySnapshot } from "@/data/repository";
import { buildCompareCompanyHistory } from "@/lib/compare-history";

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
  ].slice(0, 5);

  if (tickers.length === 0) {
    return NextResponse.json({ series: [] });
  }

  const snapshots = await Promise.all(tickers.map((t) => getCompanySnapshot(t)));
  const series = snapshots
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map(buildCompareCompanyHistory);

  return NextResponse.json(
    { series },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
