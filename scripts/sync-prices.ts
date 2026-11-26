/**
 * Amber Batch EOD Share Price & Market Cap Sync (Phase 3)
 *
 * Fetches latest closing share prices in polite batches (zero API key required)
 * and updates Market Cap using reported shares outstanding when available across:
 *   - src/data/generated/companies.json
 *   - src/data/generated/search-index.json
 *   - Neon Postgres (when DATABASE_URL is set)
 *
 * Usage:
 *   pnpm sync:prices
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeCompanyData } from "./write-company-data.ts";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { companies as companiesTable } from "../src/db/schema.ts";
import { isFreshPriceDate, meetsQuoteCoverage, MIN_QUOTE_COVERAGE } from "../src/lib/market-price.ts";
import type { EdgarSnapshot } from "./ingest-edgar.ts";

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[];
  };
}

interface YahooChartResult {
  meta?: {
    currency?: string;
    instrumentType?: string;
    exchangeTimezoneName?: string;
    currentTradingPeriod?: { regular?: { start: number; end: number } };
  };
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: Array<number | null> }> };
}

type Close = { date: string; price: number };

export function completedDailyCloses(result: YahooChartResult, now: number): Close[] {
  const timezone = result.meta?.exchangeTimezoneName;
  const session = result.meta?.currentTradingPeriod?.regular;
  if (!timezone || result.meta?.currency !== "USD" || result.meta.instrumentType !== "EQUITY") return [];
  const dateFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const marketDate = (seconds: number) => dateFormat.format(seconds * 1000);
  const today = marketDate(now);
  const sessionCompleted = session && Number.isFinite(session.start) && Number.isFinite(session.end) &&
    session.end > session.start && marketDate(session.start) === today && now >= session.end;
  const close = result.indicators?.quote?.[0]?.close ?? [];
  const closes: Close[] = [];

  for (const [index, timestamp] of (result.timestamp ?? []).entries()) {
    const price = close[index];
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 ||
      !Number.isFinite(timestamp) || timestamp > now) continue;
    const date = marketDate(timestamp);
    if (date > today || (date === today && !sessionCompleted)) continue;
    const rounded = Number(price.toFixed(2));
    if (rounded > 0) closes.push({ date, price: rounded });
  }
  return closes.sort((a, b) => a.date.localeCompare(b.date));
}

export function closeAtPeriodEnd(closes: Close[], end: string): number | undefined {
  const close = closes.findLast(({ date }) => date <= end);
  // Accommodate weekends and holidays without using stale prices or looking ahead.
  if (close && Date.parse(end) - Date.parse(close.date) <= 7 * 86_400_000) return close.price;
}

async function fetchPriceAndHistory(
  ticker: string,
  retries = 2
): Promise<Close[] | null> {
  const symbol = ticker.replace(/\./g, "-");
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AmberFinance/1.0)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      if (!res.ok) return null;
      const json = (await res.json()) as YahooChartResponse;
      const result = json.chart?.result?.[0];
      if (!result) return null;
      const now = Date.now() / 1000;
      const closes = completedDailyCloses(result, now);
      const last = closes.at(-1);
      if (!last || !isFreshPriceDate(last.date, now * 1_000)) return null;
      return closes;
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  return null;
}

async function run() {
  const outDir = path.resolve(process.cwd(), "src/data/generated");
  const companiesPath = path.join(outDir, "companies.json");

  if (!fs.existsSync(companiesPath)) {
    throw new Error("Run `pnpm ingest:edgar` first to generate companies.json.");
  }

  const snapshots = JSON.parse(
    fs.readFileSync(companiesPath, "utf8")
  ) as EdgarSnapshot[];

  console.log(
    `[amber-prices] Syncing latest EOD prices for ${snapshots.length} companies...`
  );

  const dbUrl = process.env.DATABASE_URL;
  const db = dbUrl ? drizzle(neon(dbUrl)) : null;

  const candidates: Array<{ company: EdgarSnapshot; closes: Close[] }> = [];
  const concurrency = 6;

  for (let i = 0; i < snapshots.length; i += concurrency) {
    const batch = snapshots.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((c) => fetchPriceAndHistory(c.ticker))
    );

    for (let j = 0; j < batch.length; j++) {
      const company = batch[j];
      const fetched = results[j];
      if (!fetched) continue;

      candidates.push({ company, closes: fetched });
    }

    // Polite throttle between batches
    await new Promise((r) => setTimeout(r, 250));
  }

  // A ticker with an older close than the rest of the market has not refreshed.
  const latestDate = candidates.map(({ closes }) => closes.at(-1)!.date).sort().at(-1);
  const refreshed = candidates.filter(({ company, closes }) =>
    closes.at(-1)!.date === latestDate &&
    (company.marketCapShares ?? company.annuals.at(-1)?.dilutedShares ?? 0) > 0
  );
  if (!meetsQuoteCoverage(refreshed.length, snapshots.length)) {
    throw new Error(`Quote refresh reached ${refreshed.length}/${snapshots.length} on ${latestDate ?? "no trading date"}; ${MIN_QUOTE_COVERAGE * 100}% required.`);
  }

  for (const { company, closes } of refreshed) {
    const last = closes.at(-1)!;
    const latestShares = company.marketCapShares ?? company.annuals.at(-1)?.dilutedShares ?? 0;

    company.price = last.price;
    company.priceAsOf = last.date;
    company.marketCap = Math.round(last.price * latestShares);
    const history: Array<{ fiscalYear: string; price: number }> = [];
    for (const row of company.annuals) {
      const rawYear = row.fiscalYear.replace(/^FY/i, "");
      const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
      const price = row.fiscalYear === "TTM"
        ? last.price
        : closeAtPeriodEnd(closes, row.periodEndDate ?? `${year}-12-31`);
      if (price !== undefined) history.push({ fiscalYear: row.fiscalYear, price });
    }
    if (!company.edgarFallback) company.priceHistory = history.length >= 2 ? history : undefined;
  }

  if (db) {
    console.log(
      `[amber-prices] Updating ${refreshed.length} prices in Neon Postgres...`
    );
    const chunkSize = 20;
    for (let i = 0; i < refreshed.length; i += chunkSize) {
      const slice = refreshed.slice(i, i + chunkSize);
      await Promise.all(
        slice.map(({ company: c }) =>
          db
            .update(companiesTable)
            .set({
              price: c.price,
              priceAsOf: c.priceAsOf,
              // A fallback's shares may be stale. Reprice the last persisted market cap.
              marketCap: c.edgarFallback ? sql`case when ${companiesTable.price} > 0
                then round(${companiesTable.marketCap} * ${c.price} / ${companiesTable.price})
                else ${companiesTable.marketCap} end` : c.marketCap,
              priceHistory: c.edgarFallback ? undefined : c.priceHistory ?? null,
              updatedAt: new Date(),
            })
            .where(and(
              eq(companiesTable.ticker, c.ticker),
              or(isNull(companiesTable.priceAsOf), lte(companiesTable.priceAsOf, c.priceAsOf!)),
            ))
        )
      );
    }
  }

  writeCompanyData(outDir, snapshots);

  console.log(
    `[amber-prices] ✓ Updated ${latestDate} EOD prices for ${refreshed.length}/${snapshots.length} companies.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
