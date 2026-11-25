import { computeAnnualMetrics, type CompanySnapshot } from "./finance.ts";

export interface CompareHistoryPoint {
  fiscalYear: string;
  revenue: number;
  trueFcfMargin: number;
  sbcPctRevenue: number;
  dilutedShares: number;
}

export interface CompareCompanyHistory {
  ticker: string;
  name: string;
  points: CompareHistoryPoint[];
}

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
  company: Pick<CompanySnapshot, "ticker" | "name" | "annuals">
): CompareCompanyHistory {
  const computed = computeAnnualMetrics(company.annuals).filter(
    (row) => row.fiscalYear !== "TTM"
  );
  return {
    ticker: company.ticker,
    name: company.name,
    points: computed.slice(-5).map((row) => ({
      fiscalYear: row.fiscalYear,
      revenue: row.revenue,
      trueFcfMargin: Number(row.trueFcfMargin.toFixed(1)),
      sbcPctRevenue: Number(row.sbcPctRevenue.toFixed(1)),
      dilutedShares: row.dilutedShares,
    })),
  };
}
