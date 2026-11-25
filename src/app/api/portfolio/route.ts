import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { userPortfolios, type UserPortfolioHoldingJson } from "@/db/schema";
import { getAuth } from "@/lib/auth";

function normalizeHoldings(raw: unknown): UserPortfolioHoldingJson[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: UserPortfolioHoldingJson[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const ticker = typeof obj.ticker === "string" ? obj.ticker.trim().toUpperCase() : "";
    const value = typeof obj.value === "number" ? obj.value : Number(obj.value);
    if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) continue;
    if (!Number.isFinite(value) || value < 0 || value > 1e9) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    out.push({ ticker, value: Number(value.toFixed(2)) });
    if (out.length >= 40) break;
  }
  return out;
}

export async function GET(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ authenticated: false, portfolio: null });
  }
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ authenticated: false, portfolio: null });
    }
    const [row] = await db
      .select()
      .from(userPortfolios)
      .where(eq(userPortfolios.userId, userId))
      .limit(1);

    return NextResponse.json({
      authenticated: true,
      portfolio: row
        ? {
            inputMode: row.inputMode === "dollars" ? "dollars" : "weight",
            holdings: row.holdings,
            updatedAt: row.updatedAt.toISOString(),
          }
        : null,
    });
  } catch {
    return NextResponse.json({ authenticated: false, portfolio: null });
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
    return NextResponse.json({ error: "Sign in to save your portfolio." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const inputMode = raw.inputMode === "dollars" ? "dollars" : "weight";
  const holdings = normalizeHoldings(raw.holdings);
  if (!holdings) {
    return NextResponse.json({ error: "Invalid portfolio holdings." }, { status: 400 });
  }

  const now = new Date();
  await db
    .insert(userPortfolios)
    .values({
      userId,
      inputMode,
      holdings,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPortfolios.userId,
      set: {
        inputMode,
        holdings,
        updatedAt: now,
      },
    });

  return NextResponse.json({
    ok: true,
    portfolio: { inputMode, holdings, updatedAt: now.toISOString() },
  });
}
