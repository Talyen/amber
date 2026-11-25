import type { CompanySnapshot, ComputedAnnual } from "./finance.ts";

export function indexPriceAndFundamentals(
  company: Pick<CompanySnapshot, "price" | "priceHistory">,
  series: readonly Pick<ComputedAnnual, "fiscalYear" | "dilutedShares" | "trueFcf" | "revenue">[],
) {
  const prices = new Map(company.priceHistory?.map(({ fiscalYear, price }) => [fiscalYear, price]));
  const aligned = series.flatMap((row, index) => {
    const price = prices.get(row.fiscalYear) ?? (index === series.length - 1 ? company.price : undefined);
    if (price === undefined || !Number.isFinite(price) || price <= 0 ||
      !Number.isFinite(row.dilutedShares) || row.dilutedShares <= 0) return [];
    return [{
      fiscalYear: row.fiscalYear,
      price,
      trueFcfPerShare: row.trueFcf / row.dilutedShares,
      revenuePerShare: row.revenue / row.dilutedShares,
    }];
  });
  if (aligned.length < 2) return null;

  const useFcf = aligned[0].trueFcfPerShare > 0 && aligned[aligned.length - 1].trueFcfPerShare > 0;
  const metric = useFcf ? "trueFcfPerShare" : "revenuePerShare";
  const first = aligned.findIndex((point) => Number.isFinite(point[metric]) && point[metric] > 0);
  if (first === -1) return null;

  const baseline = aligned[first];
  const points = aligned.slice(first).flatMap((point) => {
    const fundVal = point[metric];
    const priceIdx = (point.price / baseline.price) * 100;
    const fundIdx = (fundVal / baseline[metric]) * 100;
    if (!Number.isFinite(priceIdx) || !Number.isFinite(fundIdx)) return [];
    return [{ fiscalYear: point.fiscalYear, price: point.price, fundVal, priceIdx, fundIdx }];
  });
  return points.length < 2 ? null : { indexed: points, fundLabel: useFcf ? "True FCF / Share" : "Revenue / Share" };
}
