import crypto from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { arenaPortfolios, arenaPositions, companies } from "@/db/schema";

interface LockPositionInput {
  ticker: string;
  weight: number;
}

/**
 * Anti-Cheat Portfolio Lock Endpoint
 *
 * Accepts 3–10 tickers + weights, looks up each ticker's OFFICIAL current price
 * from Neon Postgres on the server (never trusting client prices), and writes an
 * immutable timestamped entry into the Amber Portfolio Arena.
 */
export async function POST(request: Request) {
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

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database unavailable in local preview mode." },
      { status: 503 }
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
  const id = `${handle.toLowerCase().replace(/[^a-z0-9]/g, "")}-${crypto.randomBytes(3).toString("hex")}`;
  const lockedAt = new Date();
  const periodKey = lockedAt.toISOString().slice(0, 7); // e.g. "2026-11"

  await db.insert(arenaPortfolios).values({
    id,
    handle,
    title,
    thesis: thesis || `Locked ${tickers.length}-stock conviction basket.`,
    isBot: 0,
    botTheme: null,
    periodKey,
    finalReturnPct: null,
    lockedAt,
  });

  await db.insert(arenaPositions).values(
    dbCompanies.map((c) => ({
      id: `${id}:${c.ticker}`,
      portfolioId: id,
      ticker: c.ticker,
      weightPct: Number((((deduped.get(c.ticker) ?? 1) / totalWeight) * 100).toFixed(2)),
      entryPrice: c.price, // Server-locked official price
    }))
  );

  revalidateTag("arena");
  revalidatePath("/arena");

  return NextResponse.json({
    id,
    url: `/arena/${id}`,
    lockedAt: lockedAt.toISOString(),
  });
}
