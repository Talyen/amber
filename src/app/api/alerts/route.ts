import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requestAlertConfirmation, saveVerifiedAlert } from "@/data/alert-subscriptions";
import { getDb } from "@/db";
import { alertSubscriptions, companies, userWatchlists } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { alertActionUrl, defaultAlertSender, escapeAlertHtml, filingAlertEmailIsVerified, sendAlertEmail } from "@/lib/alert-email";
import { SITE_URL } from "@/lib/site";

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
      .where(and(eq(alertSubscriptions.email, email), isNull(alertSubscriptions.confirmationExpiresAt)))
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
  let body: { email?: string; ticker?: string; scope?: string } | null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const db = getDb();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!db || !resendKey) {
    return NextResponse.json(
      { error: "Filing alerts are currently unavailable. Please try again later." },
      { status: 503 },
    );
  }
  let account: { id?: string; email: string; emailVerified: boolean } | undefined;
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    account = session?.user;
  } catch {
    // Email confirmation is available without an authenticated session.
  }

  // Batch watchlist alert subscription for authenticated verified-email accounts
  if (body?.scope === "watchlist") {
    const email = account?.email?.trim().toLowerCase() ?? "";
    if (!account?.id || !email || !filingAlertEmailIsVerified(email, account)) {
      return NextResponse.json(
        { error: "Sign in with a verified email to enable watchlist filing alerts." },
        { status: 401 }
      );
    }

    const watchlistRows = await db
      .select({ ticker: userWatchlists.ticker })
      .from(userWatchlists)
      .where(eq(userWatchlists.userId, account.id))
      .limit(50);

    const existingRows = await db
      .select({ ticker: alertSubscriptions.ticker })
      .from(alertSubscriptions)
      .where(
        and(
          eq(alertSubscriptions.email, email),
          isNull(alertSubscriptions.confirmationExpiresAt)
        )
      );
    const existingSet = new Set(existingRows.map((r) => r.ticker));
    const toAdd = watchlistRows
      .map((r) => r.ticker)
      .filter((t) => TICKER_RE.test(t) && !existingSet.has(t));

    for (const t of toAdd) {
      await saveVerifiedAlert(db, `${t}:${email}`, email, t);
    }

    const updatedTickers = [...new Set([...toAdd, ...existingRows.map((r) => r.ticker)])];
    return NextResponse.json({
      subscribed: true,
      added: toAdd,
      tickers: updatedTickers,
      message:
        toAdd.length > 0
          ? `Enabled filing alerts for ${toAdd.length} watchlist ${toAdd.length === 1 ? "company" : "companies"}.`
          : "All watchlist companies already have filing alerts enabled.",
    });
  }

  const providedEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const email = providedEmail || account?.email.trim().toLowerCase() || "";
  const ticker = typeof body?.ticker === "string" ? body.ticker.trim().toUpperCase() : "";

  if (email.length > 254 || !EMAIL_RE.test(email)) {
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
    if (filingAlertEmailIsVerified(email, account)) {
      await saveVerifiedAlert(db, id, email, ticker);
      return NextResponse.json({
        subscribed: true,
        ticker,
        message: `You're subscribed to ${ticker} 10-K & 10-Q filing alerts.`,
      });
    }

    const token = await requestAlertConfirmation(db, id, email, ticker);
    if (token) {
      const link = escapeAlertHtml(alertActionUrl(SITE_URL, "confirm", token));
      await sendAlertEmail(resendKey, `filing-alert-confirm/${token}`, {
        from: process.env.ALERT_FROM_EMAIL ?? defaultAlertSender,
        to: [email],
        subject: `Confirm Amber filing alerts for ${ticker}`,
        html: `<p>Confirm that you want SEC filing alerts for ${ticker} from Amber.</p>
          <p><a href="${link}">Confirm filing alerts</a></p>
          <p>If you did not request this, you can ignore this email.</p>`,
      });
    }

    return NextResponse.json({
      subscribed: false,
      ticker,
      message: "If confirmation is needed, you’ll receive a link by email.",
    }, { status: 202 });
  } catch {
    console.error("[amber-alerts] Failed to save or confirm subscription.");
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
