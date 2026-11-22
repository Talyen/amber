import { unstable_cache } from "next/cache";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { annualFinancials, companies, filingDiffs } from "@/db/schema";
import {
  ALL_COMPANIES,
  SEARCH_INDEX,
  getCompany as getStaticCompany,
  type SearchIndexEntry,
} from "@/data/universe";
import {
  type CompanySnapshot,
  type FilingDiffItem,
  computeAnnualMetrics,
  computeEnterpriseValue,
  computeNetDilutionCagr,
  solveReverseDcf,
} from "@/lib/finance";

async function queryCompanyFromDb(
  ticker: string
): Promise<CompanySnapshot | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const [row] = await db
      .select()
      .from(companies)
      .where(eq(companies.ticker, ticker))
      .limit(1);

    if (!row) return null;

    const [annualRows, diffRows] = await Promise.all([
      db
        .select()
        .from(annualFinancials)
        .where(eq(annualFinancials.ticker, ticker))
        .orderBy(asc(annualFinancials.sortOrder)),
      db
        .select()
        .from(filingDiffs)
        .where(eq(filingDiffs.ticker, ticker))
        .orderBy(desc(filingDiffs.filingDate)),
    ]);

    if (annualRows.length === 0) return null;

    return {
      ticker: row.ticker,
      cik: row.cik,
      name: row.name,
      exchange: row.exchange === "NYSE" ? "NYSE" : "NASDAQ",
      sector: row.sector,
      tagline: row.tagline,
      price: row.price,
      marketCap: row.marketCap,
      cashAndEquiv: row.cashAndEquiv,
      totalDebt: row.totalDebt,
      lastFiling: {
        type: row.lastFilingType === "10-Q" ? "10-Q" : "10-K",
        date: row.lastFilingDate,
        periodEnd: row.lastFilingPeriodEnd,
        accessionNumber: row.lastFilingAccession,
      },
      annuals: annualRows.map((a) => ({
        fiscalYear: a.fiscalYear,
        revenue: a.revenue,
        operatingCashFlow: a.operatingCashFlow,
        capex: a.capex,
        sbc: a.sbc,
        buybacks: a.buybacks,
        dilutedShares: a.dilutedShares,
      })),
      defaultDcf: row.defaultDcf,
      filingDiffs: diffRows.map((d) => ({
        id: d.id,
        filingType: d.filingType as FilingDiffItem["filingType"],
        filingDate: d.filingDate,
        accessionNumber: d.accessionNumber,
        section: d.section,
        category: d.category as FilingDiffItem["category"],
        materiality: d.materiality as FilingDiffItem["materiality"],
        headline: d.headline,
        summary: d.summary,
        priorExcerpt: d.priorExcerpt,
        currentExcerpt: d.currentExcerpt,
        signalNote: d.signalNote,
      })),
    };
  } catch (err) {
    console.warn(`[amber-repo] Neon query failed for ${ticker}, using static snapshot:`, err);
    return null;
  }
}

export async function getCompanySnapshot(
  rawTicker: string
): Promise<CompanySnapshot | undefined> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!process.env.DATABASE_URL) {
    return getStaticCompany(ticker);
  }

  const cachedFetch = unstable_cache(
    async () => queryCompanyFromDb(ticker),
    ["amber-company", ticker],
    {
      revalidate: 86400,
      tags: ["companies", `ticker-${ticker}`],
    }
  );

  const fromDb = await cachedFetch();
  return fromDb ?? getStaticCompany(ticker);
}

export async function getAllTickers(): Promise<string[]> {
  const db = getDb();
  if (!db) {
    return ALL_COMPANIES.map((c) => c.ticker);
  }

  try {
    const rows = await db.select({ ticker: companies.ticker }).from(companies);
    if (rows.length > 0) {
      return rows.map((r) => r.ticker);
    }
  } catch {
    // Fallback to static universe
  }
  return ALL_COMPANIES.map((c) => c.ticker);
}

async function querySearchIndexFromDb(): Promise<SearchIndexEntry[] | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const [companyRows, annualRows] = await Promise.all([
      db.select().from(companies),
      db
        .select()
        .from(annualFinancials)
        .orderBy(asc(annualFinancials.sortOrder)),
    ]);

    if (companyRows.length === 0) return null;

    const annualsByTicker = new Map<string, typeof annualRows>();
    for (const row of annualRows) {
      const list = annualsByTicker.get(row.ticker) ?? [];
      list.push(row);
      annualsByTicker.set(row.ticker, list);
    }

    const index: SearchIndexEntry[] = [];
    for (const c of companyRows) {
      const annuals = annualsByTicker.get(c.ticker);
      if (!annuals || annuals.length === 0) continue;

      const computed = computeAnnualMetrics(annuals);
      const latest = computed[computed.length - 1];
      const ev = computeEnterpriseValue({
        marketCap: c.marketCap,
        totalDebt: c.totalDebt,
        cashAndEquiv: c.cashAndEquiv,
      } as CompanySnapshot);
      const dilution = computeNetDilutionCagr(annuals);
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

      index.push({
        ticker: c.ticker,
        name: c.name,
        exchange: c.exchange === "NYSE" ? "NYSE" : "NASDAQ",
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
        lastFilingDate: c.lastFilingDate,
      });
    }

    return index.length > 0 ? index : null;
  } catch (err) {
    console.warn("[amber-repo] Neon search index failed, using static index:", err);
    return null;
  }
}

export async function getSearchIndex(): Promise<SearchIndexEntry[]> {
  if (!process.env.DATABASE_URL) {
    return SEARCH_INDEX;
  }

  const cachedFetch = unstable_cache(
    async () => querySearchIndexFromDb(),
    ["amber-search-index"],
    {
      revalidate: 86400,
      tags: ["companies"],
    }
  );

  const fromDb = await cachedFetch();
  return fromDb ?? SEARCH_INDEX;
}
