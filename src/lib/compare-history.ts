import { computeAnnualMetrics, isFinancialInstitution, type CompanySnapshot } from "./finance.ts";

export interface CompareHistoryPoint {
  fiscalYear: string;
  revenue: number;
  trueFcfMargin: number | null;
  sbcPctRevenue: number;
  dilutedShares: number;
}

export interface CompareCompanyHistory {
  ticker: string;
  name: string;
  points: CompareHistoryPoint[];
}

export const COMPARE_HISTORY_YEARS = 5;

type IndexedMetric = "revenue" | "dilutedShares";

export function indexCompareHistory(
  points: readonly CompareHistoryPoint[],
  metric: IndexedMetric,
) {
  const first = points.findIndex((point) => Number.isFinite(point[metric]) && point[metric] > 0);
  if (first === -1) return [];
  const baseline = points[first][metric];
  return points.slice(first).flatMap((point) => {
    const amount = point[metric];
    if (!Number.isFinite(amount) || amount < 0 || (metric === "dilutedShares" && amount === 0)) return [];
    return [{ fiscalYear: point.fiscalYear, value: (amount / baseline) * 100 }];
  });
}

export function buildCompareCompanyHistory(
  company: Pick<CompanySnapshot, "ticker" | "name" | "sector" | "annuals"> &
    Partial<Pick<CompanySnapshot, "cik" | "sic" | "businessFacts">>
): CompareCompanyHistory {
  const equityLensOnly = isFinancialInstitution(company);
  const fiscalYears = company.annuals.filter((row) => row.fiscalYear !== "TTM").slice(-COMPARE_HISTORY_YEARS);
  return {
    ticker: company.ticker,
    name: company.name,
    points: computeAnnualMetrics(fiscalYears).map((row) => ({
      fiscalYear: row.fiscalYear,
      revenue: row.revenue,
      trueFcfMargin: equityLensOnly ? null : Number(row.trueFcfMargin.toFixed(1)),
      sbcPctRevenue: Number(row.sbcPctRevenue.toFixed(1)),
      dilutedShares: row.dilutedShares,
    })),
  };
}
