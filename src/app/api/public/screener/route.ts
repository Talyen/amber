import { NextResponse } from "next/server";
import { getPublicLensContext } from "@/data/public-market";
import { getSearchIndex } from "@/data/repository";
import { parseAgentScreenerFilters, screenCompaniesForAgent } from "@/lib/agentic-data";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = parseAgentScreenerFilters((key) => searchParams.get(key) ?? undefined, "query");
  if ("error" in parsed) {
    return NextResponse.json(parsed, { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
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
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
