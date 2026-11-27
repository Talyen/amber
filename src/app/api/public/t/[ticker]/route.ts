import { NextResponse } from "next/server";
import { getCompanySnapshot, getInsiderTradesForTickers } from "@/data/repository";
import {
  buildPublicCompanyPayload,
  formatCompanyMarkdown,
} from "@/lib/agentic-data";
import { prefersMarkdown } from "@/lib/http-accept";

export const revalidate = 3600;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const company = await getCompanySnapshot(ticker);
  if (!company) {
    return NextResponse.json(
      { error: `Ticker ${ticker.toUpperCase()} not found in Amber coverage.` },
      { status: 404 }
    );
  }

  const insiderTrades = await getInsiderTradesForTickers([company.ticker], 5, true);
  const payload = buildPublicCompanyPayload(company, insiderTrades);

  const format = new URL(request.url).searchParams.get("format");
  const wantsMarkdown = format === "markdown" ||
    (format !== "json" && prefersMarkdown(request.headers.get("accept")));

  const commonHeaders = {
    Vary: "Accept",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    Link: `</t/${company.ticker}>; rel="canonical", </llms.txt>; rel="describedby"; type="text/markdown"`,
  };

  if (wantsMarkdown) {
    return new Response(formatCompanyMarkdown(payload), {
      headers: {
        ...commonHeaders,
        "Content-Type": "text/markdown; charset=utf-8",
      },
    });
  }

  return NextResponse.json(payload, { headers: commonHeaders });
}
