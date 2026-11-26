import crypto from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { activeArenaEntryForUser } from "@/data/arena-entry";
import { getDb } from "@/db";
import {
  arenaPortfolios,
  arenaPositions,
  arenaRebalances,
  companies,
  user,
} from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { isArenaHandleConflict } from "@/lib/arena-handle";
import { arenaMonth, arenaPeriodBounds } from "@/lib/arena-period";
import { parseArenaWeights } from "@/lib/arena-weights";
import { isFreshPriceDate } from "@/lib/market-price";
import { normalizeAvatarId } from "@/lib/avatars";

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
    avatarIcon?: string;
    positions?: unknown;
  } | null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const handle = String(body?.handle ?? "")
    .trim()
    .replace(/^@+/, "")
    .slice(0, 28);
  const title = String(body?.title ?? "").trim().slice(0, 64);
  const thesis = String(body?.thesis ?? "").trim().slice(0, 220);
  const avatarIcon = normalizeAvatarId(body?.avatarIcon);

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

  const weights = parseArenaWeights(body?.positions);
  if (weights.size < 3 || weights.size > 10) {
    return NextResponse.json(
      { error: "Arena portfolios must contain between 3 and 10 unique stocks." },
      { status: 400 }
    );
  }

  const now = new Date();
  const tickers = [...weights.keys()];
  const dbCompanies = await db
    .select({ ticker: companies.ticker, price: companies.price, priceAsOf: companies.priceAsOf })
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

  const missingPrices = dbCompanies.filter(({ price, priceAsOf }) =>
    !Number.isFinite(price) || price <= 0 || !isFreshPriceDate(priceAsOf, now.getTime())
  );
  if (missingPrices.length > 0) {
    return NextResponse.json(
      { error: `No recent closing price for: ${missingPrices.map(({ ticker }) => ticker).join(", ")}.` },
      { status: 422 }
    );
  }

  const userId = session.user.id;

  const periodKey = arenaMonth(now);
  const nextPeriodAt = new Date(arenaPeriodBounds(periodKey)!.end * 1000).toISOString();
  const activeEntry = activeArenaEntryForUser(userId, periodKey);

  const [existing] = await db
    .select()
    .from(arenaPortfolios)
    .where(activeEntry)
    .limit(1);

  const newPositions = dbCompanies.map(({ ticker, price }) => ({
    ticker,
    weightPct: weights.get(ticker)!,
    entryPrice: price,
  }));

  try {
    if (existing) {
      const oldPositions = await db
        .select()
        .from(arenaPositions)
        .where(eq(arenaPositions.portfolioId, existing.id));

      const oldTickers = oldPositions.map((p) => p.ticker);
      const oldPriceRows =
        oldTickers.length > 0
          ? await db
              .select({ ticker: companies.ticker, price: companies.price, priceAsOf: companies.priceAsOf })
              .from(companies)
              .where(inArray(companies.ticker, oldTickers))
          : [];
      const oldPriceMap = new Map(oldPriceRows.map((c) => [c.ticker, c]));
      const unpriced = oldTickers.filter((ticker) => {
        const quote = oldPriceMap.get(ticker);
        return !quote || !Number.isFinite(quote.price) || quote.price <= 0 ||
          !isFreshPriceDate(quote.priceAsOf, now.getTime());
      });
      if (unpriced.length) {
        return NextResponse.json({ error: `No recent closing price for: ${unpriced.join(", ")}.` }, { status: 422 });
      }

      // Bank current period weighted return into Time-Weighted NAV
      let periodReturnDecimal = 0;
      for (const p of oldPositions) {
        const currentPrice = oldPriceMap.get(p.ticker)!.price;
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
      const summary = `${parts.join(", ")} (${tickers.length} holdings)`;

      const previousRebalance = existing.lastRebalancedAt.getTime();
      const rebalancedAt = new Date(Math.max(Date.now(), previousRebalance + 1)).toISOString();
      const rebalanceId = `${existing.id}:reb:${crypto.randomUUID()}`;
      const positionValues = sql.join(newPositions.map((position) => sql`(
        ${`${rebalanceId}:${position.ticker}`}::text,
        ${position.ticker}::text,
        ${position.weightPct}::double precision,
        ${position.entryPrice}::double precision
      )`), sql`, `);

      // Every write depends on the update claiming the version used to calculate NAV.
      const result = await db.execute(sql`
        with updated as (
          update ${arenaPortfolios}
          set handle = ${handle}, title = ${title}, thesis = ${thesis || existing.thesis},
            avatar_icon = ${avatarIcon}, nav = ${newNav}, period_key = ${periodKey},
            last_rebalanced_at = ${rebalancedAt}::timestamptz
          where ${eq(arenaPortfolios.id, existing.id)} and ${activeEntry}
            and date_trunc('milliseconds', ${arenaPortfolios.lastRebalancedAt}) =
              ${existing.lastRebalancedAt.toISOString()}::timestamptz
            and statement_timestamp() < ${nextPeriodAt}::timestamptz
          returning id
        ),
        removed as (
          delete from ${arenaPositions} using updated
          where ${arenaPositions.portfolioId} = updated.id
        ),
        replacements as (
          insert into ${arenaPositions} (id, portfolio_id, ticker, weight_pct, entry_price)
          select position.id, updated.id, position.ticker, position.weight_pct, position.entry_price
          from updated cross join (values ${positionValues}) as position(id, ticker, weight_pct, entry_price)
        ),
        logged as (
          insert into ${arenaRebalances} (id, portfolio_id, nav_at_rebalance, summary, created_at)
          select ${rebalanceId}, updated.id, ${newNav}, ${summary}, ${rebalancedAt}::timestamptz
          from updated
        )
        update ${user}
        set handle = ${handle}, avatar_icon = ${avatarIcon}, updated_at = ${rebalancedAt}::timestamptz
        from updated
        where ${eq(user.id, userId)}
        returning updated.id
      `);
      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: "The Arena entry changed while saving. Please reload and try again." },
          { status: 409 }
        );
      }

      revalidateTag("arena");
      revalidatePath("/arena");
      revalidatePath(`/arena/${existing.id}`);
      if (existing.handle) revalidatePath(`/u/${existing.handle}`);
      revalidatePath(`/u/${handle}`);

      return NextResponse.json({
        id: existing.id,
        url: `/arena/${existing.id}`,
        rebalanced: true,
        nav: newNav,
        lockedAt: rebalancedAt,
      });
    }

    // Publish this month's entry and its positions together.
    const id = `${handle.toLowerCase().replace(/[^a-z0-9]/g, "")}-${crypto.randomBytes(3).toString("hex")}`;

    if (arenaMonth(new Date()) !== periodKey) {
      return NextResponse.json(
        { error: "A new Arena period has started. Please reload and try again." },
        { status: 409 }
      );
    }

    try {
      await db.batch([
        db.update(user).set({ handle, avatarIcon, updatedAt: now }).where(eq(user.id, userId)),
        db.insert(arenaPortfolios).values({
          id,
          userId,
          handle,
          title,
          thesis: thesis || `${tickers.length}-stock conviction portfolio.`,
          isBot: 0,
          avatarIcon,
          periodKey,
          lockedAt: now,
          lastRebalancedAt: now,
        }),
        db.insert(arenaPositions).values(newPositions.map((position) => ({
          ...position,
          id: `${id}:${position.ticker}`,
          portfolioId: id,
        }))),
      ]);
    } catch (error) {
      if (
        typeof error === "object" && error !== null &&
        "constraint" in error && error.constraint === "arena_open_user_period_idx"
      ) {
        return NextResponse.json(
          { error: "This month's Arena entry was already published. Please reload and try again." },
          { status: 409 }
        );
      }
      throw error;
    }

    revalidateTag("arena");
    revalidatePath("/arena");
    revalidatePath(`/u/${handle}`);

    return NextResponse.json({
      id,
      url: `/arena/${id}`,
      rebalanced: false,
      nav: 100,
      lockedAt: now.toISOString(),
    });
  } catch (error) {
    if (!isArenaHandleConflict(error)) throw error;
    return NextResponse.json(
      { error: `Handle @${handle} is already taken. Please choose another.` },
      { status: 409 }
    );
  }
}
