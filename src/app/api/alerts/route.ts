import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { alertSubscriptions, companies } from "@/db/schema";
import { getAuth } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TICKER_RE = /^[A-Z0-9.-]{1,10}$/;

// Lightweight per-instance rate limiter to prevent alert-subscription abuse
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REQUESTS = 8;
const rateBuckets = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (rateBuckets.get(key) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_REQUESTS) {
    rateBuckets.set(key, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return false;
}

/**
 * List the signed-in user's active SEC filing alert subscriptions.
 */
export async function GET(request: Request) {
  const db = getDb();
  if (!db) return NextResponse.json({ tickers: [], authenticated: false });

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ tickers: [], authenticated: false });
    }

    const rows = await db
      .select({
        ticker: alertSubscriptions.ticker,
        createdAt: alertSubscriptions.createdAt,
      })
      .from(alertSubscriptions)
      .where(eq(alertSubscriptions.email, email))
      .orderBy(desc(alertSubscriptions.createdAt));

    return NextResponse.json({
      tickers: rows.map((r) => r.ticker),
      authenticated: true,
    });
  } catch {
    return NextResponse.json({ tickers: [], authenticated: false });
  }
}

/**
 * Subscribe an email to SEC 10-K / 10-Q filing alerts for a validated ticker.
 */
export async function POST(request: Request) {
  let body: { email?: string; ticker?: string };
  try {
    body = (await request.json()) as { email?: string; ticker?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const db = getDb();
  let sessionEmail: string | null = null;
  if (db) {
    try {
      const session = await getAuth().api.getSession({ headers: request.headers });
      sessionEmail = session?.user?.email?.trim().toLowerCase() ?? null;
    } catch {
      // Unauthenticated request
    }
  }

  const email = (String(body.email ?? "").trim().toLowerCase() || sessionEmail || "");
  const ticker = String(body.ticker ?? "").trim().toUpperCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json(
      { error: "Invalid ticker symbol." },
      { status: 400 }
    );
  }

  // Prevent arbitrary third-party email bombing by unauthenticated callers
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (isRateLimited(`ip:${clientIp}`) || isRateLimited(`email:${email}`)) {
    return NextResponse.json(
      { error: "Too many alert requests. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  if (!db) {
    return NextResponse.json(
      {
        subscribed: true,
        ticker,
        mode: "preview",
        message: `Saved ${ticker} alert preference (database offline in local preview).`,
      },
      { status: 200 }
    );
  }

  try {
    const exists = await db
      .select({ ticker: companies.ticker })
      .from(companies)
      .where(eq(companies.ticker, ticker))
      .limit(1);

    if (exists.length === 0) {
      return NextResponse.json(
        { error: `Unknown ticker: ${ticker}.` },
        { status: 404 }
      );
    }

    const id = `${ticker}:${email}`;
    await db
      .insert(alertSubscriptions)
      .values({ id, email, ticker })
      .onConflictDoNothing();

    return NextResponse.json(
      {
        subscribed: true,
        ticker,
        message: `You're subscribed to ${ticker} 10-K & 10-Q filing alerts.`,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[amber-alerts] Failed to save subscription:", err);
    return NextResponse.json(
      { error: "Could not save alert subscription. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * Unsubscribe the signed-in user from a ticker's filing alerts.
 */
export async function DELETE(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ticker = String(searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker." }, { status: 400 });
  }

  await db
    .delete(alertSubscriptions)
    .where(
      and(
        eq(alertSubscriptions.email, email),
        eq(alertSubscriptions.ticker, ticker)
      )
    );

  return NextResponse.json({ ok: true, unsubscribed: ticker });
}
