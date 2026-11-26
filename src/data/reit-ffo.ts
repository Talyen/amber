// Issuer-reported Nareit FFO from the annual reconciliation, in USD millions.
// Per-share figures are diluted when the issuer reports them. Company Facts
// does not supply these non-GAAP disclosures as standardized financial facts.
interface ReportedFfo {
  commonFfo?: number;
  perShare?: number;
}

const REPORTED_FFO: Partial<Record<string, Record<string, ReportedFfo>>> = {
  // Realty Income: https://www.sec.gov/Archives/edgar/data/726728/000072672826000011/o-20251231.htm
  "726728": {
    "2025-12-31": { commonFfo: 3860.323, perShare: 4.25 },
    "2024-12-31": { commonFfo: 3467.659, perShare: 4.01 },
  },
  // American Tower: https://www.sec.gov/Archives/edgar/data/1053507/000105350726000035/amt-20251231.htm
  "1053507": {
    "2025-12-31": { commonFfo: 4160.9 },
    "2024-12-31": { commonFfo: 5233.2 },
  },
  // Ventas: https://www.sec.gov/Archives/edgar/data/740260/000074026026000006/vtr-20251231.htm
  "740260": {
    "2025-12-31": { commonFfo: 1618.946, perShare: 3.50 },
    "2024-12-31": { commonFfo: 1305.447, perShare: 3.14 },
  },
  // VICI Properties: https://www.sec.gov/Archives/edgar/data/1920791/000170569626000034/vici-20251231.htm
  "1705696": {
    "2025-12-31": { commonFfo: 2775.493, perShare: 2.61 },
    "2024-12-31": { commonFfo: 2678.810, perShare: 2.56 },
  },
  // Regency Centers: https://www.sec.gov/Archives/edgar/data/910606/000119312526039477/reg-ex99_2.htm
  "910606": {
    "2025-12-31": { perShare: 4.64 },
    "2024-12-31": { perShare: 4.30 },
  },
  // Omega Healthcare Investors: https://www.sec.gov/Archives/edgar/data/888491/000088849126000003/ohi-20260204xex99d1.htm
  "888491": {
    "2025-12-31": { perShare: 2.95 },
    "2024-12-31": { perShare: 2.71 },
  },
  // Host Hotels & Resorts: https://www.sec.gov/Archives/edgar/data/1070750/000107075026000054/hst-20251231.htm
  "1070750": {
    "2025-12-31": { commonFfo: 1410, perShare: 2.03 },
    "2024-12-31": { commonFfo: 1387, perShare: 1.97 },
  },
  // National Health Investors: https://www.sec.gov/Archives/edgar/data/877860/000087786026000100/nhiars20254-1x26.htm
  "877860": {
    "2025-12-31": { commonFfo: 218.663, perShare: 4.65 },
    "2024-12-31": { commonFfo: 200.645, perShare: 4.55 },
  },
};

export function getReportedFfo(cik: string | undefined, periodEndDate: string | null | undefined) {
  if (!cik || !periodEndDate) return undefined;
  return REPORTED_FFO[cik.replace(/^0+/, "")]?.[periodEndDate];
}
