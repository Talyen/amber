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
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  annualFinancials,
  companies,
  filingDiffs,
} from "../src/db/schema.ts";
import type { CompanySnapshot } from "../src/lib/finance.ts";
import type { EdgarSnapshot } from "./ingest-edgar.ts";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function selectFinancialSnapshots(
  snapshots: EdgarSnapshot[],
  existingFallbackTickers: ReadonlySet<string>
) {
  return snapshots.filter((company) =>
    company.annuals.length > 0 &&
    (!company.edgarFallback || !existingFallbackTickers.has(company.ticker))
  );
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
  ) as EdgarSnapshot[];

  const universePath = process.env.AMBER_INGEST_UNIVERSE_PATH;
  const universe: unknown = universePath
    ? JSON.parse(fs.readFileSync(universePath, "utf8"))
    : [];
  if (!Array.isArray(universe) || !universe.every((ticker) => typeof ticker === "string" && ticker.length > 0)) {
    throw new Error("Invalid EDGAR universe file.");
  }

  const client = neon(url);
  const db = drizzle(client);

  const t0 = Date.now();
  console.log(
    `[amber-seed] Batch-upserting ${snapshots.length} companies into Neon Postgres...`
  );

  const hasQuote = (c: Pick<CompanySnapshot, "price" | "marketCap">) =>
    Number.isFinite(c.price) && c.price > 0 && Number.isFinite(c.marketCap) && c.marketCap > 0;
  const fallbackTickers = snapshots.filter((c) => c.edgarFallback).map((c) => c.ticker);
  const existingFallbacks = fallbackTickers.length > 0
    ? await db.select({ ticker: companies.ticker }).from(companies)
        .where(inArray(companies.ticker, fallbackTickers))
    : [];
  const existingFallbackTickers = new Set(existingFallbacks.map(({ ticker }) => ticker));
  const financialSnapshots = selectFinancialSnapshots(snapshots, existingFallbackTickers);
  if (existingFallbackTickers.size > 0) {
    console.log(`[amber-seed] Preserving saved financials for ${existingFallbackTickers.size} fallback ticker(s).`);
  }
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
  const skippedInvalid = snapshots.length - existingFallbackTickers.size - validSnapshots.length;
  if (skippedInvalid > 0) {
    console.warn(
      `[amber-seed] Skipping ${skippedInvalid} ticker(s) with missing financial periods or invalid EOD valuation.`
    );
  }

  // Keep existing quotes; sync-prices owns market data updates after the first insert.
  // Replace each company's financial window in the same transaction as its filing metadata.
  let seededAnnualCount = 0;
  const fresh = validSnapshots.filter((company) => !company.edgarFallback);
  const fallback = validSnapshots.filter((company) => company.edgarFallback);
  for (const batch of [...chunk(fresh, 30), ...chunk(fallback, 30)]) {
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
        depreciationAmortization: a.depreciationAmortization ?? null,
        goodwillIntangibles: a.goodwillIntangibles ?? null,
        dividendsPaid: a.dividendsPaid ?? null,
        periodEndDate: a.periodEndDate ?? null,
        cashAndEquiv: a.cashAndEquiv ?? null,
        totalDebt: a.totalDebt ?? null,
      }))
    );

    const insertCompanies = db.insert(companies).values(companyRows);
    const insertAnnuals = db.insert(annualFinancials).values(annualRows);
    if (batch[0].edgarFallback) {
      // A concurrent insert aborts this whole batch, preserving the newer row.
      await db.batch([insertCompanies, insertAnnuals]);
      seededAnnualCount += annualRows.length;
      continue;
    }

    const olderFiling = sql`(excluded.last_filing_period_end, excluded.last_filing_date) <
      (${companies.lastFilingPeriodEnd}, ${companies.lastFilingDate})`;
    await db.batch([
      insertCompanies.onConflictDoUpdate({
        target: companies.ticker,
        set: {
          cik: sql`excluded.cik`,
          name: sql`excluded.name`,
          exchange: sql`excluded.exchange`,
          sector: sql`excluded.sector`,
          tagline: sql`excluded.tagline`,
          cashAndEquiv: sql`excluded.cash_and_equiv`,
          totalDebt: sql`excluded.total_debt`,
          lastFilingType: sql`case when ${olderFiling} then ${companies.lastFilingType} else excluded.last_filing_type end`,
          lastFilingDate: sql`case when ${olderFiling} then ${companies.lastFilingDate} else excluded.last_filing_date end`,
          lastFilingPeriodEnd: sql`case when ${olderFiling} then ${companies.lastFilingPeriodEnd} else excluded.last_filing_period_end end`,
          lastFilingAccession: sql`case when ${olderFiling} then ${companies.lastFilingAccession} else excluded.last_filing_accession end`,
          defaultDcf: sql`excluded.default_dcf`,
          quarterlyFinancials: sql`excluded.quarterly_financials`,
          isActive: true,
          updatedAt: sql`excluded.updated_at`,
        },
      }),
      insertAnnuals.onConflictDoUpdate({
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
          depreciationAmortization: sql`excluded.depreciation_amortization`,
          goodwillIntangibles: sql`excluded.goodwill_intangibles`,
          dividendsPaid: sql`excluded.dividends_paid`,
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

  // Batch filing diffs without deleting previously extracted prose.
  const diffRowsFor = (snapshots: EdgarSnapshot[]) => snapshots.flatMap((c) =>
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

  const diffRows = diffRowsFor(fresh);
  const fallbackDiffRows = diffRowsFor(fallback);
  for (const batch of chunk(diffRows, 100)) {
    await db
      .insert(filingDiffs)
      .values(batch)
      .onConflictDoUpdate({
        target: filingDiffs.id,
        set: {
          filingType: sql`excluded.filing_type`,
          filingDate: sql`excluded.filing_date`,
          accessionNumber: sql`excluded.accession_number`,
          headline: sql`excluded.headline`,
          summary: sql`excluded.summary`,
          priorExcerpt: sql`excluded.prior_excerpt`,
          currentExcerpt: sql`excluded.current_excerpt`,
          signalNote: sql`excluded.signal_note`,
          source: sql`excluded.source`,
        },
      });
  }
  for (const batch of chunk(fallbackDiffRows, 100)) {
    await db.insert(filingDiffs).values(batch).onConflictDoNothing();
  }

  // Use the directory selection so failed company fetches leave existing rows active.
  const selectedTickers = new Set(universe);
  if (validSnapshots.length >= 50 && validSnapshots.every((company) => selectedTickers.has(company.ticker))) {
    await db
      .update(companies)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(companies.isActive, true), notInArray(companies.ticker, universe)));
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[amber-seed] ✓ Batch-seeded ${validSnapshots.length} companies (${seededAnnualCount} financial periods, ${diffRows.length + fallbackDiffRows.length} diffs) into Neon in ${elapsed}s.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
