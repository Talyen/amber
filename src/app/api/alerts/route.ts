import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { alertSubscriptions } from "@/db/schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TICKER_RE = /^[A-Z0-9.-]{1,10}$/;

/**
 * Subscribe an email to SEC 10-K / 10-Q filing alerts for a ticker.
 * Persists directly to Neon Postgres `alert_subscriptions`.
 */
export async function POST(request: Request) {
  let body: { email?: string; ticker?: string };
  try {
    body = (await request.json()) as { email?: string; ticker?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
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

  const db = getDb();
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
