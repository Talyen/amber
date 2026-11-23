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
  periodEndDate?: string | null; // e.g. "2025-09-27"
  cashAndEquiv?: number | null; // $M historical cash
  totalDebt?: number | null; // $M historical debt
}

export interface AnnualPricePoint {
  fiscalYear: string; // e.g. "FY22"
  price: number; // $
}

export interface FilingDiffItem {
  id: string;
  filingType: "10-K" | "10-Q" | "8-K" | "DEF 14A" | "Form 4";
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
    type: "10-K" | "10-Q";
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
  sbcPctReportedFcf: number; // %
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
    const sbcPctReportedFcf =
      reportedFcf > 0
        ? (row.sbc / reportedFcf) * 100
        : row.sbc > 0
          ? 100
          : 0;
    const prev = idx > 0 ? annuals[idx - 1] : null;
    const yoyShareChangePct =
      prev && prev.dilutedShares > 0 && (fiscalYearsBetween(prev, row) ?? 1) === 1
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
    solvedCagr <= -0.249 ? "low" : solvedCagr >= 0.849 ? "high" : null;

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
