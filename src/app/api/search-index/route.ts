import { NextResponse } from "next/server";
import { getSearchIndex } from "@/data/repository";

export const revalidate = 86400;

/**
 * Lightweight edge-cached search index across all Neon-backed companies.
 * Enables 0ms client-side Cmd+K search even when scaled to 5,000+ tickers
 * without bundling the full dataset into client JS.
 */
export async function GET() {
  const index = await getSearchIndex();
  return NextResponse.json(index, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
