import { isFinancialInstitution, isReit } from "./finance.ts";
import { isFreshPriceDate } from "./market-price.ts";

export interface CoverageSummary {
  totalCompanies: number;
  freshQuotes: number;
  dividendPayers: number;
  banksWithTbv: number;
  reitsWithFfo: number;
  recentFilings90d: number;
}

export interface CoverageRowLike {
  ticker: string;
  sector: string;
  priceAsOf?: string | null;
  dividendYieldPct?: number;
  priceToTbv?: number | null;
  priceToFfo?: number | null;
  lastFilingDate?: string;
}

const NINETY_DAYS_MS = 90 * 86_400_000;

export function summarizeSearchIndexCoverage(
  rows: ReadonlyArray<CoverageRowLike>,
  nowMs = Date.now()
): CoverageSummary {
  let freshQuotes = 0;
  let dividendPayers = 0;
  let banksWithTbv = 0;
  let reitsWithFfo = 0;
  let recentFilings90d = 0;

  for (const row of rows) {
    if (isFreshPriceDate(row.priceAsOf, nowMs)) freshQuotes++;
    if (typeof row.dividendYieldPct === "number" && row.dividendYieldPct > 0) {
      dividendPayers++;
    }
    if (isFinancialInstitution(row) && typeof row.priceToTbv === "number" && row.priceToTbv > 0) {
      banksWithTbv++;
    }
    if (isReit(row) && typeof row.priceToFfo === "number" && row.priceToFfo > 0) {
      reitsWithFfo++;
    }
    if (typeof row.lastFilingDate === "string") {
      const filingMs = Date.parse(`${row.lastFilingDate}T00:00:00Z`);
      if (Number.isFinite(filingMs) && nowMs - filingMs <= NINETY_DAYS_MS && nowMs - filingMs >= -86_400_000) {
        recentFilings90d++;
      }
    }
  }

  return {
    totalCompanies: rows.length,
    freshQuotes,
    dividendPayers,
    banksWithTbv,
    reitsWithFfo,
    recentFilings90d,
  };
}
