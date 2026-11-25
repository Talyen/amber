/**
 * Arena Period Close & Snapshot Script (Idempotent)
 *
 * Designed to run daily in GitHub Actions:
 *   - Checks for any unfinalized monthly or yearly Arena entries whose period has ended.
 *   - Freezes each expired entry's `finalReturnPct` using official closing
 *     prices from the expiring period + its banked Time-Weighted NAV.
 *
 * Safe to run on any day; does nothing if all prior months are already finalized.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { arenaPortfolios, arenaPositions } from "../src/db/schema.ts";
import { arenaClosingReturn, isArenaIndexBot } from "../src/lib/arena-equity.ts";
import { arenaBenchmarkHistoryStart, arenaIndexPeriodReturn, arenaMonth, arenaPeriodBounds, lastTradingClose } from "../src/lib/arena-period.ts";

async function fetchPeriodPrices(
  ticker: string,
  bounds: NonNullable<ReturnType<typeof arenaPeriodBounds>>,
  includeBenchmark: boolean,
) {
  const symbol = encodeURIComponent(ticker.replace(/\./g, "-"));
  const query = new URLSearchParams({
    period1: String(includeBenchmark ? arenaBenchmarkHistoryStart(bounds.start) : bounds.start),
    period2: String(bounds.end),
    interval: "1d",
  });
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?${query}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AmberFinance/1.0)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return;
    const data = await response.json() as {
      chart?: { result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{ close?: Array<number | null> }>;
          adjclose?: Array<{ adjclose?: Array<number | null> }>;
        };
      }> };
    };
    const series = data.chart?.result?.[0];
    const timestamps = series?.timestamp ?? [];
    const raw = series?.indicators?.quote?.[0]?.close ?? [];
    return {
      closingPrice: lastTradingClose(timestamps, raw, bounds),
      benchmarkReturn: includeBenchmark
        ? arenaIndexPeriodReturn(timestamps, series?.indicators?.adjclose?.[0]?.adjclose ?? raw, bounds)
        : undefined,
    };
  } catch {
    // Missing prices leave the affected entries open for the next run.
    return undefined;
  }
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[amber-arena-close] DATABASE_URL not set; skipping.");
    return;
  }

  const db = drizzle(neon(url));
  const now = new Date();
  const currentYm = arenaMonth(now);

  const openPortfolios = await db
    .select()
    .from(arenaPortfolios)
    .where(isNull(arenaPortfolios.finalReturnPct));

  const toClose = new Map<string, typeof openPortfolios>();
  for (const portfolio of openPortfolios) {
    const periodKey = portfolio.periodKey ?? arenaMonth(portfolio.lockedAt);
    const bounds = arenaPeriodBounds(periodKey);
    if (!bounds || bounds.end * 1000 > now.getTime()) continue;
    const entries = toClose.get(periodKey) ?? [];
    entries.push(portfolio);
    toClose.set(periodKey, entries);
  }

  if (toClose.size === 0) {
    console.log(
      `[amber-arena-close] All prior Arena periods are already finalized (current: ${currentYm}).`
    );
    return;
  }

  const ids = [...toClose.values()].flatMap((entries) => entries.map((entry) => entry.id));
  const allPositions = await db.select().from(arenaPositions)
    .where(inArray(arenaPositions.portfolioId, ids));
  const posByPort = new Map<string, typeof allPositions>();
  for (const pos of allPositions) {
    const list = posByPort.get(pos.portfolioId) ?? [];
    list.push(pos);
    posByPort.set(pos.portfolioId, list);
  }

  let closed = 0;
  for (const [periodKey, entries] of toClose) {
    const bounds = arenaPeriodBounds(periodKey)!;
    const indexEntries = new Set(entries.filter((entry) =>
      !posByPort.has(entry.id) && isArenaIndexBot({ ...entry, isBot: entry.isBot === 1 })
    ).map(({ id }) => id));
    const tickers = [...new Set(entries.flatMap((entry) =>
      indexEntries.has(entry.id)
        ? ["SPY"]
        : (posByPort.get(entry.id) ?? []).filter((position) => position.weightPct !== 0).map((position) => position.ticker)
    ))];
    const closingPrices = new Map<string, number>();
    let benchmarkReturn: number | undefined;
    const concurrency = 6;
    for (let i = 0; i < tickers.length; i += concurrency) {
      await Promise.all(tickers.slice(i, i + concurrency).map(async (ticker) => {
        const quote = await fetchPeriodPrices(ticker, bounds, ticker === "SPY" && indexEntries.size > 0);
        if (quote?.closingPrice !== undefined) closingPrices.set(ticker, quote.closingPrice);
        if (quote?.benchmarkReturn !== undefined) benchmarkReturn = quote.benchmarkReturn;
      }));
    }

    for (const port of entries) {
      const positions = posByPort.get(port.id) ?? [];
      const tracksBenchmark = indexEntries.has(port.id);
      if (!tracksBenchmark && positions.length === 0) continue;
      const finalReturnPct = tracksBenchmark
        ? benchmarkReturn
        : arenaClosingReturn(positions, closingPrices, port.nav);
      if (finalReturnPct === undefined) {
        console.warn(`[amber-arena-close] Skipping ${port.id}: missing valid entry or ${periodKey} closing prices.`);
        continue;
      }
      const updated = await db
        .update(arenaPortfolios)
        .set({ finalReturnPct })
        .where(and(
          eq(arenaPortfolios.id, port.id),
          isNull(arenaPortfolios.finalReturnPct),
          sql`date_trunc('milliseconds', ${arenaPortfolios.lastRebalancedAt}) =
            ${port.lastRebalancedAt.toISOString()}::timestamptz`
        ))
        .returning({ id: arenaPortfolios.id });
      closed += updated.length;
    }
  }

  console.log(
    `[amber-arena-close] ✓ Finalized ${closed} expired Arena entries prior to ${currentYm}.`
  );
}

run();
