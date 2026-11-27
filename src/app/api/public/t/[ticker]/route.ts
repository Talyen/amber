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
    const sym = ticker.toUpperCase();
    return NextResponse.json(
      {
        code: "ticker_not_found",
        error: `Ticker ${sym} not found in Amber coverage.`,
        message: `Ticker ${sym} not found in Amber coverage.`,
        resolution: `Verify the US equity ticker symbol or query /api/public/screener to list covered Nasdaq and NYSE companies.`,
      },
      {
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "X-API-Version": "1.0",
          "RateLimit-Policy": "120;w=60",
          "RateLimit-Limit": "120",
          "RateLimit-Remaining": "119",
        },
      }
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
    "X-API-Version": "1.0",
    "RateLimit-Policy": "120;w=60",
    "RateLimit-Limit": "120",
    "RateLimit-Remaining": "119",
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
