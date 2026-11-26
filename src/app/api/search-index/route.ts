import { NextResponse } from "next/server";
import { getSearchIndex } from "@/data/repository";

export const revalidate = 21600;

/**
 * Full edge-cached search index across all Neon-backed companies.
 */
export async function GET() {
  const index = await getSearchIndex();
  return NextResponse.json(index, {
    headers: {
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
