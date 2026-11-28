import { isScenarioLens } from "@/lib/finance";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { user, userValuationPresets } from "@/db/schema";
import { getSearchIndex } from "@/data/repository";
import {
  computePresetExpectedReturn,
  type CommunityThesisItem,
} from "@/lib/valuation-presets";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export interface MarketCommunityThesisItem extends CommunityThesisItem {
  ticker: string;
  companyName: string;
  irrPct: number | null;
  fairValueToday: number | null;
}

export async function GET(request: Request) {
  const rawTicker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase();
  const db = getDb();

  if (!rawTicker) {
    if (!db) return NextResponse.json([], { headers });
    const [rows, searchIndex] = await Promise.all([
      db
        .select({
          ticker: userValuationPresets.ticker,
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
        .where(
          and(
            eq(userValuationPresets.isPublic, true),
            isNotNull(user.handle)
          )
        )
        .orderBy(desc(userValuationPresets.updatedAt))
        .limit(12),
      getSearchIndex(),
    ]);

    const byTicker = new Map(searchIndex.map((e) => [e.ticker, e]));

    const theses: MarketCommunityThesisItem[] = rows.flatMap((row) => {
      if (!row.handle) return [];
      const lens = isScenarioLens(row.lens) ? row.lens : "fcf";
      const entry = byTicker.get(row.ticker);
      const updatedAt = row.updatedAt.toISOString();
      const proj = entry
        ? computePresetExpectedReturn(
            {
              ticker: row.ticker,
              lens,
              revGrowth: row.revGrowth,
              targetMargin: row.targetMargin,
              exitMultiple: row.exitMultiple,
              thesisNote: row.thesisNote,
              updatedAt,
            },
            entry
          )
        : null;
      return [
        {
          ticker: row.ticker,
          companyName: entry?.name ?? row.ticker,
          handle: row.handle,
          avatarIcon: row.avatarIcon,
          lens,
          revGrowth: row.revGrowth,
          targetMargin: row.targetMargin,
          exitMultiple: row.exitMultiple,
          thesisNote: row.thesisNote,
          updatedAt,
          irrPct: proj?.irrPct ?? null,
          fairValueToday: proj?.fairValueToday ?? null,
        },
      ];
    });
    return NextResponse.json(theses, { headers });
  }

  if (!/^[A-Z0-9.-]{1,10}$/.test(rawTicker)) {
    return NextResponse.json({ error: "Invalid ticker." }, { status: 400, headers });
  }

  if (!db) return NextResponse.json([], { headers });

  const rows = await db
    .select({
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
    .where(
      and(
        eq(userValuationPresets.ticker, rawTicker),
        eq(userValuationPresets.isPublic, true),
        isNotNull(user.handle)
      )
    )
    .orderBy(desc(userValuationPresets.updatedAt))
    .limit(4);

  const theses: CommunityThesisItem[] = rows.flatMap((row) =>
    row.handle
      ? [
          {
            ...row,
            handle: row.handle,
            lens: isScenarioLens(row.lens) ? row.lens : "fcf",
            updatedAt: row.updatedAt.toISOString(),
          },
        ]
      : []
  );
  return NextResponse.json(theses, { headers });
}
