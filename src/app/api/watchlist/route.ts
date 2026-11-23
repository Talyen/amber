import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, userWatchlists } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { parseWatchlistRequest } from "@/lib/watchlist-request";

async function readTickers(db: NonNullable<ReturnType<typeof getDb>>, userId: string) {
  const rows = await db
    .select({ ticker: userWatchlists.ticker })
    .from(userWatchlists)
    .where(eq(userWatchlists.userId, userId))
    .orderBy(desc(userWatchlists.createdAt));
  return rows.map(({ ticker }) => ticker);
}

export async function GET(request: Request) {
  const db = getDb();
  if (!db) return NextResponse.json({ tickers: [], authenticated: false });

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ tickers: [], authenticated: false });
    }

    return NextResponse.json({
      tickers: await readTickers(db, session.user.id),
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const edit = parseWatchlistRequest(body);
  if ("error" in edit) return NextResponse.json(edit, { status: 400 });

  const userId = session.user.id;
  if ("tickers" in edit) {
    if (edit.tickers.length > 0) {
      const valid = await db
        .select({ ticker: companies.ticker })
        .from(companies)
        .where(inArray(companies.ticker, edit.tickers));

      if (valid.length > 0) {
        await db
          .insert(userWatchlists)
          .values(valid.map(({ ticker }) => ({ id: `${userId}:${ticker}`, userId, ticker })))
          .onConflictDoNothing();
      }
    }
    return NextResponse.json({ tickers: await readTickers(db, userId) });
  }

  const { ticker, action } = edit;
  const [company] = await db
    .select({ ticker: companies.ticker })
    .from(companies)
    .where(eq(companies.ticker, ticker))
    .limit(1);

  if (!company) {
    return NextResponse.json({ error: "Unknown ticker." }, { status: 404 });
  }

  const item = and(eq(userWatchlists.userId, userId), eq(userWatchlists.ticker, ticker));
  let remove = action === "remove";
  if (action === "toggle") {
    const [existing] = await db.select({ id: userWatchlists.id }).from(userWatchlists).where(item).limit(1);
    remove = Boolean(existing);
  }

  if (remove) {
    await db.delete(userWatchlists).where(item);
  } else {
    await db
      .insert(userWatchlists)
      .values({ id: `${userId}:${ticker}`, userId, ticker })
      .onConflictDoNothing();
  }

  return NextResponse.json({ tickers: await readTickers(db, userId) });
}
