import type {
  AnnualFinancials,
  CompanySnapshot,
  FiveYearScenarioResult,
  ScenarioAssumptions,
  ScenarioBasis,
} from "../src/lib/finance.ts";

type ScenarioCompany = Parameters<typeof import("../src/lib/finance.ts").buildScenarioBasis>[0];

const supplementalFields = [
  "tangibleCommonEquity", "cet1Capital", "riskWeightedAssets", "deposits", "netChargeOffs",
  "returnOnTangibleEquityPct", "normalizedReturnOnTangibleEquityPct",
  "annualRecurringRevenue", "netRevenueRetentionPct", "annualCashBurn", "customerConcentrationPct",
  "annualProductionBoe", "provedReservesBoe", "sustainingCapex", "fundsFromOperations",
] as const;

type FiledFundamentals = Partial<Record<typeof supplementalFields[number], number>> & {
  reportedAt: string;
  source: string;
  sic?: string;
};

type Snapshot = Omit<ScenarioCompany, "annuals"> & {
  annuals: (AnnualFinancials & { filedAt?: string })[];
  filedFundamentals?: FiledFundamentals;
};

export interface BacktestEngine {
  computeGroundedDefaultDcf: (annuals: AnnualFinancials[]) => CompanySnapshot["defaultDcf"];
  buildScenarioBasis: (company: ScenarioCompany & {
    filedFundamentals?: Omit<FiledFundamentals, "source">;
  }, now?: number) => ScenarioBasis;
  getScenarioDefaults: (
    company: Pick<CompanySnapshot, "annuals" | "defaultDcf">,
    basis: ScenarioBasis,
  ) => {
    defaultLens: ScenarioAssumptions["lens"];
    revGrowth: number;
    byLens: Record<ScenarioAssumptions["lens"], { margin: number; multiple: number }>;
  };
  scenarioPresetAssumptions?: (lens: ScenarioAssumptions["lens"],
    defaults: ReturnType<BacktestEngine["getScenarioDefaults"]>, kind: "base") => ScenarioAssumptions;
  evaluateBaseCaseValuation?: (
    company: Pick<CompanySnapshot, "annuals" | "defaultDcf">,
    basis: ScenarioBasis,
  ) => { valuation: unknown | null; issue: string | null };
  computeScenarioProjection: (basis: ScenarioBasis, assumptions: ScenarioAssumptions) =>
    (FiveYearScenarioResult & { yr5DilutedShares?: number; yr5TangibleCommonEquity?: number }) | null;
}

interface Payoff {
  date: string;
  totalGrowth: number | null;
  benchmarkTotalGrowth: number | null;
  sizeTotalGrowth?: number | null;
  fundamentals?: {
    growth: number;
    revenue: number;
    fcfMargin: number;
    shares: number;
    netIncome?: number;
    netMargin?: number | null;
    fundsFromOperations?: number;
    tangibleCommonEquity?: number;
  } | null;
}

export interface Observation {
  formation: string;
  snapshot: Snapshot;
  results: Partial<Record<1 | 3 | 5 | 7, Payoff>>;
}

export const primaryMetrics = [
  "cash-flow-per-share", "revenue-growth", "earnings-per-share", "ffo-per-share", "tangible-book-per-share", "return-error",
] as const;
export type PrimaryMetric = typeof primaryMetrics[number];

const horizons = [1, 3, 5, 7] as const;
const day = 86_400_000;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function readObservations(raw: unknown): Observation[] {
  if (!raw || typeof raw !== "object" || !("panel" in raw) || !Array.isArray(raw.panel) || !raw.panel.length) {
    throw new Error("Expected a nonempty historical panel.");
  }
  const keys = new Set<string>();
  for (const row of raw.panel as Observation[]) {
    const { formation, snapshot, results } = row ?? {};
    if (!isDate(formation) || typeof snapshot?.ticker !== "string" || !snapshot.ticker ||
        typeof snapshot.sector !== "string" || !isDate(snapshot.priceAsOf) ||
        snapshot.priceAsOf > formation || Date.parse(formation) - Date.parse(snapshot.priceAsOf) > 7 * day ||
        !isNumber(snapshot.price) || snapshot.price <= 0 ||
        !Array.isArray(snapshot.annuals) || !snapshot.annuals.length ||
        snapshot.annuals.some((annual) => !isDate(annual?.periodEndDate) || annual.periodEndDate > snapshot.priceAsOf! ||
          (annual.filedAt !== undefined && (!isDate(annual.filedAt) || annual.filedAt < annual.periodEndDate ||
            annual.filedAt >= snapshot.priceAsOf!)) ||
          !isNumber(annual.revenue) || annual.revenue < 0 || !isNumber(annual.dilutedShares) ||
          annual.dilutedShares <= 0 || !isNumber(annual.operatingCashFlow) || !isNumber(annual.sbc) ||
          !isNumber(annual.capex)) ||
        !results || typeof results !== "object" || Array.isArray(results) ||
        Object.keys(results).some((key) => !["1", "3", "5", "7"].includes(key))) {
      throw new Error(`Invalid point-in-time observation for ${snapshot?.ticker ?? "unknown issuer"}.`);
    }
    const filed = snapshot.filedFundamentals;
    if (filed !== undefined && (!isDate(filed?.reportedAt) || filed.reportedAt >= snapshot.priceAsOf ||
        typeof filed.source !== "string" || !filed.source.trim() ||
        (filed.sic !== undefined && (typeof filed.sic !== "string" || !/^\d{4}$/.test(filed.sic))) ||
        supplementalFields.some((key) => filed[key] !== undefined && !isNumber(filed[key])))) {
      throw new Error(`Invalid supplemental fundamentals for ${snapshot.ticker} on ${formation}.`);
    }
    const key = JSON.stringify([snapshot.ticker, formation]);
    if (keys.has(key)) throw new Error(`Duplicate observation for ${snapshot.ticker} on ${formation}.`);
    keys.add(key);
    for (const horizon of horizons) {
      const result = results[horizon];
      if (!result) continue;
      if (!isDate(result.date) || result.date <= snapshot.priceAsOf ||
          Math.abs((Date.parse(result.date) - Date.parse(snapshot.priceAsOf)) / (365.25 * day) - horizon) > 0.05 ||
          [result.totalGrowth, result.benchmarkTotalGrowth, result.sizeTotalGrowth ?? null].some((value) =>
            value !== null && (!isNumber(value) || value < 0))) {
        throw new Error(`Invalid realized outcome for ${snapshot.ticker} on ${formation}.`);
      }
      const fundamental = result.fundamentals;
      if (fundamental && (![fundamental.growth, fundamental.fcfMargin, fundamental.revenue, fundamental.shares]
        .every(isNumber) || fundamental.revenue < 0 || fundamental.shares <= 0 ||
        [fundamental.netIncome, fundamental.fundsFromOperations, fundamental.tangibleCommonEquity]
          .some((value) => value !== undefined && !isNumber(value)) ||
        (fundamental.netMargin != null && !isNumber(fundamental.netMargin)))) {
        throw new Error(`Invalid realized fundamentals for ${snapshot.ticker} on ${formation}.`);
      }
    }
  }
  return raw.panel as Observation[];
}

export function panelWindow(panel: Observation[]) {
  let from = panel[0].snapshot.priceAsOf!;
  let through = from;
  for (const row of panel) {
    const date = row.snapshot.priceAsOf!;
    if (date < from) from = date;
    if (date > through) through = date;
    for (const result of Object.values(row.results)) {
      if (result && result.date > through) through = result.date;
    }
  }
  return { from, through };
}

type Forecast = {
  lens: ScenarioAssumptions["lens"];
  revenueGrowth: number | null;
  cashFlowPerShare: number | null;
  earningsPerShare: number | null;
  ffoPerShare: number | null;
  tangibleBookPerShare: number | null;
  irr: number | null;
  fairValue: number;
  assumptions: ScenarioAssumptions;
};

type PairedRow = {
  observation: Observation;
  baseline: Forecast | null;
  candidate: Forecast | null;
};

function forecast(engine: BacktestEngine, snapshot: Snapshot): Forecast | null {
  const now = Date.parse(snapshot.priceAsOf!);
  // Historical filings have already been reconstructed as of the trading close.
  // Today's CIK-based supplements and FFO table have no historical publication clock.
  const { ticker, sector, price, priceAsOf, marketCap, cashAndEquiv, totalDebt, lastFiling } = snapshot;
  const annuals = snapshot.annuals.map(({
    fiscalYear, periodEndDate, revenue, operatingCashFlow, capex, sbc, buybacks, dilutedShares, grossProfit,
    rdExpense, sgaExpense, operatingIncome, netIncome, stockholdersEquity, depreciationAmortization,
    goodwillIntangibles, dividendsPaid, cashAndEquiv, totalDebt,
  }) => ({
    fiscalYear, periodEndDate, revenue, operatingCashFlow, capex, sbc, buybacks, dilutedShares, grossProfit,
    rdExpense, sgaExpense, operatingIncome, netIncome, stockholdersEquity, depreciationAmortization,
    goodwillIntangibles, dividendsPaid, cashAndEquiv, totalDebt,
  }));
  const filed = snapshot.filedFundamentals;
  const filedFundamentals = filed && {
    reportedAt: filed.reportedAt, sic: filed.sic,
    ...Object.fromEntries(supplementalFields.flatMap((key) => filed[key] === undefined ? [] : [[key, filed[key]]])),
  };
  const company = {
    ticker, sector, price, priceAsOf, marketCap, cashAndEquiv, totalDebt,
    sic: filed?.sic ? Number(filed.sic) : undefined,
    annuals, lastFiling: lastFiling && { periodEnd: lastFiling.periodEnd },
    filedFundamentals,
    defaultDcf: engine.computeGroundedDefaultDcf(annuals),
  };
  const basis = engine.buildScenarioBasis(company, now);
  const defaults = engine.getScenarioDefaults(company, basis);
  const lens = defaults.defaultLens;
  const { margin, multiple } = defaults.byLens[lens];
  const assumptions = engine.scenarioPresetAssumptions?.(lens, defaults, "base") ??
    { lens, revGrowth: defaults.revGrowth, targetMargin: margin, exitMultiple: multiple };
  if (engine.evaluateBaseCaseValuation && !engine.evaluateBaseCaseValuation(company, basis).valuation) return null;
  const result = engine.computeScenarioProjection(basis, assumptions);
  if (!result || !isNumber(result.fairValueToday) || result.fairValueToday < 0 || !isNumber(result.yr5Rev) ||
      result.yr5Rev <= 0) return null;
  const shares = result.yr5DilutedShares ?? (lens === "pe" ? basis.earningsShares : undefined) ?? basis.dilutedShares;
  const perShare = (value: number | undefined) => isNumber(value) && isNumber(shares) && shares > 0 ? value / shares : null;
  // The archived realized FCF measure includes interest. Remove the unlevered
  // model's estimated addback to compare on the same basis.
  const interestAdjustment = (basis.model?.interestMargin ?? 0) / 100 * result.yr5Rev;
  const enterpriseCashFlow = lens === "fcf" ? result.yr5TrueFcf :
    lens === "ebit" ? result.yr5RecurringCashFlow : undefined;
  return {
    lens, assumptions,
    fairValue: result.fairValueToday,
    // The earnings and FFO lenses use the revenue field as a projection base
    // but apply earnings or FFO growth. Their projections aren't sales forecasts.
    revenueGrowth: (lens === "fcf" || lens === "ebit") && basis.revenue > 0
      ? annualize(result.yr5Rev / basis.revenue, 5) : null,
    irr: isNumber(result.irrPct) ? result.irrPct : null,
    cashFlowPerShare: isNumber(enterpriseCashFlow) ? perShare(enterpriseCashFlow - interestAdjustment) : null,
    earningsPerShare: lens === "pe" ? perShare(result.yr5TrueFcf) : null,
    ffoPerShare: lens === "ffo" ? perShare(result.yr5TrueFcf) : null,
    tangibleBookPerShare: perShare(result.yr5TangibleCommonEquity),
  };
}

function equivalentFundamentals(first: Forecast | null, second: Forecast | null) {
  return first === null || second === null ? first === second :
    JSON.stringify(first.assumptions) === JSON.stringify(second.assumptions) &&
    Math.abs(first.fairValue - second.fairValue) <= 1e-8 * Math.max(1, first.fairValue) &&
    first.revenueGrowth === second.revenueGrowth && first.cashFlowPerShare === second.cashFlowPerShare &&
    first.earningsPerShare === second.earningsPerShare && first.ffoPerShare === second.ffoPerShare &&
    first.tangibleBookPerShare === second.tangibleBookPerShare;
}

function checkPriceIndependence(engine: BacktestEngine, snapshot: Snapshot, first: Forecast | null) {
  return equivalentFundamentals(first, forecast(engine, {
    ...snapshot, price: snapshot.price * 2,
    marketCap: snapshot.marketCap === undefined ? undefined : snapshot.marketCap * 2,
  }));
}

function annualize(multiplier: number, years: number) {
  return (multiplier ** (1 / years) - 1) * 100;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function summarizeError(rows: PairedRow[], target: PrimaryMetric, horizon = 5) {
  const baseline: number[] = [];
  const candidate: number[] = [];
  let baselineAvailable = 0;
  let candidateAvailable = 0;
  let marketAvailable = 0;
  const tenPercentBenchmark: number[] = [];
  for (const row of rows) {
    const { observation } = row;
    const future = observation.results[horizon as 1 | 3 | 5 | 7];
    const actual = future?.fundamentals;
    const latest = observation.snapshot.annuals.at(-1)!;
    let expected: number | undefined;
    let b: number | null | undefined;
    let c: number | null | undefined;
    switch (target) {
      case "cash-flow-per-share":
      case "earnings-per-share":
      case "ffo-per-share":
      case "tangible-book-per-share": {
        if (!actual) continue;
        const netIncome = actual.netIncome ?? (isNumber(actual.netMargin) ? actual.revenue * actual.netMargin / 100 : undefined);
        const metrics = {
          "cash-flow-per-share": [actual.revenue * actual.fcfMargin / 100, "cashFlowPerShare"],
          "earnings-per-share": [netIncome, "earningsPerShare"],
          "ffo-per-share": [actual.fundsFromOperations, "ffoPerShare"],
          "tangible-book-per-share": [actual.tangibleCommonEquity, "tangibleBookPerShare"],
        } as const;
        const [actualValue, field] = metrics[target];
        const tangibleEquity = observation.snapshot.filedFundamentals?.tangibleCommonEquity;
        const anchor = target === "tangible-book-per-share" ? tangibleEquity : latest.revenue;
        if (actualValue === undefined || anchor === undefined || anchor <= 0) continue;
        const scale = 100 / (anchor / latest.dilutedShares);
        expected = actualValue / actual.shares * scale;
        const base = row.baseline?.[field];
        const candidate = row.candidate?.[field];
        b = base == null ? null : base * scale;
        c = candidate == null ? null : candidate * scale;
        break;
      }
      case "revenue-growth":
        expected = latest.revenue > 0 ? actual?.growth : undefined;
        b = row.baseline?.revenueGrowth;
        c = row.candidate?.revenueGrowth;
        break;
      case "return-error":
        expected = future?.totalGrowth == null ? undefined : annualize(future.totalGrowth, horizon);
        b = row.baseline?.irr;
        c = row.candidate?.irr;
        break;
    }
    if (!isNumber(expected)) continue;
    marketAvailable++;
    if (isNumber(b)) baselineAvailable++;
    if (isNumber(c)) candidateAvailable++;
    if (!isNumber(b) || !isNumber(c)) continue;
    baseline.push(b - expected);
    candidate.push(c - expected);
    if (target === "return-error") tenPercentBenchmark.push(Math.abs(10 - expected));
  }
  const baselineMae = mean(baseline.map(Math.abs));
  const candidateMae = mean(candidate.map(Math.abs));
  return {
    paired: baseline.length,
    outcomeAvailable: marketAvailable,
    baselineAvailable,
    candidateAvailable,
    baselineMae,
    candidateMae,
    deltaMae: baselineMae !== null && candidateMae !== null ? candidateMae - baselineMae : null,
    baselineBias: mean(baseline),
    candidateBias: mean(candidate),
    ...(target === "return-error" ? { fixedTenPercentMae: mean(tenPercentBenchmark) } : {}),
  };
}

function summarizePortfolios(rows: PairedRow[], horizon: 3 | 5 | 7) {
  const eligible = rows.flatMap(({ observation, baseline, candidate }) => {
    const payoff = observation.results[horizon];
    if (!baseline || !candidate || payoff?.totalGrowth == null || payoff.benchmarkTotalGrowth == null) return [];
    return [{
      formation: observation.formation,
      ticker: observation.snapshot.ticker,
      sector: observation.snapshot.sector,
      baselineGap: baseline.fairValue / observation.snapshot.price,
      candidateGap: candidate.fairValue / observation.snapshot.price,
      shareGrowth: payoff.totalGrowth,
      benchmarkGrowth: payoff.benchmarkTotalGrowth,
      sizeGrowth: payoff.sizeTotalGrowth ?? null,
    }];
  });

  const cohorts = Object.entries(Object.groupBy(eligible, (row) => row.formation))
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([formation, group]) => {
      if (!group || group.length < 5) return [];
      const groupReturn = mean(group.map((row) => row.shareGrowth))!;
      const firstSizeGrowth = group[0].sizeGrowth;
      const sizeGrowth = group.every((row) => row.sizeGrowth === firstSizeGrowth) ? firstSizeGrowth : null;
      const top = (key: "baselineGap" | "candidateGap") => {
        const ranked = (names: typeof group) => names
          .toSorted((a, b) => b[key] - a[key] || a.ticker.localeCompare(b.ticker))
          .slice(0, Math.ceil(names.length / 5));
        const topReturn = mean(ranked(group).map((row) => row.shareGrowth))!;
        const sectorWeighted = Object.values(Object.groupBy(group, (row) => row.sector))
          .reduce((sum, sector) => {
            const names = sector!;
            const selection = names.length >= 5 ? ranked(names) : names;
            return sum + mean(selection.map((row) => row.shareGrowth))! * names.length / group.length;
          }, 0);
        return {
          vsPeers: annualize(topReturn, horizon) - annualize(groupReturn, horizon),
          vsIndex: annualize(topReturn, horizon) - annualize(group[0].benchmarkGrowth, horizon),
          vsSizeIndex: sizeGrowth === null ? null : annualize(topReturn, horizon) - annualize(sizeGrowth, horizon),
          sectorNeutralVsPeers: annualize(sectorWeighted, horizon) - annualize(groupReturn, horizon),
        };
      };
      return [{ formation, paired: group.length, baseline: top("baselineGap"), candidate: top("candidateGap") }];
    });
  const average = (side: "baseline" | "candidate") => ({
    vsPeers: mean(cohorts.map((cohort) => cohort[side].vsPeers)),
    vsIndex: mean(cohorts.map((cohort) => cohort[side].vsIndex)),
    vsSizeIndex: mean(cohorts.flatMap((cohort) => cohort[side].vsSizeIndex ?? [])),
    sectorNeutralVsPeers: mean(cohorts.map((cohort) => cohort[side].sectorNeutralVsPeers)),
  });
  return { paired: eligible.length, cohorts, baseline: average("baseline"), candidate: average("candidate") };
}

function situations(snapshot: Snapshot) {
  const latest = snapshot.annuals.at(-1)!;
  const trueFcf = latest.operatingCashFlow - latest.capex - latest.sbc;
  const groups = [trueFcf > 0 ? "Positive cash flow after capex and SBC" : "Cash flow after capex and SBC at or below zero"];
  if (latest.revenue === 0) groups.push("Pre-revenue");
  if (latest.revenue > 0 && latest.capex / latest.revenue >= 0.10) groups.push("Capex at least 10% of revenue");
  if (trueFcf > 0 && latest.totalDebt != null && latest.cashAndEquiv != null &&
      (latest.totalDebt - latest.cashAndEquiv) / trueFcf >= 3) groups.push("Net debt at least 3× current cash flow");
  if (latest.operatingIncome != null && latest.operatingIncome < 0) groups.push("Operating loss");
  return groups;
}

export function compareForecasts(panel: Observation[], baseline: BacktestEngine, candidate: BacktestEngine, primary: PrimaryMetric) {
  let baselinePriceViolations = 0;
  let candidatePriceViolations = 0;
  let baselineIssuerSensitive = 0;
  let candidateIssuerSensitive = 0;
  let newlyIssuerSensitive = 0;
  const rows = panel.map((observation) => {
    const b = forecast(baseline, observation.snapshot);
    const c = forecast(candidate, observation.snapshot);
    if (!checkPriceIndependence(baseline, observation.snapshot, b)) baselinePriceViolations++;
    if (!checkPriceIndependence(candidate, observation.snapshot, c)) candidatePriceViolations++;
    const anonymized = { ...observation.snapshot, ticker: "__BACKTEST_ISSUER__" };
    const baselineSensitive = !equivalentFundamentals(b, forecast(baseline, anonymized));
    const candidateSensitive = !equivalentFundamentals(c, forecast(candidate, anonymized));
    if (baselineSensitive) baselineIssuerSensitive++;
    if (candidateSensitive) candidateIssuerSensitive++;
    if (candidateSensitive && !baselineSensitive) newlyIssuerSensitive++;
    return { observation, baseline: b, candidate: c };
  });
  const byGroup = (pairs: [string, PairedRow][]) => {
    const groups = new Map<string, PairedRow[]>();
    for (const [name, row] of pairs) {
      const group = groups.get(name) ?? [];
      group.push(row);
      groups.set(name, group);
    }
    return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, group]) => [
      name, {
        observations: group.length, primary: summarizeError(group, primary),
        returnError5: summarizeError(group, "return-error"),
      },
    ]));
  };
  const changed = rows.filter((row) => !equivalentFundamentals(row.baseline, row.candidate));
  return {
    observations: rows.length,
    issuers: new Set(panel.map(({ snapshot }) => snapshot.ticker)).size,
    inputCoverage: Object.fromEntries(["sic", ...supplementalFields].map((key) => [key,
      panel.filter(({ snapshot }) => Object.hasOwn(snapshot.filedFundamentals ?? {}, key)).length])),
    priceIndependence: { baselineViolations: baselinePriceViolations, candidateViolations: candidatePriceViolations },
    issuerIndependence: { baselineIssuerSensitive, candidateIssuerSensitive, newlyIssuerSensitive },
    coverage: {
      baseline: rows.filter((row) => row.baseline).length,
      candidate: rows.filter((row) => row.candidate).length,
      both: rows.filter((row) => row.baseline && row.candidate).length,
    },
    changedForecasts: {
      observations: changed.length,
      primary: summarizeError(changed, primary),
      returnError5: summarizeError(changed, "return-error"),
    },
    primary: summarizeError(rows, primary),
    fundamentals5: {
      cashFlowPerShare: summarizeError(rows, "cash-flow-per-share"),
      revenueGrowth: summarizeError(rows, "revenue-growth"),
      earningsPerShare: summarizeError(rows, "earnings-per-share"),
      ffoPerShare: summarizeError(rows, "ffo-per-share"),
      tangibleBookPerShare: summarizeError(rows, "tangible-book-per-share"),
    },
    horizonChecks: Object.fromEntries(([3, 5, 7] as const).map((horizon) => [
      horizon,
      { returnError: summarizeError(rows, "return-error", horizon), portfolios: summarizePortfolios(rows, horizon) },
    ])),
    byCohort: byGroup(rows.map((row) => [row.observation.formation, row])),
    bySector: byGroup(rows.map((row) => [row.observation.snapshot.sector, row])),
    byIndustry: byGroup(rows.flatMap((row): [string, PairedRow][] => row.observation.snapshot.filedFundamentals?.sic
      ? [[row.observation.snapshot.filedFundamentals.sic, row]] : [])),
    bySituation: byGroup(rows.flatMap((row) => situations(row.observation.snapshot).map((label): [string, PairedRow] => [label, row]))),
  };
}
