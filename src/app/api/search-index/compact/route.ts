import { NextResponse } from "next/server";
import { getSearchIndex } from "@/data/repository";
import { toCommandSearchEntry } from "@/data/search-index";

export const revalidate = 21600;

/**
 * Slim edge-cached search index for Cmd+K navigation (omits scenarioBasis & sector-only ratios).
 */
export async function GET() {
  const index = await getSearchIndex();
  return NextResponse.json(index.map(toCommandSearchEntry), {
    headers: {
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
