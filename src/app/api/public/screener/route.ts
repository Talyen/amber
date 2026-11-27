import { NextResponse } from "next/server";
import { getPublicLensContext } from "@/data/public-market";
import { getSearchIndex } from "@/data/repository";
import { parseAgentScreenerFilters, screenCompaniesForAgent } from "@/lib/agentic-data";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = parseAgentScreenerFilters((key) => searchParams.get(key) ?? undefined, "query");
  const commonHeaders = {
    "Access-Control-Allow-Origin": "*",
    "X-API-Version": "1.0",
    "RateLimit-Policy": "120;w=60",
    "RateLimit-Limit": "120",
    "RateLimit-Remaining": "119",
  };
  if ("error" in parsed) {
    return NextResponse.json(
      {
        code: "invalid_screener_filter",
        error: parsed.error,
        message: parsed.error,
        resolution: "Check /openapi.json for valid screener query parameters and numeric bounds.",
      },
      { status: 400, headers: commonHeaders }
    );
  }
  const { filters } = parsed;
  const [entries, lensContext] = await Promise.all([getSearchIndex(), getPublicLensContext(filters.lens)]);
  const result = screenCompaniesForAgent(entries, filters, lensContext);

  return NextResponse.json(
    {
      ...result,
      explore_url: SITE_URL,
      attribution: `SEC EDGAR verified screener via Amber (${SITE_URL})`,
    },
    {
      headers: {
        ...commonHeaders,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
