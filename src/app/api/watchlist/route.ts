import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, userWatchlists } from "@/db/schema";
import { getAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const db = getDb();
  if (!db) return NextResponse.json({ tickers: [], authenticated: false });

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ tickers: [], authenticated: false });
    }

    const rows = await db
      .select({ ticker: userWatchlists.ticker })
      .from(userWatchlists)
      .where(eq(userWatchlists.userId, session.user.id))
      .orderBy(desc(userWatchlists.createdAt));

    return NextResponse.json({
      tickers: rows.map((r) => r.ticker),
      authenticated: true,
    });
  } catch {
    return NextResponse.json({ tickers: [], authenticated: false });
  }
}

export async function POST(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { ticker?: string; action?: "add" | "remove" | "toggle" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker." }, { status: 400 });
  }

  const exists = await db
    .select({ ticker: companies.ticker })
    .from(companies)
    .where(eq(companies.ticker, ticker))
    .limit(1);

  if (exists.length === 0) {
    return NextResponse.json({ error: "Unknown ticker." }, { status: 404 });
  }

  const id = `${session.user.id}:${ticker}`;
  const action = body.action ?? "toggle";

  const existing = await db
    .select({ id: userWatchlists.id })
    .from(userWatchlists)
    .where(
      and(
        eq(userWatchlists.userId, session.user.id),
        eq(userWatchlists.ticker, ticker)
      )
    )
    .limit(1);

  if (action === "remove" || (action === "toggle" && existing.length > 0)) {
    await db
      .delete(userWatchlists)
      .where(
        and(
          eq(userWatchlists.userId, session.user.id),
          eq(userWatchlists.ticker, ticker)
        )
      );
  } else if (existing.length === 0) {
    await db
      .insert(userWatchlists)
      .values({ id, userId: session.user.id, ticker })
      .onConflictDoNothing();
  }

  const rows = await db
    .select({ ticker: userWatchlists.ticker })
    .from(userWatchlists)
    .where(eq(userWatchlists.userId, session.user.id))
    .orderBy(desc(userWatchlists.createdAt));

  return NextResponse.json({ tickers: rows.map((r) => r.ticker) });
}
