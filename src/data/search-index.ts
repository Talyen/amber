import {
  buildScenarioBasis,
  computeBaseCaseValuation,
  computeCompanyValuation,
  computeFinancialSectorMetrics,
  computeRevenueCagr,
  computeShareholderYieldMetrics,
  type CompanySnapshot,
  type ScenarioAssumptions,
  type ScenarioBasis,
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
  impliedCagr: number | null;
  scenarioBasis: ScenarioBasis;
  fairValue?: number;
  fairValueUpsidePct?: number;
  dividendYieldPct?: number;
  shareholderYieldPct?: number;
  priceToTbv?: number | null;
  rotcePct?: number | null;
  priceToFfo?: number | null;
  ffoFiscalYear?: string | null;
  priceAsOf?: string | null;
  lastFilingDate: string;
}

export interface SearchIndexEntryWithBaseScenario extends SearchIndexEntry {
  baseScenario?: ScenarioAssumptions;
}

export function toSearchIndexEntry({ baseScenario: _baseScenario, ...entry }: SearchIndexEntryWithBaseScenario): SearchIndexEntry {
  return entry;
}

export function toCommandSearchEntry({
  ticker, name, sector, marketCap, trueFcf, sbcPctRevenue,
}: SearchIndexEntry) {
  return { ticker, name, sector, marketCap, trueFcf, sbcPctRevenue };
}

export type CommandSearchEntry = ReturnType<typeof toCommandSearchEntry>;

export function toExploreEntry({
  ticker, name, sector, price, marketCap, revenue, revenueCagr, trueFcf, trueFcfMargin,
  sbcPctRevenue, netDilutionCagr, impliedCagr, scenarioBasis, fairValue, fairValueUpsidePct,
  shareholderYieldPct, priceToTbv, rotcePct, priceToFfo,
}: SearchIndexEntry) {
  return {
    ticker, name, sector, price, marketCap, revenue, revenueCagr, trueFcf, trueFcfMargin,
    sbcPctRevenue, netDilutionCagr, impliedCagr, scenarioBasis, fairValue, fairValueUpsidePct,
    shareholderYieldPct, priceToTbv, rotcePct, priceToFfo,
  };
}

export type ExploreEntry = ReturnType<typeof toExploreEntry>;

export function toPortfolioEntry({
  ticker, name, sector, priceAsOf, impliedCagr, trueFcfMargin, sbcPctRevenue,
  netDilutionCagr, revenueCagr, scenarioBasis, baseScenario,
}: SearchIndexEntryWithBaseScenario) {
  return {
    ticker, name, sector, priceAsOf, impliedCagr, trueFcfMargin, sbcPctRevenue,
    netDilutionCagr, revenueCagr, scenarioBasis, baseScenario,
  };
}

export type PortfolioEntry = ReturnType<typeof toPortfolioEntry>;

type SearchIndexCompany = Pick<
  CompanySnapshot,
  | "ticker"
  | "cik"
  | "name"
  | "exchange"
  | "sector"
  | "price"
  | "priceAsOf"
  | "marketCap"
  | "cashAndEquiv"
  | "totalDebt"
  | "annuals"
  | "defaultDcf"
> & { lastFiling: Pick<CompanySnapshot["lastFiling"], "date"> };

export function buildSearchIndexEntry(company: SearchIndexCompany): SearchIndexEntryWithBaseScenario {
  const { latest, netDilutionCagr, reverseDcf } = computeCompanyValuation(company);
  const scenarioBasis = buildScenarioBasis(company);
  const baseCase = computeBaseCaseValuation(company, scenarioBasis);
  const revenueCagr = computeRevenueCagr(company.annuals);
  const shareholderYield = computeShareholderYieldMetrics(company);
  const sectorMetrics = computeFinancialSectorMetrics(company);

  return {
    ticker: company.ticker,
    name: normalizeCompanyName(company.name),
    exchange: company.exchange,
    sector: company.sector,
    price: company.price,
    priceAsOf: company.priceAsOf ?? null,
    scenarioBasis,
    baseScenario: baseCase ? {
      lens: baseCase.lens,
      revGrowth: baseCase.revGrowthPct,
      targetMargin: baseCase.targetMarginPct,
      exitMultiple: baseCase.exitMultiple,
    } : undefined,
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
    impliedCagr: reverseDcf ? Number(reverseDcf.impliedRevenueCagrPct.toFixed(1)) : null,
    fairValue: baseCase?.fairValue,
    fairValueUpsidePct: baseCase?.upsidePct,
    dividendYieldPct: Number(shareholderYield.dividendYieldPct.toFixed(2)),
    shareholderYieldPct: Number(shareholderYield.totalShareholderYieldPct.toFixed(2)),
    priceToTbv:
      sectorMetrics.priceToTbv !== null ? Number(sectorMetrics.priceToTbv.toFixed(2)) : null,
    rotcePct:
      sectorMetrics.rotcePct !== null ? Number(sectorMetrics.rotcePct.toFixed(1)) : null,
    priceToFfo: sectorMetrics.priceToFfo,
    ffoFiscalYear: sectorMetrics.ffoFiscalYear,
    lastFilingDate: company.lastFiling.date,
  };
}
