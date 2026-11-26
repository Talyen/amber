import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, userValuationHistory, userValuationPresets } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import {
  isMeaningfulThesisChange,
  normalizeValuationPresetInput,
  type SavedScenarioLens,
} from "@/lib/valuation-presets";

function serializePreset(row: typeof userValuationPresets.$inferSelect) {
  return {
    ticker: row.ticker,
    lens: row.lens,
    revGrowth: row.revGrowth,
    targetMargin: row.targetMargin,
    exitMultiple: row.exitMultiple,
    thesisNote: row.thesisNote ?? null,
    isPublic: row.isPublic,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeHistoryRow(row: typeof userValuationHistory.$inferSelect) {
  const lens: SavedScenarioLens =
    row.lens === "ebit" || row.lens === "pe" ? row.lens : "fcf";
  return {
    id: row.id,
    ticker: row.ticker,
    lens,
    revGrowth: row.revGrowth,
    targetMargin: row.targetMargin,
    exitMultiple: row.exitMultiple,
    thesisNote: row.thesisNote ?? null,
    priceAtSave: row.priceAtSave ?? null,
    filingDateAtSave: row.filingDateAtSave ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const rawTicker = searchParams.get("ticker");
  const isBatch = rawTicker === null || rawTicker.trim() === "";

  if (!db) {
    return NextResponse.json(
      isBatch ? { presets: [], authenticated: false } : { preset: null, authenticated: false }
    );
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        isBatch ? { presets: [], authenticated: false } : { preset: null, authenticated: false }
      );
    }

    if (isBatch) {
      const rows = await db
        .select()
        .from(userValuationPresets)
        .where(eq(userValuationPresets.userId, userId))
        .orderBy(desc(userValuationPresets.updatedAt));
      return NextResponse.json({
        authenticated: true,
        presets: rows.map(serializePreset),
      });
    }

    const ticker = rawTicker.trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
      return NextResponse.json({ error: "Invalid ticker." }, { status: 400 });
    }

    const [row] = await db
      .select()
      .from(userValuationPresets)
      .where(
        and(
          eq(userValuationPresets.userId, userId),
          eq(userValuationPresets.ticker, ticker)
        )
      )
      .limit(1);

    let history: ReturnType<typeof serializeHistoryRow>[] | undefined;
    if (searchParams.get("history") === "1") {
      try {
        const histRows = await db
          .select()
          .from(userValuationHistory)
          .where(
            and(
              eq(userValuationHistory.userId, userId),
              eq(userValuationHistory.ticker, ticker)
            )
          )
          .orderBy(desc(userValuationHistory.createdAt))
          .limit(15);
        history = histRows.map(serializeHistoryRow);
      } catch {
        history = [];
      }
    }

    return NextResponse.json({
      authenticated: true,
      preset: row ? serializePreset(row) : null,
      ...(history !== undefined ? { history } : {}),
    });
  } catch {
    return NextResponse.json(
      isBatch ? { presets: [], authenticated: false } : { preset: null, authenticated: false }
    );
  }
}

export async function PUT(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Sign in to sync saved theses." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const normalized = normalizeValuationPresetInput(body);
  if (!normalized) {
    return NextResponse.json({ error: "Invalid valuation assumptions." }, { status: 400 });
  }

  const [exists] = await db
    .select({
      ticker: companies.ticker,
      price: companies.price,
      lastFilingDate: companies.lastFilingDate,
    })
    .from(companies)
    .where(eq(companies.ticker, normalized.ticker))
    .limit(1);
  if (!exists) {
    return NextResponse.json({ error: `Unknown ticker: ${normalized.ticker}.` }, { status: 404 });
  }

  const now = new Date();
  await db
    .insert(userValuationPresets)
    .values({
      id: `${userId}:${normalized.ticker}`,
      userId,
      ticker: normalized.ticker,
      lens: normalized.lens,
      revGrowth: normalized.revGrowth,
      targetMargin: normalized.targetMargin,
      exitMultiple: normalized.exitMultiple,
      thesisNote: normalized.thesisNote ?? null,
      isPublic: normalized.isPublic === true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userValuationPresets.userId, userValuationPresets.ticker],
      set: {
        lens: normalized.lens,
        revGrowth: normalized.revGrowth,
        targetMargin: normalized.targetMargin,
        exitMultiple: normalized.exitMultiple,
        thesisNote: normalized.thesisNote ?? null,
        isPublic: normalized.isPublic === true,
        updatedAt: now,
      },
    });

  // Append a Decision Journal snapshot when assumptions or notes change
  let historyEntry: ReturnType<typeof serializeHistoryRow> | null = null;
  try {
    const [latestHist] = await db
      .select()
      .from(userValuationHistory)
      .where(
        and(
          eq(userValuationHistory.userId, userId),
          eq(userValuationHistory.ticker, normalized.ticker)
        )
      )
      .orderBy(desc(userValuationHistory.createdAt))
      .limit(1);

    const prevComparable = latestHist
      ? {
          lens: (latestHist.lens === "ebit" || latestHist.lens === "pe" ? latestHist.lens : "fcf") as SavedScenarioLens,
          revGrowth: latestHist.revGrowth,
          targetMargin: latestHist.targetMargin,
          exitMultiple: latestHist.exitMultiple,
          thesisNote: latestHist.thesisNote ?? null,
        }
      : null;

    if (isMeaningfulThesisChange(prevComparable, normalized)) {
      const id = randomUUID();
      await db.insert(userValuationHistory).values({
        id,
        userId,
        ticker: normalized.ticker,
        lens: normalized.lens,
        revGrowth: normalized.revGrowth,
        targetMargin: normalized.targetMargin,
        exitMultiple: normalized.exitMultiple,
        thesisNote: normalized.thesisNote ?? null,
        priceAtSave: Number.isFinite(exists.price) ? exists.price : null,
        filingDateAtSave: exists.lastFilingDate ?? null,
        createdAt: now,
      });
      historyEntry = {
        id,
        ticker: normalized.ticker,
        lens: normalized.lens,
        revGrowth: normalized.revGrowth,
        targetMargin: normalized.targetMargin,
        exitMultiple: normalized.exitMultiple,
        thesisNote: normalized.thesisNote ?? null,
        priceAtSave: Number.isFinite(exists.price) ? exists.price : null,
        filingDateAtSave: exists.lastFilingDate ?? null,
        createdAt: now.toISOString(),
      };
    }
  } catch {
    // History table is additive; never fail the primary thesis save
  }

  return NextResponse.json({
    ok: true,
    preset: { ...normalized, updatedAt: now.toISOString() },
    ...(historyEntry ? { historyEntry } : {}),
  });
}

export async function DELETE(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ticker = String(searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker." }, { status: 400 });
  }

  await db
    .delete(userValuationPresets)
    .where(
      and(
        eq(userValuationPresets.userId, userId),
        eq(userValuationPresets.ticker, ticker)
      )
    );

  return NextResponse.json({ ok: true, deleted: ticker });
}
