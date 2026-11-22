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
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { companies as companiesTable } from "../src/db/schema.ts";
import {
  type CompanySnapshot,
  computeAnnualMetrics,
  computeEnterpriseValue,
  computeNetDilutionCagr,
  solveReverseDcf,
} from "../src/lib/finance.ts";

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
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
}

async function fetchPriceAndHistory(ticker: string): Promise<PriceFetchResult | null> {
  const symbol = ticker.replace(/\./g, "-");
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1mo`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AmberFinance/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResponse;
    const result = json.chart?.result?.[0];
    const meta = result?.meta;
    const latestPrice = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? null;
    if (typeof latestPrice !== "number" || !Number.isFinite(latestPrice) || latestPrice <= 0) {
      return null;
    }

    const byYear = new Map<string, number>();
    const timestamps = result?.timestamp ?? [];
    const closes =
      result?.indicators?.adjclose?.[0]?.adjclose ??
      result?.indicators?.quote?.[0]?.close ??
      [];

    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) continue;
      const yr = new Date(timestamps[i] * 1000).getUTCFullYear();
      // Keep the latest monthly close recorded in each calendar year
      byYear.set(String(yr), Number(c.toFixed(2)));
    }

    return {
      latestPrice: Number(latestPrice.toFixed(2)),
      byYear,
    };
  } catch {
    return null;
  }
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
  ) as CompanySnapshot[];

  console.log(
    `[amber-prices] Syncing latest EOD prices for ${snapshots.length} companies...`
  );

  const dbUrl = process.env.DATABASE_URL;
  const db = dbUrl ? drizzle(neon(dbUrl)) : null;

  let updatedCount = 0;
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

      // Map 5-year historical closing prices to each fiscal year in annuals
      const history: Array<{ fiscalYear: string; price: number }> = [];
      for (const row of company.annuals) {
        if (row.fiscalYear === "TTM") {
          history.push({ fiscalYear: "TTM", price: fetched.latestPrice });
          continue;
        }
        const fullYear = `20${row.fiscalYear.replace(/^FY/i, "")}`;
        const yrPrice = fetched.byYear.get(fullYear);
        if (yrPrice) {
          history.push({ fiscalYear: row.fiscalYear, price: yrPrice });
        }
      }
      if (history.length >= 2) {
        company.priceHistory = history;
      }

      updatedCount++;
    }

    // Polite throttle between batches
    await new Promise((r) => setTimeout(r, 250));
  }

  // Recompute search-index.json with updated Market Cap & Reverse DCF Implied CAGR
  const searchIndex = snapshots.map((c) => {
    const computed = computeAnnualMetrics(c.annuals);
    const latest = computed[computed.length - 1];
    const ev = computeEnterpriseValue(c);
    const dilution = computeNetDilutionCagr(c.annuals);
    const dcf = solveReverseDcf({
      enterpriseValue: ev,
      baseRevenue: latest.revenue,
      waccPct: c.defaultDcf.wacc,
      terminalMultiple: c.defaultDcf.terminalMultiple,
      targetTrueFcfMarginPct: Math.max(
        1.5,
        c.defaultDcf.targetFcfMargin - c.defaultDcf.sbcDragPct
      ),
      currentTrueFcfMarginPct: latest.trueFcfMargin,
    });

    return {
      ticker: c.ticker,
      name: c.name,
      exchange: c.exchange,
      sector: c.sector,
      marketCap: c.marketCap,
      revenue: latest.revenue,
      reportedFcf: latest.reportedFcf,
      sbc: latest.sbc,
      trueFcf: latest.trueFcf,
      trueFcfMargin: Number(latest.trueFcfMargin.toFixed(1)),
      sbcPctRevenue: Number(latest.sbcPctRevenue.toFixed(1)),
      sbcPctReportedFcf: Number(latest.sbcPctReportedFcf.toFixed(1)),
      netDilutionCagr: Number(dilution.toFixed(2)),
      impliedCagr: Number(dcf.impliedRevenueCagrPct.toFixed(1)),
      lastFilingDate: c.lastFiling.date,
    };
  });

  fs.writeFileSync(companiesPath, JSON.stringify(snapshots, null, 2) + "\n");
  fs.writeFileSync(indexPath, JSON.stringify(searchIndex, null, 2) + "\n");

  if (db) {
    console.log(
      `[amber-prices] Updating ${updatedCount} prices in Neon Postgres...`
    );
    const chunkSize = 20;
    for (let i = 0; i < snapshots.length; i += chunkSize) {
      const slice = snapshots.slice(i, i + chunkSize);
      await Promise.all(
        slice.map((c) =>
          db
            .update(companiesTable)
            .set({
              price: c.price,
              marketCap: c.marketCap,
              priceHistory: c.priceHistory ?? null,
              updatedAt: new Date(),
            })
            .where(eq(companiesTable.ticker, c.ticker))
        )
      );
    }
  }

  console.log(
    `[amber-prices] ✓ Updated live EOD prices for ${updatedCount}/${snapshots.length} companies.`
  );
}

run();
