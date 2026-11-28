import type { AnnualFinancials } from "../lib/finance.ts";

type FilingSupplement = {
  revenue?: number;
  capex?: number;
  cashAndEquiv?: number;
  totalDebt?: number;
  dilutedShares?: number;
  marketCapShares?: number;
  valuationShares?: number;
  earningsOnReportedShares?: true;
};

// Amounts in USD or shares, in millions. These items are missing from the
// standard consolidated tags in SEC Company Facts. Match by CIK and period.
export const FILING_SUPPLEMENTS: Record<string, Record<string, FilingSupplement>> = {
  // Consolidated net sales from General Mills’ statements of earnings.
  // https://www.sec.gov/Archives/edgar/data/40704/000119312524168943/d764890d10k.htm
  "0000040704": {
    "2022-05-29": { revenue: 18992.8 },
    "2023-05-28": { revenue: 20094.2 },
    "2024-05-26": { revenue: 19857.2 },
  },
  // Regency Centers parent-company diluted EPS denominators.
  // https://www.sec.gov/Archives/edgar/data/910606/000119312526051668/reg-20251231.htm
  // https://www.sec.gov/Archives/edgar/data/910606/000119312526203537/reg-20260331.htm
  // https://www.sec.gov/Archives/edgar/data/910606/000119312526451423/reg-20260930.htm
  "0000910606": {
    "2021-12-31": { dilutedShares: 170.694 },
    "2022-12-31": { dilutedShares: 171.791 },
    "2023-12-31": { dilutedShares: 176.371 },
    "2024-12-31": { dilutedShares: 183.040 },
    "2025-12-31": { dilutedShares: 182.234 },
    "2026-03-31": { dilutedShares: 183.382 },
    "2026-06-30": { dilutedShares: 183.351 },
    "2026-09-30": { dilutedShares: 183.467 },
  },
  // GE Aerospace Note 10 borrowings and liquidity. Exclude the separately
  // reported non-current investment portfolio from cash.
  // https://www.sec.gov/Archives/edgar/data/40545/000004054526000064/ge-20260930.htm
  "0000040545": {
    "2026-09-30": { cashAndEquiv: 10264, totalDebt: 19326 },
  },
  // GameStop reports the notes as debt. Use common shares before note
  // conversion for valuation and preserve diluted shares for reported EPS.
  // https://www.sec.gov/Archives/edgar/data/1326380/000132638026000055/gme-20260801.htm
  "0001326380": {
    "2026-01-31": { totalDebt: 4164.3, valuationShares: 448.3 },
    "2026-08-01": { totalDebt: 4167.8, valuationShares: 449.1 },
  },
  // Oracle current and noncurrent notes payable and other borrowings.
  // https://www.sec.gov/Archives/edgar/data/1341439/000119312526389274/orcl-20260831.htm
  "0001341439": {
    "2026-05-31": { totalDebt: 129541 },
    "2026-08-31": { totalDebt: 125337 },
  },
  // YPF cash purchases of PP&E and intangibles, and total current + noncurrent loans.
  // https://www.sec.gov/Archives/edgar/data/904851/000119312526126363/d95578d20f.htm
  "0000904851": {
    "2023-12-31": { capex: 5673, totalDebt: 8190 },
    "2024-12-31": { capex: 5392, totalDebt: 8942 },
    "2025-12-31": { capex: 5077, totalDebt: 10581 },
  },
  // Permian Resources cash drilling/development capex plus purchases of other PP&E.
  // https://www.sec.gov/Archives/edgar/data/1658566/000165856626000035/pr-20251231.htm
  // https://www.sec.gov/Archives/edgar/data/1658566/000165856626000124/pr-20260930.htm
  "0001658566": {
    "2023-12-31": { capex: 1559.382 },
    "2024-12-31": { capex: 2073.512 },
    "2025-12-31": { capex: 1979.608 },
    "2026-09-30": { capex: 2009.823 },
  },
  // Symbotic's cash capex includes capitalized internal-use software. The
  // weighted-average Class A count is retained for reported EPS.
  // https://www.sec.gov/Archives/edgar/data/1837240/000183724026000049/sym-20260926.htm
  "0001837240": {
    "2024-09-28": { capex: 44.374 },
    "2025-09-27": { capex: 79.030 },
    "2026-09-26": {
      capex: 84.244, totalDebt: 0, marketCapShares: 605.70344,
      valuationShares: 605.70344, earningsOnReportedShares: true,
    },
  },
  // Super Micro current and noncurrent credit lines, term loans, and convertible notes.
  // https://www.sec.gov/Archives/edgar/data/1375365/000137536526000027/smci-20260930.htm
  "0001375365": {
    "2026-06-30": { totalDebt: 8720.287 },
    "2026-09-30": { totalDebt: 8646.017 },
  },
  // Sandisk extinguished the term loan and reported its revolver undrawn.
  // https://www.sec.gov/Archives/edgar/data/2023554/000162828026068601/sndk-20261002.htm
  "0002023554": {
    "2026-07-03": { totalDebt: 0 },
    "2026-10-02": { totalDebt: 0 },
  },
  "0001577552": {
    // Alibaba reports acquisition of land use rights, property and equipment.
    // Prior periods use the USD translation rate in each year's annual report.
    // https://www.sec.gov/Archives/edgar/data/1577552/000110465922065269/tm2217018d1_ex99-1.htm
    "2022-03-31": { capex: 8409 },
    // https://www.sec.gov/Archives/edgar/data/1577552/000095017023033752/baba-20230331.htm
    "2023-03-31": { capex: 4999 },
    // https://www.sec.gov/Archives/edgar/data/1577552/000119312524145954/d842337dex991.pdf
    "2024-03-31": { capex: 4444 },
    // https://www.sec.gov/Archives/edgar/data/1577552/000095017025090161/baba-ex15_5.htm
    "2025-03-31": { capex: 11847, cashAndEquiv: 51582, totalDebt: 31792 },
    // Cash plus short-term investments. Debt sums bank borrowings and senior,
    // convertible and exchangeable notes at their consolidated carrying value.
    // https://www.sec.gov/Archives/edgar/data/1577552/000119312526231755/baba-20260331.htm
    "2026-03-31": { capex: 18275, cashAndEquiv: 41583, totalDebt: 37692 },
  },
  "0001403161": {
    // Visa files share counts by class. Use Class A-equivalent diluted averages
    // for the ledger, and the period-end common shares from Note 15 for valuation.
    // https://www.sec.gov/Archives/edgar/data/1403161/000140316124000058/v-20240930.htm
    "2022-09-30": { dilutedShares: 2136 },
    "2023-09-30": { dilutedShares: 2085 },
    // https://www.sec.gov/Archives/edgar/data/1403161/000140316126000134/v-20260930.htm
    "2024-09-30": { dilutedShares: 2029 },
    "2025-09-30": { dilutedShares: 1966, marketCapShares: 1930 },
    "2026-09-30": { dilutedShares: 1907, marketCapShares: 1867 },
  },
};

// One ordinary share represents five Mizuho ADRs. Early snapshots stored ordinary
// share counts. The threshold distinguishes those rows from already converted data.
// https://www.mizuhogroup.com/investors/financial-information/stock-information
const MIZUHO_ORDINARY_SHARES_MAX_M = 4000;

type ListedSecurity = { ticker: string; priceAsOf?: string | null };

export function listedShareCount(ticker: string, shares: number): number {
  return ticker === "MFG" && shares > 0 && shares < MIZUHO_ORDINARY_SHARES_MAX_M
    ? shares * 5 : shares;
}

// https://www.sec.gov/Archives/edgar/data/2023554/000162828026068243/sndk-20261029.htm
export function splitAdjustedValuationShares(
  { ticker, priceAsOf }: ListedSecurity,
  shares: number,
  periodEndDate: string | null | undefined,
): number {
  if (ticker === "SNDK" && priceAsOf && priceAsOf >= "2026-11-20" &&
      periodEndDate && periodEndDate < "2026-11-20" && shares > 0 && shares < 300) {
    return shares * 8;
  }
  return shares;
}

export function reconcileFilingInputs<T extends {
  ticker: string;
  cik?: string;
  price: number;
  priceAsOf?: string | null;
  marketCap?: number;
  cashAndEquiv: number;
  totalDebt: number;
  annuals: AnnualFinancials[];
}>(company: T): T {
  const cik = company.cik?.padStart(10, "0");
  const supplements = cik && FILING_SUPPLEMENTS[cik];
  if (!supplements && company.ticker !== "MFG") return company;

  const annuals = company.annuals.map((row) => {
    const supplement = supplements && row.periodEndDate ? supplements[row.periodEndDate] : undefined;
    return {
      ...row,
      revenue: supplement?.revenue ?? row.revenue,
      capex: supplement?.capex ?? row.capex,
      dilutedShares: splitAdjustedValuationShares(
        company, supplement?.dilutedShares ?? listedShareCount(company.ticker, row.dilutedShares), row.periodEndDate,
      ),
      cashAndEquiv: supplement?.cashAndEquiv ?? row.cashAndEquiv,
      totalDebt: supplement?.totalDebt ?? row.totalDebt,
    };
  });
  const latest = annuals.at(-1);
  const supplement = supplements && latest?.periodEndDate ? supplements[latest.periodEndDate] : undefined;
  let marketCap = company.marketCap;
  if (marketCap != null && company.price > 0) {
    const storedShares = marketCap / company.price;
    const shares = supplement?.marketCapShares ?? listedShareCount(company.ticker, storedShares);
    const adjustedShares = splitAdjustedValuationShares(company, shares, latest?.periodEndDate);
    if (Math.abs(adjustedShares - storedShares) > 0.001) marketCap = Math.round(adjustedShares * company.price);
  }
  return {
    ...company,
    annuals,
    marketCap,
    // Apply exact-period corrections to previously stored top-level balances too.
    cashAndEquiv: supplement?.cashAndEquiv ?? company.cashAndEquiv,
    totalDebt: supplement?.totalDebt ?? company.totalDebt,
  };
}

export function getFilingValuationShares(
  company: ListedSecurity & { cik?: string },
  row: AnnualFinancials,
): number {
  const supplement = company.cik && row.periodEndDate
    ? FILING_SUPPLEMENTS[company.cik.padStart(10, "0")]?.[row.periodEndDate] : undefined;
  const shares = supplement?.valuationShares ?? row.dilutedShares;
  return splitAdjustedValuationShares(company, listedShareCount(company.ticker, shares), row.periodEndDate);
}

export function getFilingEarningsShares(
  company: { cik?: string },
  row: AnnualFinancials,
): number | undefined {
  // Earnings for the listed class can have a narrower scope than
  // consolidated cash flows that also accrue to exchangeable units.
  return company.cik && row.periodEndDate &&
    FILING_SUPPLEMENTS[company.cik.padStart(10, "0")]?.[row.periodEndDate]?.earningsOnReportedShares
    ? row.dilutedShares : undefined;
}
