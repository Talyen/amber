import crypto from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  arenaPortfolios,
  arenaPositions,
  arenaRebalances,
  companies,
} from "@/db/schema";
import { getAuth } from "@/lib/auth";

interface LockPositionInput {
  ticker: string;
  weight: number;
}

/**
 * Portfolio Arena Publish & Rebalance Endpoint
 *
 * - Requires an authenticated Better Auth session.
 * - Enforces one active portfolio per user.
 * - If the user already has a portfolio, banks current period returns into their
 *   Time-Weighted NAV and records a rebalance event at official closing prices.
 */
export async function POST(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database unavailable in local preview mode." },
      { status: 503 }
    );
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json(
      { error: "Please sign in to publish or rebalance an Arena portfolio." },
      { status: 401 }
    );
  }

  let body: {
    handle?: string;
    title?: string;
    thesis?: string;
    positions?: LockPositionInput[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const handle = String(body.handle ?? "")
    .trim()
    .replace(/^@+/, "")
    .slice(0, 28);
  const title = String(body.title ?? "").trim().slice(0, 64);
  const thesis = String(body.thesis ?? "").trim().slice(0, 220);

  if (handle.length < 2 || !/^[A-Za-z0-9_.-]+$/.test(handle)) {
    return NextResponse.json(
      { error: "Handle must be 2–28 characters (letters, numbers, _, ., -)." },
      { status: 400 }
    );
  }

  if (title.length < 3) {
    return NextResponse.json(
      { error: "Please enter a short portfolio title (at least 3 characters)." },
      { status: 400 }
    );
  }

  const rawPositions = Array.isArray(body.positions) ? body.positions : [];
  const deduped = new Map<string, number>();
  for (const p of rawPositions) {
    const t = String(p.ticker ?? "").trim().toUpperCase();
    const w = Number(p.weight);
    if (/^[A-Z0-9.-]{1,10}$/.test(t) && Number.isFinite(w) && w > 0) {
      deduped.set(t, w);
    }
  }

  if (deduped.size < 3 || deduped.size > 10) {
    return NextResponse.json(
      { error: "Arena portfolios must contain between 3 and 10 unique stocks." },
      { status: 400 }
    );
  }

  const tickers = [...deduped.keys()];
  const dbCompanies = await db
    .select({ ticker: companies.ticker, price: companies.price })
    .from(companies)
    .where(inArray(companies.ticker, tickers));

  if (dbCompanies.length !== tickers.length) {
    const found = new Set(dbCompanies.map((c) => c.ticker));
    const missing = tickers.filter((t) => !found.has(t));
    return NextResponse.json(
      { error: `Unknown ticker(s): ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const totalWeight = [...deduped.values()].reduce((a, b) => a + b, 0);
  const now = new Date();
  const periodKey = now.toISOString().slice(0, 7); // e.g. "2026-11"

  // Enforce 1 portfolio per user: check if this user already has one
  const existingRows = await db
    .select()
    .from(arenaPortfolios)
    .where(
      and(
        eq(arenaPortfolios.userId, session.user.id),
        eq(arenaPortfolios.isBot, 0)
      )
    )
    .limit(1);

  const existing = existingRows[0];

  if (existing) {
    const oldPositions = await db
      .select()
      .from(arenaPositions)
      .where(eq(arenaPositions.portfolioId, existing.id));

    const oldTickers = oldPositions.map((p) => p.ticker);
    const oldPriceRows =
      oldTickers.length > 0
        ? await db
            .select({ ticker: companies.ticker, price: companies.price })
            .from(companies)
            .where(inArray(companies.ticker, oldTickers))
        : [];
    const oldPriceMap = new Map(oldPriceRows.map((c) => [c.ticker, c.price]));

    // Bank current period weighted return into Time-Weighted NAV
    let periodReturnDecimal = 0;
    for (const p of oldPositions) {
      const currentPrice = oldPriceMap.get(p.ticker) ?? p.entryPrice;
      const ret = p.entryPrice > 0 ? (currentPrice - p.entryPrice) / p.entryPrice : 0;
      periodReturnDecimal += ret * (p.weightPct / 100);
    }

    const prevNav =
      typeof existing.nav === "number" && Number.isFinite(existing.nav)
        ? existing.nav
        : 100;
    const newNav = Number((prevNav * (1 + periodReturnDecimal)).toFixed(4));

    // Build concise diff summary
    const oldSet = new Set(oldTickers);
    const newSet = new Set(tickers);
    const added = tickers.filter((t) => !oldSet.has(t));
    const removed = oldTickers.filter((t) => !newSet.has(t));
    const parts: string[] = [];
    if (added.length > 0) parts.push(`Added ${added.join(", ")}`);
    if (removed.length > 0) parts.push(`Removed ${removed.join(", ")}`);
    if (parts.length === 0) parts.push("Adjusted target weights");
    const summary = `${parts.join(" · ")} (${tickers.length} holdings)`;

    await db
      .update(arenaPortfolios)
      .set({
        handle,
        title,
        thesis: thesis || existing.thesis,
        nav: newNav,
        lastRebalancedAt: now,
      })
      .where(eq(arenaPortfolios.id, existing.id));

    await db
      .delete(arenaPositions)
      .where(eq(arenaPositions.portfolioId, existing.id));

    await db.insert(arenaPositions).values(
      dbCompanies.map((c) => ({
        id: `${existing.id}:${c.ticker}`,
        portfolioId: existing.id,
        ticker: c.ticker,
        weightPct: Number((((deduped.get(c.ticker) ?? 1) / totalWeight) * 100).toFixed(2)),
        entryPrice: c.price,
      }))
    );

    await db.insert(arenaRebalances).values({
      id: `${existing.id}:reb:${crypto.randomBytes(4).toString("hex")}`,
      portfolioId: existing.id,
      navAtRebalance: newNav,
      summary,
      createdAt: now,
    });

    revalidateTag("arena");
    revalidatePath("/arena");
    revalidatePath(`/arena/${existing.id}`);

    return NextResponse.json({
      id: existing.id,
      url: `/arena/${existing.id}`,
      rebalanced: true,
      nav: newNav,
      lockedAt: now.toISOString(),
    });
  }

  // Create initial portfolio for this user
  const id = `${handle.toLowerCase().replace(/[^a-z0-9]/g, "")}-${crypto.randomBytes(3).toString("hex")}`;

  await db.insert(arenaPortfolios).values({
    id,
    userId: session.user.id,
    handle,
    title,
    thesis: thesis || `${tickers.length}-stock conviction portfolio.`,
    isBot: 0,
    botTheme: null,
    periodKey,
    nav: 100,
    finalReturnPct: null,
    lockedAt: now,
    lastRebalancedAt: now,
  });

  await db.insert(arenaPositions).values(
    dbCompanies.map((c) => ({
      id: `${id}:${c.ticker}`,
      portfolioId: id,
      ticker: c.ticker,
      weightPct: Number((((deduped.get(c.ticker) ?? 1) / totalWeight) * 100).toFixed(2)),
      entryPrice: c.price,
    }))
  );

  revalidateTag("arena");
  revalidatePath("/arena");

  return NextResponse.json({
    id,
    url: `/arena/${id}`,
    rebalanced: false,
    nav: 100,
    lockedAt: now.toISOString(),
  });
}
