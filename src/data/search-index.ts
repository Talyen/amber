import { computeCompanyValuation, type CompanySnapshot } from "../lib/finance.ts";

export interface SearchIndexEntry {
  ticker: string;
  name: string;
  exchange: CompanySnapshot["exchange"];
  sector: string;
  marketCap: number;
  revenue: number;
  reportedFcf: number;
  sbc: number;
  trueFcf: number;
  trueFcfMargin: number;
  sbcPctRevenue: number;
  sbcPctReportedFcf: number;
  netDilutionCagr: number;
  impliedCagr: number;
  lastFilingDate: string;
}

type SearchIndexCompany = Pick<
  CompanySnapshot,
  | "ticker"
  | "name"
  | "exchange"
  | "sector"
  | "marketCap"
  | "cashAndEquiv"
  | "totalDebt"
  | "annuals"
  | "defaultDcf"
> & { lastFiling: Pick<CompanySnapshot["lastFiling"], "date"> };

export function buildSearchIndexEntry(company: SearchIndexCompany): SearchIndexEntry {
  const { latest, netDilutionCagr, reverseDcf } = computeCompanyValuation(company);

  return {
    ticker: company.ticker,
    name: company.name,
    exchange: company.exchange,
    sector: company.sector,
    marketCap: company.marketCap,
    revenue: latest.revenue,
    reportedFcf: latest.reportedFcf,
    sbc: latest.sbc,
    trueFcf: latest.trueFcf,
    trueFcfMargin: Number(latest.trueFcfMargin.toFixed(1)),
    sbcPctRevenue: Number(latest.sbcPctRevenue.toFixed(1)),
    sbcPctReportedFcf: Number(latest.sbcPctReportedFcf.toFixed(1)),
    netDilutionCagr: Number(netDilutionCagr.toFixed(2)),
    impliedCagr: Number(reverseDcf.impliedRevenueCagrPct.toFixed(1)),
    lastFilingDate: company.lastFiling.date,
  };
}
