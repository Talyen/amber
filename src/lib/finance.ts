import { getReportedFfo } from "../data/reit-ffo.ts";
import { getFilingEarningsShares, getFilingValuationShares, reconcileFilingInputs } from "../data/filing-supplements.ts";
import { isFreshPriceDate } from "./market-price.ts";
import {
  classifyValuationBusiness,
  type ValuationBusiness,
  type ValuationBusinessFacts,
  type ValuationBusinessInput,
} from "./valuation-business.ts";

export interface AnnualFinancials {
  fiscalYear: string; // e.g. "FY2021"
  revenue: number; // $M
  operatingCashFlow: number; // $M
  capex: number; // $M (positive number representing cash outflow)
  sbc: number; // $M (Stock-Based Compensation)
  buybacks: number; // $M (Share repurchases)
  dilutedShares: number; // Millions
  // Optional Income Statement & Balance Sheet fields for Sankey & ROIC ($M)
  grossProfit?: number | null;
  rdExpense?: number | null;
  sgaExpense?: number | null;
  operatingIncome?: number | null;
  netIncome?: number | null;
  stockholdersEquity?: number | null;
  depreciationAmortization?: number | null; // $M (optional, for EBITDA)
  goodwillIntangibles?: number | null; // $M (optional, for Bank TBV / ROTCE)
  dividendsPaid?: number | null; // $M (optional, cash dividends paid)
  periodEndDate?: string | null; // e.g. "2025-09-27"
  cashAndEquiv?: number | null; // $M historical cash
  totalDebt?: number | null; // $M historical debt
}

export interface AnnualPricePoint {
  fiscalYear: string; // e.g. "FY22"
  price: number; // $
}

export type PeriodicFilingType = "10-K" | "10-Q" | "20-F" | "40-F";

export function periodicFilingType(form: string): PeriodicFilingType {
  const type = form.replace(/\/A$/, "");
  return type === "10-Q" || type === "20-F" || type === "40-F" ? type : "10-K";
}

export interface FilingDiffItem {
  id: string;
  filingType: PeriodicFilingType | "8-K" | "DEF 14A" | "Form 4";
  filingDate: string;
  accessionNumber: string;
  section: string;
  category:
    | "Risk Factors"
    | "Customer Concentration"
    | "Executive Comp"
    | "Capital Allocation";
  materiality: "High" | "Medium" | "Watch";
  headline: string;
  summary: string;
  priorExcerpt: string;
  currentExcerpt: string;
  signalNote: string;
}

export interface CompanySnapshot {
  ticker: string;
  cik: string;
  name: string;
  exchange: "NASDAQ" | "NYSE";
  sector: string;
  sic?: number;
  businessFacts?: ValuationBusinessFacts | null;
  tagline: string;
  priceAsOf?: string | null;
  price: number; // $
  marketCap: number; // $M
  cashAndEquiv: number; // $M
  totalDebt: number; // $M
  lastFiling: {
    type: PeriodicFilingType;
    date: string;
    periodEnd: string;
    accessionNumber: string;
  };
  annuals: AnnualFinancials[];
  quarterlyFinancials?: AnnualFinancials[];
  priceHistory?: AnnualPricePoint[];
  defaultDcf: {
    wacc: number; // % e.g. 10.0
    terminalMultiple: number; // x True FCF e.g. 22
    targetFcfMargin: number; // % e.g. 32
    sbcDragPct: number; // % of revenue e.g. 8
  };
  filingDiffs: FilingDiffItem[];
}

export interface ComputedAnnual extends AnnualFinancials {
  reportedFcf: number;
  trueFcf: number; // Reported FCF - SBC
  reportedFcfMargin: number; // %
  trueFcfMargin: number; // %
  sbcPctRevenue: number; // %
  sbcPctReportedFcf: number | null; // % when reported FCF is positive
  yoyShareChangePct: number | null; // %
}

export function computeAnnualMetrics(
  annuals: AnnualFinancials[]
): ComputedAnnual[] {
  return annuals.map((row, idx) => {
    const reportedFcf = row.operatingCashFlow - row.capex;
    const trueFcf = reportedFcf - row.sbc;
    const safeRev = row.revenue > 0 ? row.revenue : 0;
    const reportedFcfMargin = safeRev > 0 ? (reportedFcf / safeRev) * 100 : 0;
    const trueFcfMargin = safeRev > 0 ? (trueFcf / safeRev) * 100 : 0;
    const sbcPctRevenue = safeRev > 0 ? (row.sbc / safeRev) * 100 : 0;
    const sbcPctReportedFcf = reportedFcf > 0 ? (row.sbc / reportedFcf) * 100 : null;
    const prev = idx > 0 ? annuals[idx - 1] : null;
    const yoyShareChangePct =
      prev && prev.dilutedShares > 0 && row.dilutedShares > 0 && fiscalYearsBetween(prev, row) === 1
        ? ((row.dilutedShares - prev.dilutedShares) / prev.dilutedShares) * 100
        : null;

    return {
      ...row,
      reportedFcf,
      trueFcf,
      reportedFcfMargin,
      trueFcfMargin,
      sbcPctRevenue,
      sbcPctReportedFcf,
      yoyShareChangePct,
    };
  });
}

type EnterpriseValueInputs = Pick<CompanySnapshot, "marketCap" | "totalDebt" | "cashAndEquiv">;

export function computeEnterpriseValue(company: EnterpriseValueInputs): number {
  return company.marketCap + company.totalDebt - company.cashAndEquiv;
}

function fiscalYearNumber(label: string) {
  const year = /^FY(\d{2}|\d{4})$/i.exec(label)?.[1];
  if (!year) return undefined;
  return Number(year) + (year.length === 2 ? 2000 : 0);
}

function fiscalYearsBetween(first: AnnualFinancials, last: AnnualFinancials) {
  const start = fiscalYearNumber(first.fiscalYear);
  const end = fiscalYearNumber(last.fiscalYear);
  return start !== undefined && end !== undefined && end > start ? end - start : undefined;
}

function computeFiscalCagr(
  annuals: AnnualFinancials[],
  metric: "revenue" | "dilutedShares"
) {
  const fiscal = annuals.filter((row) => row.fiscalYear !== "TTM");
  if (fiscal.length < 2) return undefined;
  const first = fiscal[0];
  const last = fiscal[fiscal.length - 1];
  if (
    first[metric] <= 0 || last[metric] < 0 ||
    (metric === "dilutedShares" && last.dilutedShares === 0)
  ) return undefined;
  const years = fiscalYearsBetween(first, last) ?? fiscal.length - 1;
  return (Math.pow(last[metric] / first[metric], 1 / years) - 1) * 100;
}

export function computeNetDilutionCagr(annuals: AnnualFinancials[]): number {
  return computeFiscalCagr(annuals, "dilutedShares") ?? 0;
}

export function computeRevenueCagr(annuals: AnnualFinancials[]): number {
  return computeFiscalCagr(annuals, "revenue") ?? 0;
}

export function computeLatestRevenueGrowth(annuals: AnnualFinancials[]): number | null {
  const fiscal = annuals.filter((row) => row.fiscalYear !== "TTM");
  if (fiscal.length < 2) return null;
  const previous = fiscal[fiscal.length - 2];
  const current = fiscal[fiscal.length - 1];
  const years = fiscalYearsBetween(previous, current);
  if (previous.revenue <= 0 || (years !== undefined && years !== 1)) return null;
  return ((current.revenue - previous.revenue) / previous.revenue) * 100;
}

/**
 * Computes realistic, business-model-grounded default DCF assumptions anchored
 * to the company's own historical FCF margin (so a 2% margin retailer like WMT
 * never gets a 18% software margin assumption).
 */
export function computeGroundedDefaultDcf(
  annuals: AnnualFinancials[]
): CompanySnapshot["defaultDcf"] {
  const computed = computeAnnualMetrics(annuals);
  const latest = computed[computed.length - 1];

  const revCagr = computeFiscalCagr(annuals, "revenue") ?? 6;

  const repMargins = computed
    .map((c) => c.reportedFcfMargin)
    .filter((m) => Number.isFinite(m))
    .sort((a, b) => a - b);
  const mid = Math.floor(repMargins.length / 2);
  const medianRepMargin =
    repMargins.length === 0
      ? 10
      : repMargins.length % 2 === 0
        ? (repMargins[mid - 1] + repMargins[mid]) / 2
        : repMargins[mid];

  const ocfMargin =
    latest.revenue > 0 ? (latest.operatingCashFlow / latest.revenue) * 100 : 10;
  const capexPctRev =
    latest.revenue > 0 ? (latest.capex / latest.revenue) * 100 : 0;
  const latestOpMargin =
    typeof latest.operatingIncome === "number" && latest.revenue > 0
      ? (latest.operatingIncome / latest.revenue) * 100
      : null;

  // For heavy growth-CapEx compounders (e.g. AMZN, ORCL) where temporary CapEx surges
  // depress near-term FCF below operating earnings power, normalize long-term FCF conversion
  const heavyCapexNormalized =
    capexPctRev >= 10 &&
    latestOpMargin !== null &&
    latestOpMargin > 5 &&
    latestOpMargin > medianRepMargin * 1.5
      ? latestOpMargin * 0.72
      : 0;

  // Modest +10% operating-leverage headroom above historical median, never an arbitrary 18% floor
  const rawTarget = Math.max(
    heavyCapexNormalized,
    medianRepMargin > 0.5
      ? medianRepMargin * 1.1
      : Math.max(2, Math.min(18, ocfMargin * 0.55))
  );

  const targetFcfMargin = Number(
    Math.max(1.5, Math.min(55, rawTarget)).toFixed(1)
  );
  const sbcDragPct = Number(
    Math.max(
      0.2,
      Math.min(Math.max(0.5, targetFcfMargin * 0.55), latest.sbcPctRevenue * 0.8)
    ).toFixed(1)
  );

  // Smoothly ground terminal multiple in business quality & growth (13x to 22x, no abrupt cliffs)
  const netTargetMargin = targetFcfMargin - sbcDragPct;
  const growthScore = Math.max(0, Math.min(1, (revCagr - 3) / 14));
  const marginScore = Math.max(0, Math.min(1, (netTargetMargin - 6) / 18));
  const blendedScore = growthScore * 0.55 + marginScore * 0.45;
  const terminalMultiple = Math.round(13 + blendedScore * 9);

  return {
    wacc: 9.5,
    terminalMultiple,
    targetFcfMargin,
    sbcDragPct,
  };
}

export interface FiveYearScenarioInputs {
  currentPrice: number;
  dilutedShares: number; // Millions
  baseRevenue: number; // $M
  currentTrueFcfMarginPct: number;
  netCash: number; // cashAndEquiv - totalDebt ($M)
  revGrowthPct: number; // Annual %
  targetTrueFcfMarginPct: number; // Year-5 %
  exitMultiple: number; // EV / Year-5 True FCF
  hurdleRatePct?: number; // Default 10%
  terminalGrowthPct?: number;
  interimCashFlow?: (metric: number, revenueIncrease: number, yearGrowth: number) => number;
}

export interface FiveYearScenarioResult {
  yr5Rev: number;
  yr5TrueFcf: number;
  yr5RecurringCashFlow: number;
  yr5TargetPrice: number;
  fairValueToday: number;
  upsidePct: number;
  totalMultiple: number;
  irrPct: number | null;
  hurdleRatePct: number;
  terminalValuePv: number;
  terminalGrowthPct: number;
  equityValueBeforeFloor: number;
}

/** Discount interim cash flows and terminal value on the same schedule used for IRR. */
export function computeFiveYearScenario(
  inputs: FiveYearScenarioInputs
): FiveYearScenarioResult {
  const years = 5;
  const r = (inputs.hurdleRatePct ?? 10) / 100;
  const growth = inputs.revGrowthPct / 100;
  const terminalGrowth = (inputs.terminalGrowthPct ?? inputs.revGrowthPct) / 100;
  const startMargin = Math.max(-0.15, Math.min(0.6, inputs.currentTrueFcfMarginPct / 100));
  const endMargin = Math.max(0.01, Math.min(0.65, inputs.targetTrueFcfMarginPct / 100));

  let rev = inputs.baseRevenue;
  let yr5TrueFcf = 0;
  const cashFlows: number[] = [];
  for (let t = 1; t <= years; t++) {
    const yearGrowth = growth + (terminalGrowth - growth) * ((t - 1) / (years - 1));
    const revenueIncrease = rev * yearGrowth;
    rev += revenueIncrease;
    const margin = startMargin + (endMargin - startMargin) * (t / years);
    yr5TrueFcf = rev * margin;
    cashFlows.push(inputs.interimCashFlow?.(yr5TrueFcf, revenueIncrease, yearGrowth) ?? yr5TrueFcf);
  }

  const yr5RecurringCashFlow = cashFlows[years - 1];
  const terminalValue = Math.max(0, yr5TrueFcf * inputs.exitMultiple);
  cashFlows[years - 1] += terminalValue;
  const presentValue = (discountFactor: number) => {
    let value = 0;
    for (let i = years - 1; i >= 0; i--) {
      value = (value + cashFlows[i]) * discountFactor;
    }
    return value;
  };

  const shares = inputs.dilutedShares > 0 ? inputs.dilutedShares : 1;
  const equityValueBeforeFloor = presentValue(1 / (1 + r)) + inputs.netCash;
  const fairValueToday = Math.max(0, equityValueBeforeFloor) / shares;
  const upsidePct = ((fairValueToday - inputs.currentPrice) / Math.max(0.01, inputs.currentPrice)) * 100;
  const yr5TargetPrice = terminalValue / shares;
  const totalMultiple = (presentValue(1) + inputs.netCash) / (shares * Math.max(0.01, inputs.currentPrice));

  // The net cash/debt adjustment is at purchase in both calculations.
  // Require a single cash-flow sign change before solving for one IRR.
  const firstPositiveFlow = cashFlows.findIndex((flow) => flow > 0);
  const uniqueIrr = firstPositiveFlow >= 0 && cashFlows.slice(firstPositiveFlow).every((flow) => flow >= 0);
  const netInvestment = inputs.currentPrice * shares - inputs.netCash;
  let irrPct: number | null = null;
  if (inputs.currentPrice > 0 && netInvestment > 0 && uniqueIrr && cashFlows[years - 1] > 0) {
    let low = 0;
    let high = 1;
    while (presentValue(high) < netInvestment && high < 1e64) high *= 2;
    for (let i = 0; i < 100; i++) {
      const middle = (low + high) / 2;
      if (presentValue(middle) < netInvestment) low = middle;
      else high = middle;
    }
    const result = (1 / ((low + high) / 2) - 1) * 100;
    if (Number.isFinite(result)) irrPct = result;
  }

  return {
    yr5Rev: rev,
    yr5TrueFcf,
    yr5RecurringCashFlow,
    yr5TargetPrice,
    fairValueToday,
    upsidePct,
    totalMultiple,
    irrPct,
    hurdleRatePct: r * 100,
    terminalValuePv: terminalValue / (1 + r) ** years,
    terminalGrowthPct: terminalGrowth * 100,
    equityValueBeforeFloor,
  };
}

function clampReverseDcfTargetMargin(marginPct: number) {
  return Math.max(2, Math.min(65, marginPct));
}

export interface ReverseDcfInputs {
  enterpriseValue: number; // $M
  baseRevenue: number; // $M (latest FY)
  waccPct: number; // e.g. 10.0
  terminalMultiple: number; // e.g. 22x True FCF
  targetTrueFcfMarginPct: number; // e.g. 28%
  currentTrueFcfMarginPct: number; // starting margin for smooth 10Y glidepath
  horizonYears?: number; // default 10
}

export interface ReverseDcfResult {
  impliedRevenueCagrPct: number;
  year10Revenue: number;
  year10TrueFcf: number;
  terminalValuePv: number;
  explicitCashFlowPv: number;
  impliedEvToYear10Fcf: number;
  clamped?: "low" | "high" | "negative-ev" | null;
}

/**
 * Computes Present Value of Enterprise given a candidate 10-year Revenue CAGR.
 * Margin glides linearly from currentTrueFcfMarginPct toward targetTrueFcfMarginPct over horizonYears.
 */
function presentValueForGrowth(
  cagr: number,
  inputs: ReverseDcfInputs
): { pv: number; yrNRev: number; yrNFcf: number; tvPv: number; cfPv: number } {
  const n = inputs.horizonYears ?? 10;
  const r = inputs.waccPct / 100;
  const startMargin = Math.max(-0.35, Math.min(0.6, inputs.currentTrueFcfMarginPct / 100));
  const endMargin = clampReverseDcfTargetMargin(inputs.targetTrueFcfMarginPct) / 100;

  let cfPv = 0;
  let rev = inputs.baseRevenue;
  let lastFcf = 0;

  for (let t = 1; t <= n; t++) {
    rev = rev * (1 + cagr);
    const weight = t / n;
    const margin = startMargin + (endMargin - startMargin) * weight;
    const fcf = rev * margin;
    cfPv += fcf / Math.pow(1 + r, t);
    lastFcf = fcf;
  }

  const terminalValue = Math.max(0, lastFcf * inputs.terminalMultiple);
  const tvPv = terminalValue / Math.pow(1 + r, n);

  return {
    pv: cfPv + tvPv,
    yrNRev: rev,
    yrNFcf: lastFcf,
    tvPv,
    cfPv,
  };
}

/**
 * Deterministic binary search solving for the exact 10Y Revenue CAGR
 * that equates the discounted True FCF stream + Terminal Value to current Enterprise Value.
 */
export function solveReverseDcf(inputs: ReverseDcfInputs): ReverseDcfResult {
  if (inputs.enterpriseValue <= 0 || inputs.baseRevenue <= 0) {
    const baseline = presentValueForGrowth(0, inputs);
    return {
      impliedRevenueCagrPct: 0,
      year10Revenue: baseline.yrNRev,
      year10TrueFcf: baseline.yrNFcf,
      terminalValuePv: baseline.tvPv,
      explicitCashFlowPv: baseline.cfPv,
      impliedEvToYear10Fcf: 0,
      clamped: "negative-ev",
    };
  }

  let lo = -0.25;
  let hi = 0.85;

  for (let iter = 0; iter < 56; iter++) {
    const mid = (lo + hi) / 2;
    const { pv } = presentValueForGrowth(mid, inputs);
    if (pv < inputs.enterpriseValue) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const solvedCagr = (lo + hi) / 2;
  const final = presentValueForGrowth(solvedCagr, inputs);
  const clamped: ReverseDcfResult["clamped"] =
    inputs.enterpriseValue < presentValueForGrowth(-0.25, inputs).pv ? "low"
      : inputs.enterpriseValue > presentValueForGrowth(0.85, inputs).pv ? "high"
      : null;

  return {
    impliedRevenueCagrPct: solvedCagr * 100,
    year10Revenue: final.yrNRev,
    year10TrueFcf: final.yrNFcf,
    terminalValuePv: final.tvPv,
    explicitCashFlowPv: final.cfPv,
    impliedEvToYear10Fcf:
      final.yrNFcf > 0 ? inputs.enterpriseValue / final.yrNFcf : 0,
    clamped,
  };
}

export function reverseDcfTargetMargin(targetFcfMargin: number, sbcDragPct: number): number {
  return clampReverseDcfTargetMargin(targetFcfMargin - sbcDragPct);
}

export type ScenarioLens = "fcf" | "ebit" | "pe" | "ffo";

export function isScenarioLens(lens: unknown): lens is ScenarioLens {
  return lens === "fcf" || lens === "ebit" || lens === "pe" || lens === "ffo";
}

export interface ScenarioAssumptions {
  lens: ScenarioLens;
  revGrowth: number;
  targetMargin: number;
  exitMultiple: number;
}

export interface ScenarioBasis {
  price: number;
  dilutedShares: number;
  earningsShares?: number;
  revenue: number;
  netCash: number;
  trueFcfMargin: number;
  operatingMargin: number | null;
  netMargin: number | null;
  ffoMargin?: number | null;
  equityLensOnly: boolean;
  model?: {
    inputIssue: string | null;
    enterpriseIssue: string | null;
    reit: boolean;
    earningsDefault: boolean;
    earningsFallback: boolean;
    growth: number;
    steadyGrowth: number;
    hurdle: number;
    sustainableFcfMargin: number;
    sustainableOperatingMargin: number;
    sustainableNetMargin: number;
    distributableEarnings: number;
    returnOnEquity: number | null;
    ffoPayout: number;
    salesToCapital: number;
    interestMargin: number;
  };
}

type ScenarioCompany = Pick<CompanySnapshot, "ticker" | "sector" | "price" | "cashAndEquiv" | "totalDebt" | "annuals"> &
  Partial<Pick<CompanySnapshot, "cik" | "marketCap" | "priceAsOf" | "sic" | "businessFacts">> & {
    lastFiling?: Partial<Pick<CompanySnapshot["lastFiling"], "date" | "periodEnd">>;
  };

const DAY_MS = 86_400_000;
const TAX_RATE = 0.25;

function median(values: readonly number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (!sorted.length) return undefined;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function metricMargin(row: AnnualFinancials, metric: "operatingIncome" | "netIncome") {
  return row[metric] != null && row.revenue > 0 ? row[metric] / row.revenue * 100 : null;
}

function operatingCashMargin(row: AnnualFinancials, debt: number) {
  // OCF usually includes cash interest. Estimate the after-tax addback on funded
  // debt to put the cash flow on an enterprise basis. Earnings already expense SBC.
  const interest = Math.max(0, debt) * 0.05 * (1 - TAX_RATE);
  return (row.operatingCashFlow - row.capex - row.sbc + interest) / row.revenue * 100;
}

function annualGrowthRates(fiscal: readonly AnnualFinancials[], value: (row: AnnualFinancials) => number | null) {
  return fiscal.slice(1).flatMap((row, index) => {
    const prior = fiscal[index];
    const periodDays = row.periodEndDate && prior.periodEndDate
      ? (Date.parse(row.periodEndDate) - Date.parse(prior.periodEndDate)) / DAY_MS : null;
    const years = fiscalYearsBetween(prior, row);
    if (periodDays !== null && (periodDays < 330 || periodDays > 400) ||
        periodDays === null && years != null && years !== 1) return [];
    const from = value(prior);
    const to = value(row);
    if (!(from && from > 0 && to && to > 0)) return [];
    const change = (to / from - 1) * 100;
    // Breaks in business scope are unsuitable as a recurring growth assumption.
    return change > 150 || change < -60 ? [] : [change];
  });
}

export function buildScenarioBasis(raw: ScenarioCompany, now = Date.now()): ScenarioBasis {
  const company = reconcileFilingInputs(raw);
  const latest = company.annuals.at(-1);
  const fiscal = company.annuals.filter((row) => row.fiscalYear !== "TTM");
  const latestFy = fiscal.at(-1);
  const recent = fiscal.slice(-3);
  const business = getValuationBusiness(company);
  const reit = business === "reit";
  const financial = business === "financial";
  const utility = business === "regulated-utility";
  const financingExposed = business === "financing-exposed";
  const earningsDefault = financial || utility || financingExposed;
  const commodity = business === "commodity";
  const cyclical = commodity || company.sector === "Semiconductors";
  const steadyGrowth = commodity ? 1.5 : reit || financial || utility ? 2.5 : 3;

  const revenue = latest?.revenue ?? 0;
  const cash = company.cashAndEquiv;
  const debt = company.totalDebt;
  const shares = latest ? getFilingValuationShares(company, latest) : 0;
  const marketShares = (company.marketCap ?? 0) / company.price;
  const shareRatio = marketShares / shares;
  const financialPeriod = latest?.periodEndDate ? Date.parse(latest.periodEndDate) : NaN;
  const filingPeriod = company.lastFiling?.periodEnd ? Date.parse(company.lastFiling.periodEnd) : NaN;
  const quoteDate = company.priceAsOf ? Date.parse(company.priceAsOf) : NaN;

  let inputIssue: string | null = null;
  if (![company.price, shares, revenue].every((number) => Number.isFinite(number) && number > 0)) {
    inputIssue = "The quote, share count or revenue is unavailable.";
  } else if (company.priceAsOf !== undefined && !isFreshPriceDate(company.priceAsOf, now)) {
    inputIssue = "A recent dated closing price is unavailable.";
  } else if (marketShares > 0 && (shareRatio > 1.5 || shareRatio < 2 / 3)) {
    inputIssue = "The valuation share count does not reconcile to the listed security.";
  } else if (Number.isFinite(quoteDate) && (!Number.isFinite(financialPeriod) ||
    quoteDate - financialPeriod > 550 * DAY_MS || financialPeriod > quoteDate ||
    (filingPeriod - financialPeriod > 125 * DAY_MS && !reit))) {
    inputIssue = "The financial statements are too old or their reporting dates do not reconcile.";
  }

  const missingBalance = (cash === 0 && latest?.cashAndEquiv === null) || (debt === 0 && latest?.totalDebt === null);
  let enterpriseIssue: string | null = null;
  if (financingExposed) {
    enterpriseIssue = "Consolidated cash flow includes lending or customer funds. The earnings model is available.";
  } else if (!Number.isFinite(cash) || !Number.isFinite(debt) || cash < 0 || debt < 0 || missingBalance) {
    enterpriseIssue = "Cash or debt could not be verified for the valuation.";
  } else if (latest && (!Number.isFinite(latest.capex) || latest.capex <= 0)) {
    enterpriseIssue = "Capital spending could not be verified for the valuation.";
  } else if (latest && latest.totalDebt != null && latest.cashAndEquiv != null && (
    Math.abs(debt - latest.totalDebt) > Math.max(0.12 * revenue, 0.5 * latest.totalDebt) ||
    Math.abs(cash - latest.cashAndEquiv) > Math.max(0.12 * revenue, 0.5 * latest.cashAndEquiv)
  )) {
    enterpriseIssue = "Cash or debt does not reconcile to the latest financial period.";
  } else if (recent.some((row) => row.revenue > 0 && (row.operatingIncome ?? 0) > row.revenue)) {
    enterpriseIssue = "Historical revenue does not reconcile to operating earnings.";
  }

  const operatingMargin = (latest && metricMargin(latest, "operatingIncome")) ??
    (latestFy ? metricMargin(latestFy, "operatingIncome") : null);
  const netMargin = (latest && metricMargin(latest, "netIncome")) ??
    (latestFy ? metricMargin(latestFy, "netIncome") : null);
  const ffo = reit && latestFy ? getReportedFfo(company.cik, latestFy.periodEndDate) : undefined;
  const ffoPerShare = ffo?.perShare ?? (ffo?.commonFfo && latestFy ? ffo.commonFfo / latestFy.dilutedShares : null);
  const ffoMargin = ffoPerShare && revenue > 0 ? ffoPerShare * shares / revenue * 100 : null;
  const interestMargin = revenue > 0 ? Math.max(0, debt) * 0.05 * (1 - TAX_RATE) / revenue * 100 : 0;
  const trueFcfMargin = latest && revenue > 0
    ? (latest.operatingCashFlow - latest.capex - latest.sbc) / revenue * 100 : 0;

  const rates = annualGrowthRates(fiscal.slice(-4), (row) => {
    if (reit && row.dilutedShares > 10) {
      const reported = getReportedFfo(company.cik, row.periodEndDate);
      return reported?.perShare ?? (reported?.commonFfo ? reported.commonFfo / row.dilutedShares : null);
    }
    if (earningsDefault) return row.netIncome ?? null;
    return row.revenue;
  });
  // Blend the latest comparable year with a three-year median and a mature
  // baseline. Cyclical industries put more weight on mid-cycle growth.
  const typicalGrowth = median(rates) ?? steadyGrowth;
  const recentGrowth = rates.at(-1) ?? typicalGrowth;
  const growthEstimate = Math.max(-10, Math.min(45, cyclical || earningsDefault || reit
    ? recentGrowth * 0.25 + typicalGrowth * 0.25 + steadyGrowth * 0.5
    : recentGrowth * 0.55 + typicalGrowth * 0.35 + steadyGrowth * 0.1));

  const observedCashMargins = recent.filter((row) => row.revenue > 0 && row.capex > 0)
    .map((row) => operatingCashMargin(row, row.totalDebt ?? debt));
  const currentCashMargin = trueFcfMargin + interestMargin;
  const historicalCashMargin = median(observedCashMargins) ?? currentCashMargin;
  const sustainableFcfMargin = historicalCashMargin * (cyclical ? 0.8 : 0.6) +
    currentCashMargin * (cyclical ? 0.2 : 0.4);
  const sustainableOperatingMargin = median(recent.flatMap((row) => metricMargin(row, "operatingIncome") ?? [])) ??
    operatingMargin ?? 0;
  const medianEarnings = median(recent.flatMap((row) => row.netIncome ?? []));
  const currentEarnings = netMargin !== null ? netMargin * revenue / 100 : medianEarnings ?? 0;
  const blendedNetMargin = revenue > 0
    ? (currentEarnings * 0.6 + (medianEarnings ?? currentEarnings) * 0.4) / revenue * 100 : 0;
  const fiscalNetMargins = recent.flatMap((row) => metricMargin(row, "netIncome") ?? []);
  const normalizedNetMargin = median(fiscalNetMargins) ?? 0;
  const sustainableNetMargin = fiscalNetMargins.length >= 2 && (netMargin ?? 0) > 0 && normalizedNetMargin > 0
    ? normalizedNetMargin : blendedNetMargin;
  const returnOnEquity = median(recent.flatMap((row) => row.stockholdersEquity && row.stockholdersEquity > 0 &&
    row.netIncome != null ? [row.netIncome / row.stockholdersEquity] : [])) ?? null;
  const earningsFallback = missingBalance && !commodity && (netMargin ?? 0) > 0 &&
    (latest?.operatingCashFlow ?? 0) > 0 &&
    recent.length >= 3 && recent.every((row) => (row.netIncome ?? 0) > 0) &&
    returnOnEquity !== null && returnOnEquity > 0;
  const growth = Math.round(financial && returnOnEquity !== null && returnOnEquity > 0
    ? Math.min(growthEstimate, returnOnEquity * 100) : growthEstimate);
  // Common equity receives cash through repurchases as well as dividends.
  // The projection separately limits payouts to earnings left after reinvestment.
  const reportedPayout = median(recent.flatMap((row) => row.netIncome && row.netIncome > 0 &&
    row.dividendsPaid != null
    ? [(row.dividendsPaid + (Number.isFinite(row.buybacks) ? Math.max(0, row.buybacks) : 0)) / row.netIncome]
    : []));
  const distributableEarnings = reportedPayout ?? (financial ? 0.45 : utility ? 0.55 : 0.4);
  const ffoPayout = ffoPerShare && latestFy?.dividendsPaid != null && shares > 0
    ? latestFy.dividendsPaid / (ffoPerShare * shares) : 0.65;

  return {
    price: company.price, dilutedShares: shares, revenue, netCash: cash - debt,
    earningsShares: latest ? getFilingEarningsShares(company, latest) : undefined,
    trueFcfMargin, operatingMargin, netMargin, ffoMargin, equityLensOnly: financial || reit,
    model: {
      inputIssue, enterpriseIssue, reit, earningsDefault, earningsFallback, growth, steadyGrowth,
      hurdle: utility ? 8.5 : reit ? 9 : commodity ? 11.5 : financial ? 10.5 : 10,
      sustainableFcfMargin, sustainableOperatingMargin, sustainableNetMargin,
      distributableEarnings, returnOnEquity, ffoPayout, salesToCapital: cyclical ? 1 : 2, interestMargin,
    },
  };
}

export function scenarioStartingMargin(basis: ScenarioBasis, lens: ScenarioLens): number | null {
  switch (lens) {
    case "pe": return basis.netMargin;
    case "ebit": return basis.operatingMargin;
    case "ffo": return basis.ffoMargin ?? null;
    case "fcf": return basis.trueFcfMargin + (basis.model?.interestMargin ?? 0);
  }
}

export function scenarioLensAvailable(basis: ScenarioBasis, lens: ScenarioLens): boolean {
  const margin = scenarioStartingMargin(basis, lens);
  if (margin === null || !Number.isFinite(margin)) return false;
  if (lens === "ffo") return margin > 0;
  if (lens === "pe") return margin > 0 || (basis.model?.sustainableNetMargin ?? 0) > 0;
  return !basis.equityLensOnly && (lens === "fcf" || margin > 0);
}

export function scenarioInputIssue(basis: ScenarioBasis, lens: ScenarioLens): string | null {
  const model = basis.model;
  return model?.inputIssue ?? (lens === "fcf" || lens === "ebit" ? model?.enterpriseIssue : null) ?? null;
}

export function computeScenarioProjection(
  basis: ScenarioBasis,
  { lens, revGrowth, targetMargin, exitMultiple }: ScenarioAssumptions,
): FiveYearScenarioResult | null {
  const currentMargin = scenarioStartingMargin(basis, lens);
  const model = basis.model;
  if (scenarioInputIssue(basis, lens) || !scenarioLensAvailable(basis, lens) || currentMargin === null ||
    ![basis.price, basis.dilutedShares, basis.revenue, targetMargin, exitMultiple].every((n) => Number.isFinite(n) && n > 0) ||
    !Number.isFinite(revGrowth) || revGrowth <= -100) return null;
  const isEquity = lens === "pe" || lens === "ffo";
  const interimCashFlow = model && ((metric: number, revenueIncrease: number, yearGrowth: number) => {
    if (lens === "ebit") {
      return metric - Math.max(0, metric) * TAX_RATE - Math.max(0, revenueIncrease) / model.salesToCapital;
    }
    if (lens === "ffo") return Math.max(0, metric) * Math.max(0, Math.min(1, model.ffoPayout));
    if (lens === "pe") {
      const retention = model.returnOnEquity && model.returnOnEquity > 0
        ? Math.max(0, yearGrowth / model.returnOnEquity) : 0;
      const payout = Math.max(0, Math.min(1 - retention, model.distributableEarnings));
      return Math.max(0, metric) * payout;
    }
    return metric;
  });

  return computeFiveYearScenario({
    currentPrice: basis.price,
    dilutedShares: lens === "pe" ? basis.earningsShares ?? basis.dilutedShares : basis.dilutedShares,
    baseRevenue: basis.revenue,
    currentTrueFcfMarginPct: currentMargin,
    netCash: isEquity ? 0 : basis.netCash,
    revGrowthPct: revGrowth,
    targetTrueFcfMarginPct: targetMargin,
    exitMultiple,
    hurdleRatePct: model?.hurdle,
    terminalGrowthPct: model ? Math.min(revGrowth, 0) * 0.25 + model.steadyGrowth : undefined,
    interimCashFlow,
  });
}

export function getScenarioDefaults(
  company: Pick<CompanySnapshot, "annuals" | "defaultDcf">,
  basis: ScenarioBasis,
) {
  const model = basis.model;
  const revGrowth = model?.growth ?? Math.max(1, Math.min(24, Math.round(computeRevenueCagr(company.annuals))));
  const hasEbit = scenarioLensAvailable(basis, "ebit") && !scenarioInputIssue(basis, "ebit");
  const hasPe = scenarioLensAvailable(basis, "pe");
  const hasFfo = scenarioLensAvailable(basis, "ffo");
  const defaultLens: ScenarioLens = model?.reit ? "ffo" : model?.earningsDefault || model?.earningsFallback || basis.equityLensOnly
    ? "pe" : "fcf";
  const steadyGrowth = (model?.steadyGrowth ?? 3) / 100;
  const hurdle = (model?.hurdle ?? 10) / 100;
  const steadyValueMultiple = (1 + steadyGrowth) / (hurdle - steadyGrowth);
  const sustainablePayout = model?.returnOnEquity && model.returnOnEquity > steadyGrowth
    ? 1 - steadyGrowth / model.returnOnEquity : 0.65;
  const roundMargin = (margin: number) => Math.max(1, Math.min(55, Math.round(margin * 2) / 2));
  const roundMultiple = (multiple: number) => Math.max(5, Math.round(multiple * 10) / 10);
  const normalizedFcf = model?.sustainableFcfMargin ?? company.defaultDcf.targetFcfMargin - company.defaultDcf.sbcDragPct;
  const normalizedEbit = model?.sustainableOperatingMargin ?? basis.operatingMargin ?? 0;
  const normalizedEarnings = model?.sustainableNetMargin ?? basis.netMargin ?? 0;

  return {
    revGrowth, defaultLens, hasEbit, hasPe, hasFfo,
    byLens: {
      fcf: { margin: roundMargin(normalizedFcf), multiple: roundMultiple(steadyValueMultiple) },
      ebit: {
        margin: roundMargin(normalizedEbit),
        multiple: roundMultiple(steadyValueMultiple * Math.max(0,
          1 - TAX_RATE - steadyGrowth / ((model?.salesToCapital ?? 2) * Math.max(0.02, normalizedEbit / 100)))),
      },
      pe: { margin: roundMargin(normalizedEarnings), multiple: roundMultiple(steadyValueMultiple * sustainablePayout) },
      ffo: { margin: roundMargin(basis.ffoMargin ?? 0), multiple: roundMultiple(steadyValueMultiple * 0.85) },
    },
  };
}

export function scenarioPresetAssumptions(
  lens: ScenarioLens,
  defaults: Pick<ReturnType<typeof getScenarioDefaults>, "byLens" | "revGrowth">,
  kind: "bear" | "base" | "bull",
): ScenarioAssumptions {
  const { margin, multiple } = defaults.byLens[lens];
  const revGrowth = defaults.revGrowth;
  if (kind === "base") return { lens, revGrowth, targetMargin: margin, exitMultiple: multiple };
  const change = kind === "bull" ? 1 : -1;
  return {
    lens,
    revGrowth: Math.min(45, Math.max(-10, Math.round(revGrowth + change * Math.max(3, Math.abs(revGrowth) * 0.25)))),
    targetMargin: Math.min(55, Math.max(1, Math.round(margin * (1 + change * 0.2) * 2) / 2)),
    exitMultiple: Math.min(45, Math.max(5, Math.round(multiple * (1 + change * 0.2) * 10) / 10)),
  };
}

export function evaluateBaseCaseValuation(
  company: Pick<CompanySnapshot, "annuals" | "defaultDcf">,
  basis: ScenarioBasis,
) {
  const defaults = getScenarioDefaults(company, basis);
  const assumptions = scenarioPresetAssumptions(defaults.defaultLens, defaults, "base");
  const { lens, revGrowth, targetMargin, exitMultiple } = assumptions;
  const model = basis.model;
  const issue = scenarioInputIssue(basis, lens) ??
    (lens === "ffo" && !defaults.hasFfo ? "Issuer-reported funds from operations are unavailable." : null) ??
    (lens === "fcf" && model && model.sustainableFcfMargin <= 0 ? "Reported cash flows do not establish a profitable base case." : null) ??
    (lens === "pe" && model && model.sustainableNetMargin <= 0 ? "Reported earnings do not establish a profitable base case." : null);
  if (issue) return { valuation: null, issue };

  const projection = computeScenarioProjection(basis, assumptions);
  if (!projection || !Number.isFinite(projection.fairValueToday)) {
    return { valuation: null, issue: "The available fundamentals do not support a base-case valuation." };
  }
  if (projection.equityValueBeforeFloor <= 0) {
    return { valuation: null, issue: "The base-case cash flows do not cover the claims ahead of common equity." };
  }
  const sensitivities = (["bear", "bull"] as const).map((kind) =>
    computeScenarioProjection(basis, scenarioPresetAssumptions(lens, defaults, kind))?.fairValueToday ?? projection.fairValueToday);
  return {
    issue: null,
    valuation: {
      lens,
      fairValue: Number(projection.fairValueToday.toFixed(2)),
      upsidePct: Number(projection.upsidePct.toFixed(1)),
      fairValueLow: Number(Math.min(projection.fairValueToday, ...sensitivities).toFixed(2)),
      fairValueHigh: Number(Math.max(projection.fairValueToday, ...sensitivities).toFixed(2)),
      revGrowthPct: revGrowth,
      targetMarginPct: targetMargin,
      exitMultiple,
    },
  };
}

export function computeBaseCaseValuation(
  company: ScenarioCompany & Pick<CompanySnapshot, "defaultDcf">,
  basis = buildScenarioBasis(company),
) {
  return evaluateBaseCaseValuation(company, basis).valuation;
}

export function computeCompanyValuation(
  company: EnterpriseValueInputs & ValuationBusinessCompany & Pick<CompanySnapshot, "annuals" | "defaultDcf">
) {
  const series = computeAnnualMetrics(company.annuals);
  const latest = series[series.length - 1];
  const enterpriseValue = computeEnterpriseValue(company);
  const { wacc, terminalMultiple, targetFcfMargin, sbcDragPct } = company.defaultDcf;

  return {
    series,
    latest,
    enterpriseValue,
    netDilutionCagr: computeNetDilutionCagr(company.annuals),
    reverseDcf: isFinancialInstitution(company) || getValuationBusiness(company) === "financing-exposed" ? null : solveReverseDcf({
      enterpriseValue,
      baseRevenue: latest.revenue,
      waccPct: wacc,
      terminalMultiple,
      targetTrueFcfMarginPct: reverseDcfTargetMargin(targetFcfMargin, sbcDragPct),
      currentTrueFcfMarginPct: latest.trueFcfMargin,
    }),
  };
}

export function formatCurrencyCompact(millions: number): string {
  const abs = Math.abs(millions);
  const sign = millions < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(2)}T`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}B`;
  }
  if (abs > 0 && abs < 1) {
    return `${sign}$${Math.round(abs * 1_000)}K`;
  }
  return `${sign}$${abs.toFixed(0)}M`;
}

export function formatPct(value: number | null | undefined, showSign = false, decimals = 1): string {
  if (value == null) return "—";
  const sign = showSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

type ValuationBusinessCompany = ValuationBusinessInput & {
  cik?: string;
  valuationBusiness?: ValuationBusiness;
};

export function getValuationBusiness(company: ValuationBusinessCompany): ValuationBusiness {
  if (company.valuationBusiness) return company.valuationBusiness;
  return classifyValuationBusiness(company);
}

export function isFinancialInstitution(company: ValuationBusinessCompany): boolean {
  const business = getValuationBusiness(company);
  return business === "financial" || business === "reit";
}

export function isReit(company: ValuationBusinessCompany): boolean {
  return getValuationBusiness(company) === "reit";
}

export function matchesReitPriceToFfo(
  company: ValuationBusinessCompany & { priceToFfo?: number | null },
  max: number
): boolean {
  const multiple = company.priceToFfo;
  return isReit(company) && typeof multiple === "number" && Number.isFinite(multiple) &&
    multiple > 0 && multiple <= max;
}

export interface FinancialSectorMetrics {
  priceToBook: number | null;
  roePct: number | null;
  peRatio: number | null;
  bookValuePerShare: number | null;
  equityCagrPct: number | null;
  stockholdersEquity: number | null;
  tangibleBookValue: number | null;
  tangibleBookPerShare: number | null;
  priceToTbv: number | null;
  rotcePct: number | null;
  ffo: number | null;
  ffoPerShare: number | null;
  priceToFfo: number | null;
  ffoFiscalYear: string | null;
}

export function computeFinancialSectorMetrics(
  company: ValuationBusinessCompany & Pick<CompanySnapshot, "marketCap" | "annuals"> &
    Partial<Pick<CompanySnapshot, "price">>
): FinancialSectorMetrics {
  const fyOnly = company.annuals.filter((a) => a.fiscalYear !== "TTM");
  const latestWithEquity =
    [...company.annuals].reverse().find((a) => typeof a.stockholdersEquity === "number" && a.stockholdersEquity > 0) ??
    null;
  const latestWithNetIncome =
    [...company.annuals].reverse().find((a) => typeof a.netIncome === "number") ??
    null;
  const equity = latestWithEquity?.stockholdersEquity ?? null;
  const netIncome = latestWithNetIncome?.netIncome ?? null;
  const shares = latestWithEquity?.dilutedShares ?? company.annuals.at(-1)?.dilutedShares ?? 0;

  const priceToBook =
    equity && equity > 0 && company.marketCap > 0
      ? company.marketCap / equity
      : null;
  const roePct =
    equity && equity > 0 && netIncome !== null
      ? (netIncome / equity) * 100
      : null;
  const peRatio =
    netIncome && netIncome > 0 && company.marketCap > 0
      ? company.marketCap / netIncome
      : null;
  const bookValuePerShare =
    equity && equity > 0 && shares > 0 ? equity / shares : null;

  const goodwillIntangibles = latestWithEquity?.goodwillIntangibles ?? null;
  const tangibleBookValue =
    equity !== null && goodwillIntangibles !== null && equity - goodwillIntangibles > 0
      ? equity - goodwillIntangibles
      : null;
  const tangibleBookPerShare =
    tangibleBookValue !== null && shares > 0 ? tangibleBookValue / shares : null;
  const priceToTbv =
    tangibleBookValue !== null && tangibleBookValue > 0 && company.marketCap > 0
      ? company.marketCap / tangibleBookValue
      : null;
  const rotcePct =
    tangibleBookValue !== null && tangibleBookValue > 0 && netIncome !== null
      ? (netIncome / tangibleBookValue) * 100
      : null;

  const annualFfoPeriod = fyOnly.at(-1);
  const reportedFfo = isReit(company)
    ? getReportedFfo(company.cik, annualFfoPeriod?.periodEndDate)
    : undefined;
  const ffo = reportedFfo?.commonFfo ?? null;
  const ffoShares = annualFfoPeriod?.dilutedShares ?? 0;
  const ffoPerShare = reportedFfo?.perShare ?? (ffo !== null && ffoShares > 0 ? ffo / ffoShares : null);
  const price = company.price ?? 0;
  const priceToFfo = ffoPerShare !== null && ffoPerShare > 0 && price > 0
    ? price / ffoPerShare
    : null;
  const ffoFiscalYear = reportedFfo ? annualFfoPeriod?.fiscalYear ?? null : null;

  const equityFy = fyOnly.filter(
    (a) => typeof a.stockholdersEquity === "number" && a.stockholdersEquity > 0
  );
  let equityCagrPct: number | null = null;
  if (equityFy.length >= 2) {
    const first = equityFy[0];
    const last = equityFy[equityFy.length - 1];
    const years = fiscalYearsBetween(first, last);
    if (years && years > 0 && first.stockholdersEquity! > 0 && last.stockholdersEquity! > 0) {
      equityCagrPct =
        (Math.pow(last.stockholdersEquity! / first.stockholdersEquity!, 1 / years) - 1) * 100;
    }
  }

  return {
    priceToBook,
    roePct,
    peRatio,
    bookValuePerShare,
    equityCagrPct,
    stockholdersEquity: equity,
    tangibleBookValue,
    tangibleBookPerShare,
    priceToTbv,
    rotcePct,
    ffo,
    ffoPerShare,
    priceToFfo,
    ffoFiscalYear,
  };
}

export interface ShareholderYieldMetrics {
  dividendsPaid: number;
  dividendYieldPct: number;
  buybackYieldPct: number;
  sbcYieldPct: number;
  netBuybackYieldPct: number;
  totalShareholderYieldPct: number;
  dividendPayoutTrueFcfPct: number | null;
  dividendPayoutFfoPct: number | null;
}

export function computeShareholderYieldMetrics(
  company: Pick<CompanySnapshot, "marketCap" | "annuals" | "sector"> &
    Partial<Pick<CompanySnapshot, "cik">>
): ShareholderYieldMetrics {
  const computed = computeAnnualMetrics(company.annuals);
  const latest = computed[computed.length - 1];
  const dividendsPaid = Math.max(0, latest?.dividendsPaid ?? 0);
  const buybacks = Math.max(0, latest?.buybacks ?? 0);
  const sbc = Math.max(0, latest?.sbc ?? 0);
  const mcap = company.marketCap > 0 ? company.marketCap : 0;

  const dividendYieldPct = mcap > 0 ? (dividendsPaid / mcap) * 100 : 0;
  const buybackYieldPct = mcap > 0 ? (buybacks / mcap) * 100 : 0;
  const sbcYieldPct = mcap > 0 ? (sbc / mcap) * 100 : 0;
  const netBuybackYieldPct = mcap > 0 ? ((buybacks - sbc) / mcap) * 100 : 0;
  const totalShareholderYieldPct =
    mcap > 0 ? ((buybacks + dividendsPaid - sbc) / mcap) * 100 : 0;

  const dividendPayoutTrueFcfPct =
    dividendsPaid > 0 && latest && latest.trueFcf > 0
      ? (dividendsPaid / latest.trueFcf) * 100
      : null;

  const annual = company.annuals.findLast((row) => row.fiscalYear !== "TTM");
  const annualFfo = isReit(company) ? getReportedFfo(company.cik, annual?.periodEndDate)?.commonFfo : undefined;
  const annualDividends = annual?.dividendsPaid ?? 0;
  const dividendPayoutFfoPct = annualFfo && annualFfo > 0 && annualDividends > 0
    ? annualDividends / annualFfo * 100
    : null;

  return {
    dividendsPaid,
    dividendYieldPct,
    buybackYieldPct,
    sbcYieldPct,
    netBuybackYieldPct,
    totalShareholderYieldPct,
    dividendPayoutTrueFcfPct,
    dividendPayoutFfoPct,
  };
}

export interface ComputedQuarter extends ComputedAnnual {
  yoyRevenueGrowthPct: number | null;
}

export interface QuarterlyMomentumSummary {
  quarters: ComputedQuarter[];
  latestQuarterLabel: string | null;
  latestYoyRevGrowthPct: number | null;
  ttmTrueFcfMarginPct: number | null;
  qoqShareChangePct: number | null;
}

function quarterIndex(label: string): number | null {
  const parts = /^(\d{2}|\d{4})Q([1-4])$/i.exec(label);
  if (!parts) return null;
  const year = Number(parts[1]) + (parts[1].length === 2 ? 2000 : 0);
  return year * 4 + Number(parts[2]) - 1;
}

export function computeQuarterlyMomentum(
  quarterlyFinancials: AnnualFinancials[]
): QuarterlyMomentumSummary {
  if (!quarterlyFinancials || quarterlyFinancials.length === 0) {
    return {
      quarters: [],
      latestQuarterLabel: null,
      latestYoyRevGrowthPct: null,
      ttmTrueFcfMarginPct: null,
      qoqShareChangePct: null,
    };
  }

  const base = computeAnnualMetrics(quarterlyFinancials);
  const byQuarter = new Map(base.map((q) => [quarterIndex(q.fiscalYear), q]));
  const quarters: ComputedQuarter[] = base.map((q) => {
    const period = quarterIndex(q.fiscalYear);
    const prior = period === null ? undefined : byQuarter.get(period - 4);
    const yoyRevenueGrowthPct =
      prior && prior.revenue > 0
        ? ((q.revenue - prior.revenue) / prior.revenue) * 100
        : null;
    return { ...q, yoyRevenueGrowthPct };
  });

  const latest = quarters[quarters.length - 1];
  const prev = quarters.length >= 2 ? quarters[quarters.length - 2] : null;
  const last4 = quarters.slice(-4);
  const latestPeriod = latest ? quarterIndex(latest.fiscalYear) : null;
  const consecutive = (rows: ComputedQuarter[], count: number) =>
    latestPeriod !== null && rows.length === count &&
    rows.every((row, offset) => quarterIndex(row.fiscalYear) === latestPeriod - count + 1 + offset);
  const ttmRev = last4.reduce((sum, q) => sum + q.revenue, 0);
  const ttmTrueFcf = last4.reduce((sum, q) => sum + q.trueFcf, 0);

  return {
    quarters,
    latestQuarterLabel: latest?.fiscalYear ?? null,
    latestYoyRevGrowthPct: latest?.yoyRevenueGrowthPct ?? null,
    ttmTrueFcfMarginPct:
      consecutive(last4, 4) && ttmRev > 0 ? (ttmTrueFcf / ttmRev) * 100 : null,
    qoqShareChangePct:
      latest && prev && consecutive([prev, latest], 2) && prev.dilutedShares > 0 && latest.dilutedShares > 0
        ? ((latest.dilutedShares - prev.dilutedShares) / prev.dilutedShares) * 100
        : null,
  };
}

export interface CapitalAllocationSegment {
  key: "capex" | "rd" | "buybacks" | "dividends";
  label: string;
  amount: number;
  pct: number;
}

export interface CapitalAllocationMix {
  years: number;
  total: number;
  segments: CapitalAllocationSegment[];
}

export function computeCapitalAllocationMix(
  annuals: AnnualFinancials[]
): CapitalAllocationMix | null {
  const fyOnly = annuals.filter((r) => r.fiscalYear !== "TTM");
  if (fyOnly.length === 0) return null;

  const capex = fyOnly.reduce((sum, r) => sum + Math.max(0, r.capex), 0);
  const rd = fyOnly.reduce((sum, r) => sum + Math.max(0, r.rdExpense ?? 0), 0);
  const buybacks = fyOnly.reduce((sum, r) => sum + Math.max(0, r.buybacks), 0);
  const dividends = fyOnly.reduce((sum, r) => sum + Math.max(0, r.dividendsPaid ?? 0), 0);
  const total = capex + rd + buybacks + dividends;
  if (total <= 0) return null;

  const raw: Array<Omit<CapitalAllocationSegment, "pct">> = [
    { key: "capex", label: "CapEx", amount: capex },
    { key: "rd", label: "R&D", amount: rd },
    { key: "buybacks", label: "Buybacks", amount: buybacks },
    { key: "dividends", label: "Dividends", amount: dividends },
  ];

  const segments: CapitalAllocationSegment[] = raw
    .filter((s) => s.amount > 0)
    .map((s) => ({
      ...s,
      pct: (s.amount / total) * 100,
    }));

  return { years: fyOnly.length, total, segments };
}

export interface BalanceSheetHealthMetrics {
  netDebt: number;
  isNetCash: boolean;
  netDebtToEbitda: number | null;
  roicSpreadPct: number | null;
  cashConversionPct: number | null;
}

export function computeBalanceSheetHealth(
  company: Pick<CompanySnapshot, "cashAndEquiv" | "totalDebt" | "defaultDcf">,
  latest: ComputedAnnual,
  latestRoic: number | null
): BalanceSheetHealthMetrics {
  const netDebt = company.totalDebt - company.cashAndEquiv;
  const isNetCash = netDebt <= 0;

  let netDebtToEbitda: number | null = null;
  if (!isNetCash && typeof latest.operatingIncome === "number") {
    const da = Math.max(0, latest.depreciationAmortization ?? 0);
    const ebitda = latest.operatingIncome + da;
    if (ebitda > 0) {
      netDebtToEbitda = netDebt / ebitda;
    }
  }

  const roicSpreadPct =
    latestRoic !== null ? latestRoic - company.defaultDcf.wacc : null;

  const cashConversionPct =
    typeof latest.operatingIncome === "number" && latest.operatingIncome > 0
      ? (latest.trueFcf / latest.operatingIncome) * 100
      : null;

  return {
    netDebt,
    isNetCash,
    netDebtToEbitda,
    roicSpreadPct,
    cashConversionPct,
  };
}
