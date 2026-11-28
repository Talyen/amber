import { isScenarioLens } from "@/lib/finance";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, userValuationHistory, userValuationPresets, userValuationSaves } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import {
  normalizeValuationPresetInput,
  thesisHistoryId,
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
    isScenarioLens(row.lens) ? row.lens : "fcf";
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

function lockThesis(userId: string, ticker: string) {
  const key = `amber-thesis:${JSON.stringify([userId, ticker])}`;
  return sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
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
          .orderBy(desc(userValuationHistory.createdAt), desc(userValuationHistory.id))
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

  const saveId = (body as { saveId?: unknown }).saveId;
  const snapshotId = typeof saveId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(saveId)
    ? thesisHistoryId(userId, normalized.ticker, saveId)
    : null;

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

  const { ticker, lens, revGrowth, targetMargin, exitMultiple } = normalized;
  const thesisNote = normalized.thesisNote ?? null;
  const historyId = snapshotId ?? randomUUID();
  const writes = sql`
    with claimed as (
      insert into ${userValuationSaves} (id, user_id, ticker)
      select ${historyId}, ${userId}, ${ticker}
      where ${snapshotId !== null} and not exists (
        select 1 from ${userValuationHistory} where id = ${historyId}
      )
      on conflict (id) do nothing
      returning id
    ),
    previous as (
      select lens, rev_growth, target_margin, exit_multiple, thesis_note
      from ${userValuationHistory}
      where user_id = ${userId} and ticker = ${ticker}
      order by created_at desc, id desc
      limit 1
    ),
    saved as (
      insert into ${userValuationPresets}
        (id, user_id, ticker, lens, rev_growth, target_margin, exit_multiple, thesis_note, is_public, updated_at)
      select ${`${userId}:${ticker}`}, ${userId}, ${ticker}, ${lens}, ${revGrowth}, ${targetMargin},
        ${exitMultiple}, ${thesisNote}, ${normalized.isPublic === true}, statement_timestamp()
      where ${snapshotId === null} or exists (select 1 from claimed)
      on conflict (user_id, ticker) do update set
        lens = excluded.lens, rev_growth = excluded.rev_growth, target_margin = excluded.target_margin,
        exit_multiple = excluded.exit_multiple, thesis_note = excluded.thesis_note,
        is_public = excluded.is_public, updated_at = excluded.updated_at
      returning *
    )
    insert into ${userValuationHistory}
      (id, user_id, ticker, lens, rev_growth, target_margin, exit_multiple, thesis_note,
       price_at_save, filing_date_at_save, created_at)
    select ${historyId}, user_id, ticker, lens, rev_growth, target_margin, exit_multiple, thesis_note,
      ${Number.isFinite(exists.price) ? exists.price : null}, ${exists.lastFilingDate}, updated_at
    from saved
    where not exists (
      select 1 from previous
      where (previous.lens, previous.rev_growth, previous.target_margin, previous.exit_multiple, previous.thesis_note)
        is not distinct from (saved.lens, saved.rev_growth, saved.target_margin, saved.exit_multiple, saved.thesis_note)
    )
  `;

  try {
    // Batch runs in one transaction. Taking the lock in its own statement gives a
    // waiting save a fresh snapshot of the journal and receipts after it acquires the lock.
    const [, , [preset], [historyEntry]] = await db.batch([
      db.execute(lockThesis(userId, ticker)),
      db.execute(writes),
      db.select().from(userValuationPresets)
        .where(and(eq(userValuationPresets.userId, userId), eq(userValuationPresets.ticker, ticker)))
        .limit(1),
      db.select().from(userValuationHistory)
        .where(and(eq(userValuationHistory.userId, userId), eq(userValuationHistory.ticker, ticker)))
        .orderBy(desc(sql`${userValuationHistory.id} = ${historyId}`), desc(userValuationHistory.createdAt),
          desc(userValuationHistory.id))
        .limit(1),
    ]);
    if (!preset) {
      return NextResponse.json({ error: "This thesis has been deleted." }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      preset: serializePreset(preset),
      ...(historyEntry && (snapshotId || historyEntry.id === historyId)
        ? { historyEntry: serializeHistoryRow(historyEntry) }
        : {}),
    });
  } catch (error) {
    console.error("[valuation-presets] Save failed:", error);
    return NextResponse.json({ error: "Could not save thesis." }, { status: 503 });
  }
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

  await db.batch([
    db.execute(lockThesis(userId, ticker)),
    db.delete(userValuationPresets)
      .where(and(eq(userValuationPresets.userId, userId), eq(userValuationPresets.ticker, ticker))),
  ]);

  return NextResponse.json({ ok: true, deleted: ticker });
}
