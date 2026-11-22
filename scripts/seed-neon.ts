/**
 * Idempotent Neon Postgres Seeder (Phase 2)
 *
 * Upserts all companies, multi-year annual financials, and filing diffs from
 * `src/data/generated/companies.json` into Neon Postgres via Drizzle ORM.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." pnpm db:seed
 */

import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  annualFinancials,
  companies,
  filingDiffs,
} from "../src/db/schema.ts";
import type { CompanySnapshot } from "../src/lib/finance.ts";

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(
      "[amber-seed] DATABASE_URL is not set — skipping Neon upsert (app will serve static JSON snapshots)."
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

  const sql = neon(url);
  const db = drizzle(sql);

  console.log(
    `[amber-seed] Upserting ${snapshots.length} companies into Neon Postgres...`
  );

  for (const c of snapshots) {
    await db
      .insert(companies)
      .values({
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
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: companies.ticker,
        set: {
          name: c.name,
          price: c.price,
          marketCap: c.marketCap,
          cashAndEquiv: c.cashAndEquiv,
          totalDebt: c.totalDebt,
          lastFilingType: c.lastFiling.type,
          lastFilingDate: c.lastFiling.date,
          lastFilingPeriodEnd: c.lastFiling.periodEnd,
          lastFilingAccession: c.lastFiling.accessionNumber,
          defaultDcf: c.defaultDcf,
          updatedAt: new Date(),
        },
      });

    for (let i = 0; i < c.annuals.length; i++) {
      const a = c.annuals[i];
      await db
        .insert(annualFinancials)
        .values({
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
        })
        .onConflictDoUpdate({
          target: annualFinancials.id,
          set: {
            sortOrder: i,
            revenue: a.revenue,
            operatingCashFlow: a.operatingCashFlow,
            capex: a.capex,
            sbc: a.sbc,
            buybacks: a.buybacks,
            dilutedShares: a.dilutedShares,
          },
        });
    }

    for (const d of c.filingDiffs) {
      await db
        .insert(filingDiffs)
        .values({
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
        })
        .onConflictDoUpdate({
          target: filingDiffs.id,
          set: {
            headline: d.headline,
            summary: d.summary,
            priorExcerpt: d.priorExcerpt,
            currentExcerpt: d.currentExcerpt,
            signalNote: d.signalNote,
          },
        });
    }
  }

  console.log(`[amber-seed] ✓ Seeded ${snapshots.length} companies into Neon.`);
}

run();
