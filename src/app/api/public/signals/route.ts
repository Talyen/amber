import { NextResponse } from "next/server";
import { getPublicSignals, isPublicSignalType } from "@/data/public-market";
import { formatInsiderName, formatInsiderTitle } from "@/lib/insider-format";
import { SITE_URL } from "@/lib/site";

export const revalidate = 1800;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  const type = searchParams.get("type") ?? "all";
  const limit = Number(searchParams.get("limit") ?? 20);
  if (!isPublicSignalType(type) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    return NextResponse.json(
      { error: "Select all, diffs, or insiders and a whole-number limit between 1 and 50." },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
  const { diffs, buys } = await getPublicSignals({ ticker, type, limit });

  return NextResponse.json(
    {
      filing_diffs: diffs.map((d) => ({
        id: d.id,
        ticker: d.ticker,
        company_name: d.companyName,
        filing_type: d.filingType,
        filing_date: d.filingDate,
        section: d.section,
        category: d.category,
        materiality: d.materiality,
        headline: d.headline,
        summary: d.summary,
        url: `${SITE_URL}/filings/${encodeURIComponent(d.id)}`,
      })),
      insider_buys: buys.map((trade) => ({
        id: trade.id,
        ticker: trade.ticker,
        filing_date: trade.filingDate,
        insider_name: formatInsiderName(trade.insiderName),
        insider_title: formatInsiderTitle(trade.insiderTitle),
        shares: Math.round(trade.shares),
        price_per_share: Number(trade.pricePerShare.toFixed(2)),
        total_value_m: Number(trade.totalValue.toFixed(2)),
        url: `${SITE_URL}/t/${trade.ticker}/filings`,
      })),
      feed_url: `${SITE_URL}/feed`,
      rss_url: `${SITE_URL}/feed.xml`,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      },
    }
  );
}
