/**
 * High-Performance Chunked Neon Postgres Seeder (Phase 3)
 *
 * Uses multi-row batch `INSERT ... ON CONFLICT DO UPDATE` so seeding
 * 150–5,000+ companies completes in seconds over Neon serverless HTTP.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." pnpm db:seed
 */

import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, inArray, notInArray, sql } from "drizzle-orm";
import {
  annualFinancials,
  companies,
  filingDiffs,
} from "../src/db/schema.ts";
import type { CompanySnapshot } from "../src/lib/finance.ts";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(
      "[amber-seed] DATABASE_URL is not set — skipping Neon upsert."
    );
    return;
  }

  const companiesPath = path.resolve(
    process.cwd(),
    "src/data/generated/companies.json"
  );
  const snapshots = JSON.parse(
    fs.readFileSync(companiesPath, "utf8")
  ) as CompanySnapshot[];

  const client = neon(url);
  const db = drizzle(client);

  const t0 = Date.now();
  console.log(
    `[amber-seed] Batch-upserting ${snapshots.length} companies into Neon Postgres...`
  );

  const hasQuote = (c: Pick<CompanySnapshot, "price" | "marketCap">) =>
    Number.isFinite(c.price) && c.price > 0 && Number.isFinite(c.marketCap) && c.marketCap > 0;
  const financialSnapshots = snapshots.filter((c) => c.annuals.length > 0);
  const missingQuotes = financialSnapshots.filter((c) => !hasQuote(c)).map((c) => c.ticker);
  const savedQuotes = missingQuotes.length > 0
    ? await db.select({
        ticker: companies.ticker,
        price: companies.price,
        marketCap: companies.marketCap,
      }).from(companies).where(inArray(companies.ticker, missingQuotes))
    : [];
  const quoteByTicker = new Map(savedQuotes.map((quote) => [quote.ticker, quote]));
  const validSnapshots = financialSnapshots.flatMap((company) => {
    if (hasQuote(company)) return [company];
    const saved = quoteByTicker.get(company.ticker);
    return saved && hasQuote(saved) ? [{ ...company, ...saved }] : [];
  });
  if (validSnapshots.length < snapshots.length) {
    console.warn(
      `[amber-seed] Skipping ${snapshots.length - validSnapshots.length} ticker(s) with missing financial periods or invalid EOD valuation.`
    );
  }

  // Keep existing quotes; sync-prices owns market data updates after the first insert.
  // Replace each company's financial window in the same transaction as its filing metadata.
  let seededAnnualCount = 0;
  for (const batch of chunk(validSnapshots, 30)) {
    const companyRows = batch.map((c) => ({
      ticker: c.ticker,
      cik: c.cik,
      name: c.name,
      exchange: c.exchange,
      sector: c.sector,
      tagline: c.tagline,
      price: c.price,
      marketCap: c.marketCap,
      cashAndEquiv: c.cashAndEquiv,
      totalDebt: c.totalDebt,
      lastFilingType: c.lastFiling.type,
      lastFilingDate: c.lastFiling.date,
      lastFilingPeriodEnd: c.lastFiling.periodEnd,
      lastFilingAccession: c.lastFiling.accessionNumber,
      defaultDcf: c.defaultDcf,
      priceHistory: c.priceHistory ?? null,
      quarterlyFinancials:
        c.quarterlyFinancials && c.quarterlyFinancials.length >= 4
          ? c.quarterlyFinancials
          : null,
      isActive: true,
      updatedAt: new Date(),
    }));
    const annualRows = batch.flatMap((c) =>
      c.annuals.map((a, i) => ({
        id: `${c.ticker}:${a.fiscalYear}`,
        ticker: c.ticker,
        fiscalYear: a.fiscalYear,
        sortOrder: i,
        revenue: a.revenue,
        operatingCashFlow: a.operatingCashFlow,
        capex: a.capex,
        sbc: a.sbc,
        buybacks: a.buybacks,
        dilutedShares: a.dilutedShares,
        grossProfit: a.grossProfit ?? null,
        rdExpense: a.rdExpense ?? null,
        sgaExpense: a.sgaExpense ?? null,
        operatingIncome: a.operatingIncome ?? null,
        netIncome: a.netIncome ?? null,
        stockholdersEquity: a.stockholdersEquity ?? null,
        periodEndDate: a.periodEndDate ?? null,
        cashAndEquiv: a.cashAndEquiv ?? null,
        totalDebt: a.totalDebt ?? null,
      }))
    );

    await db.batch([
      db
        .insert(companies)
        .values(companyRows)
        .onConflictDoUpdate({
          target: companies.ticker,
          set: {
            name: sql`excluded.name`,
            exchange: sql`excluded.exchange`,
            sector: sql`excluded.sector`,
            tagline: sql`excluded.tagline`,
            cashAndEquiv: sql`excluded.cash_and_equiv`,
            totalDebt: sql`excluded.total_debt`,
            lastFilingType: sql`excluded.last_filing_type`,
            lastFilingDate: sql`excluded.last_filing_date`,
            lastFilingPeriodEnd: sql`excluded.last_filing_period_end`,
            lastFilingAccession: sql`excluded.last_filing_accession`,
            defaultDcf: sql`excluded.default_dcf`,
            quarterlyFinancials: sql`excluded.quarterly_financials`,
            isActive: true,
            updatedAt: sql`excluded.updated_at`,
          },
        }),
      db
        .insert(annualFinancials)
        .values(annualRows)
        .onConflictDoUpdate({
          target: annualFinancials.id,
          set: {
            sortOrder: sql`excluded.sort_order`,
            revenue: sql`excluded.revenue`,
            operatingCashFlow: sql`excluded.operating_cash_flow`,
            capex: sql`excluded.capex`,
            sbc: sql`excluded.sbc`,
            buybacks: sql`excluded.buybacks`,
            dilutedShares: sql`excluded.diluted_shares`,
            grossProfit: sql`excluded.gross_profit`,
            rdExpense: sql`excluded.rd_expense`,
            sgaExpense: sql`excluded.sga_expense`,
            operatingIncome: sql`excluded.operating_income`,
            netIncome: sql`excluded.net_income`,
            stockholdersEquity: sql`excluded.stockholders_equity`,
            periodEndDate: sql`excluded.period_end_date`,
            cashAndEquiv: sql`excluded.cash_and_equiv`,
            totalDebt: sql`excluded.total_debt`,
          },
        }),
      db.delete(annualFinancials).where(
        and(
          inArray(annualFinancials.ticker, batch.map((c) => c.ticker)),
          notInArray(annualFinancials.id, annualRows.map((row) => row.id))
        )
      ),
    ]);
    seededAnnualCount += annualRows.length;
  }

  // Batch upsert filing diffs (100 per HTTP roundtrip)
  // Note: Never deletes existing prose diffs ('llm' / 'text-diff') stored in Neon!
  const diffRows = validSnapshots.flatMap((c) =>
    c.filingDiffs.map((d) => ({
      id: d.id,
      ticker: c.ticker,
      filingType: d.filingType,
      filingDate: d.filingDate,
      accessionNumber: d.accessionNumber,
      section: d.section,
      category: d.category,
      materiality: d.materiality,
      headline: d.headline,
      summary: d.summary,
      priorExcerpt: d.priorExcerpt,
      currentExcerpt: d.currentExcerpt,
      signalNote: d.signalNote,
      source: d.id.includes("-llm-")
        ? "llm"
        : d.id.includes("-10k-diff-")
          ? "text-diff"
          : d.id.includes("-xbrl-")
            ? "xbrl"
            : "curated",
    }))
  );

  for (const batch of chunk(diffRows, 100)) {
    await db
      .insert(filingDiffs)
      .values(batch)
      .onConflictDoUpdate({
        target: filingDiffs.id,
        set: {
          headline: sql`excluded.headline`,
          summary: sql`excluded.summary`,
          priorExcerpt: sql`excluded.prior_excerpt`,
          currentExcerpt: sql`excluded.current_excerpt`,
          signalNote: sql`excluded.signal_note`,
          source: sql`excluded.source`,
        },
      });
  }

  // Soft-deactivate tickers absent from a full universe ingest (never hard-delete,
  //    so user watchlists, filing alerts, and active Arena positions are never cascade-wiped)
  const validTickers = validSnapshots.map((c) => c.ticker);
  if (validTickers.length >= 50) {
    await db
      .update(companies)
      .set({ isActive: false, updatedAt: new Date() })
      .where(notInArray(companies.ticker, validTickers));
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[amber-seed] ✓ Batch-seeded ${snapshots.length} companies (${seededAnnualCount} financial periods, ${diffRows.length} diffs) into Neon in ${elapsed}s.`
  );
}

run();
