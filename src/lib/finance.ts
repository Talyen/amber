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
}

export interface AnnualPricePoint {
  fiscalYear: string; // e.g. "FY22"
  price: number; // $
}

export interface FilingDiffItem {
  id: string;
  filingType: "10-K" | "10-Q" | "DEF 14A" | "Form 4";
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
    const reportedFcfMargin = (reportedFcf / row.revenue) * 100;
    const trueFcfMargin = (trueFcf / row.revenue) * 100;
    const sbcPctRevenue = (row.sbc / row.revenue) * 100;
    const sbcPctReportedFcf =
      reportedFcf > 0 ? (row.sbc / reportedFcf) * 100 : 100;
    const prev = idx > 0 ? annuals[idx - 1] : null;
    const yoyShareChangePct = prev
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

export function computeEnterpriseValue(company: CompanySnapshot): number {
  return company.marketCap + company.totalDebt - company.cashAndEquiv;
}

export function computeNetDilutionCagr(annuals: AnnualFinancials[]): number {
  if (annuals.length < 2) return 0;
  const first = annuals[0].dilutedShares;
  const last = annuals[annuals.length - 1].dilutedShares;
  const years = annuals.length - 1;
  return (Math.pow(last / first, 1 / years) - 1) * 100;
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

  // Modest +10% operating-leverage headroom above historical median, never an arbitrary 18% floor
  const rawTarget =
    medianRepMargin > 0.5
      ? medianRepMargin * 1.1
      : Math.max(2, Math.min(18, ocfMargin * 0.55));

  const targetFcfMargin = Number(
    Math.max(1.5, Math.min(55, rawTarget)).toFixed(1)
  );
  const sbcDragPct = Number(
    Math.max(
      0.2,
      Math.min(Math.max(0.5, targetFcfMargin * 0.55), latest.sbcPctRevenue * 0.8)
    ).toFixed(1)
  );

  return {
    wacc: 9.5,
    terminalMultiple: 22,
    targetFcfMargin,
    sbcDragPct,
  };
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
  const startMargin = Math.max(-0.1, Math.min(0.6, inputs.currentTrueFcfMarginPct / 100));
  const endMargin = Math.max(0.02, Math.min(0.65, inputs.targetTrueFcfMarginPct / 100));

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

  return {
    impliedRevenueCagrPct: solvedCagr * 100,
    year10Revenue: final.yrNRev,
    year10TrueFcf: final.yrNFcf,
    terminalValuePv: final.tvPv,
    explicitCashFlowPv: final.cfPv,
    impliedEvToYear10Fcf:
      final.yrNFcf > 0 ? inputs.enterpriseValue / final.yrNFcf : 0,
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
  return `${sign}$${abs.toFixed(0)}M`;
}

export function formatPct(value: number, showSign = false, decimals = 1): string {
  const sign = showSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}
