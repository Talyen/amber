import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { user, userValuationPresets } from "@/db/schema";
import type { CommunityThesisItem } from "@/lib/valuation-presets";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker." }, { status: 400, headers });
  }

  const db = getDb();
  if (!db) return NextResponse.json([], { headers });

  const rows = await db.select({
    handle: user.handle,
    avatarIcon: user.avatarIcon,
    lens: userValuationPresets.lens,
    revGrowth: userValuationPresets.revGrowth,
    targetMargin: userValuationPresets.targetMargin,
    exitMultiple: userValuationPresets.exitMultiple,
    thesisNote: userValuationPresets.thesisNote,
    updatedAt: userValuationPresets.updatedAt,
  })
    .from(userValuationPresets)
    .innerJoin(user, eq(user.id, userValuationPresets.userId))
    .where(and(
      eq(userValuationPresets.ticker, ticker),
      eq(userValuationPresets.isPublic, true),
      isNotNull(user.handle),
    ))
    .orderBy(desc(userValuationPresets.updatedAt))
    .limit(4);

  const theses: CommunityThesisItem[] = rows.flatMap((row) => row.handle ? [{
    ...row,
    handle: row.handle,
    lens: row.lens === "ebit" || row.lens === "pe" ? row.lens : "fcf",
    updatedAt: row.updatedAt.toISOString(),
  }] : []);
  return NextResponse.json(theses, { headers });
}
