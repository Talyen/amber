import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, userValuationPresets } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { normalizeValuationPresetInput } from "@/lib/valuation-presets";

function serializePreset(row: typeof userValuationPresets.$inferSelect) {
  return {
    ticker: row.ticker,
    lens: row.lens,
    revGrowth: row.revGrowth,
    targetMargin: row.targetMargin,
    exitMultiple: row.exitMultiple,
    thesisNote: row.thesisNote ?? null,
    updatedAt: row.updatedAt.toISOString(),
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

    return NextResponse.json({
      authenticated: true,
      preset: row ? serializePreset(row) : null,
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
    .select({ ticker: companies.ticker })
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
        updatedAt: now,
      },
    });

  return NextResponse.json({
    ok: true,
    preset: { ...normalized, updatedAt: now.toISOString() },
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
