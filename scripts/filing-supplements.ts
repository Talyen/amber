type FilingSupplement = {
  capex?: number;
  cashAndEquiv?: number;
  totalDebt?: number;
  dilutedShares?: number;
  marketCapShares?: number;
};

// Amounts in USD or shares, in millions. These items are missing from the
// standard consolidated tags in SEC Company Facts. Match by CIK and period.
export const FILING_SUPPLEMENTS: Record<string, Record<string, FilingSupplement>> = {
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
