import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { filingDiffs, insiderTrades } from "@/db/schema";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("tickers") ?? "";
  const tickers = [
    ...new Set(
      raw
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter((t) => /^[A-Z0-9.-]{1,10}$/.test(t))
    ),
  ].slice(0, 30);

  if (tickers.length === 0) {
    return NextResponse.json({ diffs: [], insiderBuys: [] });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ diffs: [], insiderBuys: [] });
  }

  try {
    const [diffs, insiderBuys] = await Promise.all([
      db
        .select({
          id: filingDiffs.id,
          ticker: filingDiffs.ticker,
          filingType: filingDiffs.filingType,
          filingDate: filingDiffs.filingDate,
          section: filingDiffs.section,
          materiality: filingDiffs.materiality,
          headline: filingDiffs.headline,
          summary: filingDiffs.summary,
        })
        .from(filingDiffs)
        .where(inArray(filingDiffs.ticker, tickers))
        .orderBy(desc(filingDiffs.filingDate))
        .limit(12),
      db
        .select({
          id: insiderTrades.id,
          ticker: insiderTrades.ticker,
          filingDate: insiderTrades.filingDate,
          insiderName: insiderTrades.insiderName,
          insiderTitle: insiderTrades.insiderTitle,
          totalValue: insiderTrades.totalValue,
        })
        .from(insiderTrades)
        .where(
          and(
            inArray(insiderTrades.ticker, tickers),
            eq(insiderTrades.transactionType, "Buy")
          )
        )
        .orderBy(desc(insiderTrades.filingDate))
        .limit(8),
    ]);

    return NextResponse.json({ diffs, insiderBuys });
  } catch {
    return NextResponse.json({ diffs: [], insiderBuys: [] });
  }
}
