import {
  computeBaseCaseValuation,
  computeCompanyValuation,
  computeRevenueCagr,
  type CompanySnapshot,
} from "../lib/finance.ts";
import { normalizeCompanyName } from "../lib/company-name.ts";

export interface SearchIndexEntry {
  ticker: string;
  name: string;
  exchange: CompanySnapshot["exchange"];
  sector: string;
  price?: number;
  marketCap: number;
  revenue: number;
  revenueCagr?: number;
  reportedFcf: number;
  sbc: number;
  trueFcf: number;
  trueFcfMargin: number;
  sbcPctRevenue: number;
  sbcPctReportedFcf: number | null;
  netDilutionCagr: number;
  impliedCagr: number;
  fairValue?: number;
  fairValueUpsidePct?: number;
  lastFilingDate: string;
}

type SearchIndexCompany = Pick<
  CompanySnapshot,
  | "ticker"
  | "name"
  | "exchange"
  | "sector"
  | "price"
  | "marketCap"
  | "cashAndEquiv"
  | "totalDebt"
  | "annuals"
  | "defaultDcf"
> & { lastFiling: Pick<CompanySnapshot["lastFiling"], "date"> };

export function buildSearchIndexEntry(company: SearchIndexCompany): SearchIndexEntry {
  const { latest, netDilutionCagr, reverseDcf } = computeCompanyValuation(company);
  const baseCase = computeBaseCaseValuation(company);
  const revenueCagr = computeRevenueCagr(company.annuals);

  return {
    ticker: company.ticker,
    name: normalizeCompanyName(company.name),
    exchange: company.exchange,
    sector: company.sector,
    price: Number(company.price.toFixed(2)),
    marketCap: company.marketCap,
    revenue: latest.revenue,
    revenueCagr: Number(revenueCagr.toFixed(1)),
    reportedFcf: latest.reportedFcf,
    sbc: latest.sbc,
    trueFcf: latest.trueFcf,
    trueFcfMargin: Number(latest.trueFcfMargin.toFixed(1)),
    sbcPctRevenue: Number(latest.sbcPctRevenue.toFixed(1)),
    sbcPctReportedFcf: latest.sbcPctReportedFcf === null ? null : Number(latest.sbcPctReportedFcf.toFixed(1)),
    netDilutionCagr: Number(netDilutionCagr.toFixed(2)),
    impliedCagr: Number(reverseDcf.impliedRevenueCagrPct.toFixed(1)),
    fairValue: baseCase.fairValue,
    fairValueUpsidePct: baseCase.upsidePct,
    lastFilingDate: company.lastFiling.date,
  };
}
