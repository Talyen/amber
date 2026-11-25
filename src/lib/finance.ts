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
  depreciationAmortization?: number | null; // $M (optional, for REIT FFO & EBITDA)
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
  tagline: string;
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
}

export interface FiveYearScenarioResult {
  yr5Rev: number;
  yr5TrueFcf: number;
  yr5TargetPrice: number;
  fairValueToday: number;
  upsidePct: number;
  totalMultiple: number;
  irrPct: number;
}

/**
 * Exact 5-year DCF scenario valuation (zero double-counting of buybacks/dividends).
 * Glides True FCF margin smoothly from current to target over 5 years, discounts
 * interim cash flows + Year-5 terminal EV to today, and adds current Net Cash.
 */
export function computeFiveYearScenario(
  inputs: FiveYearScenarioInputs
): FiveYearScenarioResult {
  const years = 5;
  const r = (inputs.hurdleRatePct ?? 10) / 100;
  const g = inputs.revGrowthPct / 100;
  const startMargin = Math.max(-0.15, Math.min(0.6, inputs.currentTrueFcfMarginPct / 100));
  const endMargin = Math.max(0.01, Math.min(0.65, inputs.targetTrueFcfMarginPct / 100));

  let rev = inputs.baseRevenue;
  let pvCashFlows = 0;
  let cumCashFlows = 0;
  let yr5TrueFcf = 0;

  for (let t = 1; t <= years; t++) {
    rev = rev * (1 + g);
    const margin = startMargin + (endMargin - startMargin) * (t / years);
    const fcf = rev * margin;
    pvCashFlows += fcf / Math.pow(1 + r, t);
    cumCashFlows += fcf;
    yr5TrueFcf = fcf;
  }

  const yr5Ev = Math.max(0, yr5TrueFcf * inputs.exitMultiple);
  const pvTerminal = yr5Ev / Math.pow(1 + r, years);

  const fairEquityToday = Math.max(
    1,
    pvCashFlows + pvTerminal + inputs.netCash
  );
  const shares = Math.max(1, inputs.dilutedShares);
  const fairValueToday = fairEquityToday / shares;
  const upsidePct =
    ((fairValueToday - inputs.currentPrice) / Math.max(0.01, inputs.currentPrice)) * 100;

  // Undiscounted Year-5 equity value (Terminal EV + current Net Cash + cumulative 5Y FCFs)
  const yr5EquityValue = Math.max(1, yr5Ev + inputs.netCash + cumCashFlows);
  const yr5TargetPrice = yr5EquityValue / shares;
  const totalMultiple = yr5TargetPrice / Math.max(0.01, inputs.currentPrice);
  const irrPct = (Math.pow(Math.max(0.05, totalMultiple), 1 / years) - 1) * 100;

  return {
    yr5Rev: rev,
    yr5TrueFcf,
    yr5TargetPrice,
    fairValueToday,
    upsidePct,
    totalMultiple,
    irrPct,
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

export interface BaseCaseValuationResult {
  lens: "fcf" | "ebit" | "pe";
  fairValue: number;
  upsidePct: number;
  revGrowthPct: number;
  targetMarginPct: number;
  exitMultiple: number;
}

/**
 * Computes Amber's Base Case 5-year DCF valuation using the exact same auto-lens
 * logic as ScenarioBuilder (P/E for financials, EBIT for heavy growth-CapEx cycles,
 * True FCF otherwise) so homepage screening and company detail pages always match.
 */
export function computeBaseCaseValuation(
  company: Pick<
    CompanySnapshot,
    "sector" | "price" | "cashAndEquiv" | "totalDebt" | "annuals" | "defaultDcf"
  >
): BaseCaseValuationResult {
  const series = computeAnnualMetrics(company.annuals);
  const latest = series[series.length - 1];
  const fyOnly = company.annuals.filter((a) => a.fiscalYear !== "TTM");
  const latestFy = fyOnly[fyOnly.length - 1] ?? latest;

  const histGrowth = Math.max(
    1,
    Math.min(24, Math.round(computeRevenueCagr(company.annuals)))
  );

  const capexPctRev =
    latest.revenue > 0 ? (latest.capex / latest.revenue) * 100 : 0;
  const currentOpMargin =
    typeof latestFy.operatingIncome === "number" && latestFy.revenue > 0
      ? (latestFy.operatingIncome / latestFy.revenue) * 100
      : null;
  const currentNetMargin =
    typeof latestFy.netIncome === "number" && latestFy.revenue > 0
      ? (latestFy.netIncome / latestFy.revenue) * 100
      : null;

  const hasEbit = currentOpMargin !== null && currentOpMargin > 2;
  const hasPe = currentNetMargin !== null && currentNetMargin > 2;
  const isFinancials = /financial|bank|insur/i.test(company.sector);
  const isHeavyCapexCycle =
    !isFinancials &&
    hasEbit &&
    capexPctRev >= 10 &&
    currentOpMargin! > Math.max(2, latest.trueFcfMargin * 1.6);

  const lens: "fcf" | "ebit" | "pe" =
    isFinancials && hasPe ? "pe" : isHeavyCapexCycle ? "ebit" : "fcf";

  let targetMarginPct: number;
  let exitMultiple: number;
  let currentMarginPct: number;

  if (lens === "ebit" && hasEbit) {
    targetMarginPct = Number(
      Math.max(3, Math.min(55, Math.round(currentOpMargin! * 1.05 * 2) / 2)).toFixed(1)
    );
    exitMultiple = histGrowth >= 12 ? 20 : histGrowth >= 7 ? 16 : 13;
    currentMarginPct = currentOpMargin!;
  } else if (lens === "pe" && hasPe) {
    targetMarginPct = Number(
      Math.max(2, Math.min(50, Math.round(currentNetMargin! * 1.05 * 2) / 2)).toFixed(1)
    );
    exitMultiple = histGrowth >= 12 ? 24 : histGrowth >= 7 ? 20 : 15;
    currentMarginPct = currentNetMargin!;
  } else {
    const rawBaseMargin = Math.max(
      1,
      company.defaultDcf.targetFcfMargin - company.defaultDcf.sbcDragPct
    );
    targetMarginPct = Number(
      Math.max(1, Math.min(55, Math.round(rawBaseMargin * 2) / 2)).toFixed(1)
    );
    exitMultiple = company.defaultDcf.terminalMultiple;
    currentMarginPct = latest.trueFcfMargin;
  }

  const scenario = computeFiveYearScenario({
    currentPrice: company.price,
    dilutedShares: latest.dilutedShares,
    baseRevenue: latest.revenue,
    currentTrueFcfMarginPct: currentMarginPct,
    netCash: lens === "pe" ? 0 : company.cashAndEquiv - company.totalDebt,
    revGrowthPct: histGrowth,
    targetTrueFcfMarginPct: targetMarginPct,
    exitMultiple,
    hurdleRatePct: 10,
  });

  return {
    lens,
    fairValue: Number(scenario.fairValueToday.toFixed(2)),
    upsidePct: Number(scenario.upsidePct.toFixed(1)),
    revGrowthPct: histGrowth,
    targetMarginPct,
    exitMultiple,
  };
}

export function computeCompanyValuation(
  company: EnterpriseValueInputs & Pick<CompanySnapshot, "annuals" | "defaultDcf">
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
    reverseDcf: solveReverseDcf({
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

export function formatPct(value: number, showSign = false, decimals = 1): string {
  const sign = showSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export const FINANCIAL_INSTITUTION_TICKERS = new Set([
  "JPM",
  "GS",
  "MS",
  "BAC",
  "WFC",
  "C",
  "AXP",
  "BX",
  "KKR",
  "BLK",
  "SCHW",
  "COF",
  "USB",
  "PNC",
  "TFC",
  "AMP",
  "CB",
  "PGR",
  "TRV",
  "MET",
  "PRU",
  "AIG",
  "ALL",
]);

export function isFinancialInstitution(
  company: Pick<CompanySnapshot, "ticker" | "sector">
): boolean {
  return (
    FINANCIAL_INSTITUTION_TICKERS.has(company.ticker) ||
    company.sector === "Financials" ||
    company.sector === "Real Estate & REITs"
  );
}

export function isReit(company: Pick<CompanySnapshot, "sector">): boolean {
  return company.sector === "Real Estate & REITs";
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
}

export function computeFinancialSectorMetrics(
  company: Pick<CompanySnapshot, "marketCap" | "annuals">
): FinancialSectorMetrics {
  const fyOnly = company.annuals.filter((a) => a.fiscalYear !== "TTM");
  const latestWithEquity =
    [...company.annuals].reverse().find((a) => typeof a.stockholdersEquity === "number" && a.stockholdersEquity > 0) ??
    null;
  const latestWithNetIncome =
    [...company.annuals].reverse().find((a) => typeof a.netIncome === "number") ??
    null;
  const latestWithDa =
    [...company.annuals].reverse().find(
      (a) => typeof a.netIncome === "number" && typeof a.depreciationAmortization === "number" && a.depreciationAmortization >= 0
    ) ?? null;

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

  const ffo =
    latestWithDa && typeof latestWithDa.netIncome === "number" && typeof latestWithDa.depreciationAmortization === "number"
      ? latestWithDa.netIncome + latestWithDa.depreciationAmortization
      : null;
  const ffoShares = latestWithDa?.dilutedShares ?? shares;
  const ffoPerShare =
    ffo !== null && ffoShares > 0 ? ffo / ffoShares : null;
  const priceToFfo =
    ffo !== null && ffo > 0 && company.marketCap > 0
      ? company.marketCap / ffo
      : null;

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
  company: Pick<CompanySnapshot, "marketCap" | "annuals">
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

  const sectorMetrics = computeFinancialSectorMetrics(company);
  const dividendPayoutFfoPct =
    dividendsPaid > 0 && sectorMetrics.ffo !== null && sectorMetrics.ffo > 0
      ? (dividendsPaid / sectorMetrics.ffo) * 100
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
