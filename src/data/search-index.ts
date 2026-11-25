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
  netCash?: number;
  revenue: number;
  revenueCagr?: number;
  reportedFcf: number;
  sbc: number;
  trueFcf: number;
  trueFcfMargin: number;
  operatingMargin?: number | null;
  netMargin?: number | null;
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
  const fyOnly = company.annuals.filter((a) => a.fiscalYear !== "TTM");
  const latestFy = fyOnly[fyOnly.length - 1] ?? latest;
  const operatingMargin =
    typeof latestFy.operatingIncome === "number" && latestFy.revenue > 0
      ? Number(((latestFy.operatingIncome / latestFy.revenue) * 100).toFixed(1))
      : null;
  const netMargin =
    typeof latestFy.netIncome === "number" && latestFy.revenue > 0
      ? Number(((latestFy.netIncome / latestFy.revenue) * 100).toFixed(1))
      : null;

  return {
    ticker: company.ticker,
    name: normalizeCompanyName(company.name),
    exchange: company.exchange,
    sector: company.sector,
    price: Number(company.price.toFixed(2)),
    marketCap: company.marketCap,
    netCash: Math.round(company.cashAndEquiv - company.totalDebt),
    revenue: latest.revenue,
    revenueCagr: Number(revenueCagr.toFixed(1)),
    reportedFcf: latest.reportedFcf,
    sbc: latest.sbc,
    trueFcf: latest.trueFcf,
    trueFcfMargin: Number(latest.trueFcfMargin.toFixed(1)),
    operatingMargin,
    netMargin,
    sbcPctRevenue: Number(latest.sbcPctRevenue.toFixed(1)),
    sbcPctReportedFcf: latest.sbcPctReportedFcf === null ? null : Number(latest.sbcPctReportedFcf.toFixed(1)),
    netDilutionCagr: Number(netDilutionCagr.toFixed(2)),
    impliedCagr: Number(reverseDcf.impliedRevenueCagrPct.toFixed(1)),
    fairValue: baseCase.fairValue,
    fairValueUpsidePct: baseCase.upsidePct,
    lastFilingDate: company.lastFiling.date,
  };
}
