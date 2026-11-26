import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/**
 * On-Demand ISR Revalidation Webhook
 * Called by GitHub Actions after nightly SEC EDGAR ingestion so Vercel's
 * edge cache refreshes only the tickers that had a new filing.
 *
 * POST /api/revalidate
 * Authorization: Bearer <REVALIDATE_SECRET>
 * Body: { "tickers": ["NVDA", "PLTR"] }
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "REVALIDATE_SECRET is not configured on the server." },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let tickers: string[] = [];
  try {
    const body = (await request.json()) as { tickers?: string[] };
    if (Array.isArray(body.tickers)) {
      tickers = body.tickers
        .map((t) => String(t).trim().toUpperCase())
        .filter((t) => /^[A-Z0-9.-]{1,10}$/.test(t));
    }
  } catch {
    // Allow empty body to revalidate the global index
  }

  revalidateTag("companies");
  revalidatePath("/");
  revalidatePath("/api/search-index");

  for (const ticker of tickers) {
    revalidateTag(`ticker-${ticker}`);
    revalidatePath(`/t/${ticker}`);
  }

  return NextResponse.json({
    revalidated: true,
    tickers,
    timestamp: new Date().toISOString(),
  });
}
