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
    }>;
  };
}

async function fetchLatestClose(ticker: string): Promise<number | null> {
  // Yahoo uses '-' instead of '.' for class shares (e.g. BRK-B)
  const symbol = ticker.replace(/\./g, "-");
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AmberFinance/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResponse;
    const meta = json.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? null;
    return typeof price === "number" && Number.isFinite(price) && price > 0
      ? Number(price.toFixed(2))
      : null;
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
    const prices = await Promise.all(
      batch.map((c) => fetchLatestClose(c.ticker))
    );

    for (let j = 0; j < batch.length; j++) {
      const company = batch[j];
      const livePrice = prices[j];
      if (!livePrice) continue;

      const latestShares =
        company.annuals[company.annuals.length - 1]?.dilutedShares ?? 0;
      if (latestShares <= 0) continue;

      company.price = livePrice;
      company.marketCap = Math.round(livePrice * latestShares);
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
