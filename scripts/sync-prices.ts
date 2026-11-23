/**
 * Amber Batch EOD Share Price & Market Cap Sync (Phase 3)
 *
 * Fetches latest closing share prices in polite batches (zero API key required)
 * and updates Market Cap (= Price * Latest Diluted Shares) across:
 *   - src/data/generated/companies.json
 *   - src/data/generated/search-index.json
 *   - Neon Postgres (when DATABASE_URL is set)
 *
 * Usage:
 *   pnpm sync:prices
 */

import fs from "node:fs";
import path from "node:path";
import { buildSearchIndexEntry } from "../src/data/search-index.ts";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, sql } from "drizzle-orm";
import { annualFinancials, companies as companiesTable } from "../src/db/schema.ts";
import type { EdgarSnapshot } from "./ingest-edgar.ts";

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
      };
      timestamp?: number[];
      indicators?: {
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
        quote?: Array<{ close?: Array<number | null> }>;
      };
    }>;
  };
}

interface PriceFetchResult {
  latestPrice: number;
  byYear: Map<string, number>; // e.g. "2024" -> 134.2
  byYearMonth: Map<string, number>; // e.g. "2024-09" -> 134.2
}

async function fetchPriceAndHistory(
  ticker: string,
  retries = 2
): Promise<PriceFetchResult | null> {
  const symbol = ticker.replace(/\./g, "-");
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1mo`;

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
      const meta = result?.meta;
      const latestPrice = meta?.regularMarketPrice;
      if (typeof latestPrice !== "number" || !Number.isFinite(latestPrice) || latestPrice <= 0) {
        return null;
      }

      const byYear = new Map<string, number>();
      const byYearMonth = new Map<string, number>();
      const timestamps = result?.timestamp ?? [];
      // Prefer split-adjusted quote.close over dividend-adjusted adjclose so dividend payers
      // don't appear artificially expensive relative to historical valuation medians
      const closes =
        result?.indicators?.quote?.[0]?.close ??
        result?.indicators?.adjclose?.[0]?.adjclose ??
        [];

      for (let i = 0; i < timestamps.length; i++) {
        const c = closes[i];
        if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) continue;
        const d = new Date(timestamps[i] * 1000);
        const yr = String(d.getUTCFullYear());
        const ym = `${yr}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        const rounded = Number(c.toFixed(2));
        byYear.set(yr, rounded);
        byYearMonth.set(ym, rounded);
      }

      return {
        latestPrice: Number(latestPrice.toFixed(2)),
        byYear,
        byYearMonth,
      };
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
  const indexPath = path.join(outDir, "search-index.json");

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

  const refreshed: Pick<EdgarSnapshot, "ticker" | "price" | "marketCap" | "priceHistory" | "edgarFallback">[] = [];
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

      const latestShares =
        company.annuals[company.annuals.length - 1]?.dilutedShares ?? 0;
      if (latestShares <= 0) continue;

      company.price = fetched.latestPrice;
      company.marketCap = Math.round(fetched.latestPrice * latestShares);

      // Map 5-year historical closing prices to each fiscal year's periodEndDate (or calendar year fallback)
      const history: Array<{ fiscalYear: string; price: number }> = [];
      for (const row of company.annuals) {
        if (row.fiscalYear === "TTM") {
          history.push({ fiscalYear: "TTM", price: fetched.latestPrice });
          continue;
        }
        const periodYm = row.periodEndDate?.slice(0, 7);
        const rawYr = row.fiscalYear.replace(/^FY/i, "");
        const fullYear = rawYr.length === 4 ? rawYr : `20${rawYr}`;
        const yrPrice =
          (periodYm ? fetched.byYearMonth.get(periodYm) : undefined) ??
          fetched.byYear.get(fullYear);
        if (yrPrice) {
          history.push({ fiscalYear: row.fiscalYear, price: yrPrice });
        }
      }
      if (history.length >= 2) {
        company.priceHistory = history;
      }

      refreshed.push({
        ticker: company.ticker,
        price: company.price,
        marketCap: company.marketCap,
        priceHistory: history.length >= 2 ? history : undefined,
        edgarFallback: company.edgarFallback,
      });
    }

    // Polite throttle between batches
    await new Promise((r) => setTimeout(r, 250));
  }

  // Recompute search-index.json with updated Market Cap & Reverse DCF Implied CAGR
  const searchIndex = snapshots.map(buildSearchIndexEntry);

  fs.writeFileSync(companiesPath, JSON.stringify(snapshots, null, 2) + "\n");
  fs.writeFileSync(indexPath, JSON.stringify(searchIndex, null, 2) + "\n");

  if (db) {
    console.log(
      `[amber-prices] Updating ${refreshed.length} prices in Neon Postgres...`
    );
    const chunkSize = 20;
    for (let i = 0; i < refreshed.length; i += chunkSize) {
      const slice = refreshed.slice(i, i + chunkSize);
      await Promise.all(
        slice.map((c) =>
          db
            .update(companiesTable)
            .set({
              price: c.price,
              // A fallback snapshot may carry an older share count and fiscal window.
              marketCap: c.edgarFallback ? sql`coalesce(
                round(${c.price} * (
                  select ${annualFinancials.dilutedShares}
                  from ${annualFinancials}
                  where ${annualFinancials.ticker} = ${c.ticker}
                    and ${annualFinancials.dilutedShares} > 0
                  order by ${annualFinancials.sortOrder} desc
                  limit 1
                )),
                ${companiesTable.marketCap}
              )` : c.marketCap,
              priceHistory: c.edgarFallback ? undefined : c.priceHistory,
              updatedAt: new Date(),
            })
            .where(eq(companiesTable.ticker, c.ticker))
        )
      );
    }
  }

  console.log(
    `[amber-prices] ✓ Updated live EOD prices for ${refreshed.length}/${snapshots.length} companies.`
  );
}

run();
