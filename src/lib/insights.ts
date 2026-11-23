import {
  type CompanySnapshot,
  type ComputedAnnual,
  computeNetDilutionCagr,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";
import type { InsiderTradeItem } from "@/components/InsiderRadar";
import type { SearchIndexEntry } from "@/data/universe";

export type PillarTone = "positive" | "amber" | "negative" | "neutral";

export interface BriefingPillar {
  id: "growth" | "cash" | "balance" | "expectations";
  question: string;
  verdict: string;
  headlineStat: string;
  explanation: string;
  tone: PillarTone;
  actionTab?: "fcf" | "dcf" | "diffs";
  actionLabel?: string;
}

export interface StandoutInsight {
  id: string;
  tag: string;
  title: string;
  detail: string;
  tone: PillarTone;
}

export interface CompanyBriefingData {
  revenueCagr: number;
  latestRevGrowth: number | null;
  netCash: number;
  capexPctRev: number;
  pillars: BriefingPillar[];
  standouts: StandoutInsight[];
}

export function computeRevenueCagr(annuals: CompanySnapshot["annuals"]): number {
  const fy = annuals.filter((a) => a.fiscalYear !== "TTM");
  if (fy.length < 2 || fy[0].revenue <= 0) return 0;
  const first = fy[0].revenue;
  const last = fy[fy.length - 1].revenue;
  const years = fy.length - 1;
  return (Math.pow(last / first, 1 / years) - 1) * 100;
}

export function computeLatestRevenueGrowth(
  annuals: CompanySnapshot["annuals"]
): number | null {
  const fy = annuals.filter((a) => a.fiscalYear !== "TTM");
  if (fy.length < 2) return null;
  const prev = fy[fy.length - 2].revenue;
  const curr = fy[fy.length - 1].revenue;
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

export function buildCompanyBriefing(
  company: CompanySnapshot,
  series: ComputedAnnual[],
  impliedCagr: number,
  insiderTrades: InsiderTradeItem[]
): CompanyBriefingData {
  const latest = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : null;
  const revenueCagr = computeRevenueCagr(company.annuals);
  const latestRevGrowth = computeLatestRevenueGrowth(company.annuals);
  const dilutionCagr = computeNetDilutionCagr(company.annuals);
  const netCash = company.cashAndEquiv - company.totalDebt;
  const capexPctRev = latest.revenue > 0 ? (latest.capex / latest.revenue) * 100 : 0;

  // 1. Growth Pillar
  const growthPillar: BriefingPillar = {
    id: "growth",
    question: "Is the business growing?",
    verdict:
      revenueCagr >= 20
        ? "Fast Compounder"
        : revenueCagr >= 10
          ? "Healthy Growth"
          : revenueCagr >= 3
            ? "Steady Mature"
            : "Slowing / Flat",
    headlineStat: `${formatPct(revenueCagr, true)} / yr`,
    explanation: `Revenue grew from ${formatCurrencyCompact(series[0].revenue)} to ${formatCurrencyCompact(latest.revenue)}${
      latestRevGrowth !== null
        ? ` (${formatPct(latestRevGrowth, true)} in the latest full year).`
        : "."
    }`,
    tone:
      revenueCagr >= 12
        ? "positive"
        : revenueCagr >= 4
          ? "neutral"
          : "negative",
  };

  // 2. Cash Quality Pillar
  const cashPillar: BriefingPillar = {
    id: "cash",
    question: "Does it generate real cash?",
    verdict:
      latest.trueFcfMargin >= 22 && latest.sbcPctRevenue < 8
        ? "Cash Machine"
        : latest.trueFcf > 0 && latest.sbcPctRevenue >= 12
          ? "SBC-Heavy Cash"
          : latest.trueFcf > 0
            ? "Cash Generative"
            : capexPctRev >= 15
              ? "Heavy Reinvestment"
              : "Cash Burn (After SBC)",
    headlineStat: `${formatPct(latest.trueFcfMargin)} margin`,
    explanation:
      latest.trueFcf >= 0
        ? `Keeps ${formatPct(latest.trueFcfMargin)} of revenue as real cash (${formatCurrencyCompact(latest.trueFcf)}) after capital spending and employee stock grants.`
        : `Reported ${formatCurrencyCompact(latest.reportedFcf)} in headline FCF, but ${formatCurrencyCompact(latest.sbc)} in stock comp leaves real cash negative.`,
    tone:
      latest.trueFcfMargin >= 18
        ? "positive"
        : latest.trueFcf > 0
          ? "amber"
          : "negative",
    actionTab: "fcf",
    actionLabel: "Inspect cash breakdown →",
  };

  // 3. Balance Sheet Pillar
  const netCashToMktCap =
    company.marketCap > 0 ? (netCash / company.marketCap) * 100 : 0;
  const balancePillar: BriefingPillar = {
    id: "balance",
    question: "Is the balance sheet safe?",
    verdict:
      netCash > 0
        ? "Net Cash Fortress"
        : Math.abs(netCash) < Math.max(latest.reportedFcf * 2.5, company.marketCap * 0.08)
          ? "Manageable Debt"
          : "Leveraged",
    headlineStat:
      netCash >= 0
        ? `+${formatCurrencyCompact(netCash)} net cash`
        : `${formatCurrencyCompact(netCash)} net debt`,
    explanation: `Holds ${formatCurrencyCompact(company.cashAndEquiv)} in cash & short-term investments against ${formatCurrencyCompact(company.totalDebt)} in total debt${
      netCashToMktCap > 5 ? ` (${formatPct(netCashToMktCap)} of market cap in net cash).` : "."
    }`,
    tone:
      netCash > 0
        ? "positive"
        : Math.abs(netCash) < Math.max(latest.reportedFcf * 3, company.marketCap * 0.1)
          ? "neutral"
          : "amber",
  };

  // 4. Market Expectations Pillar
  const growthGap = impliedCagr - revenueCagr;
  const expectationsPillar: BriefingPillar = {
    id: "expectations",
    question: "What is the stock pricing in?",
    verdict:
      impliedCagr >= 22
        ? "Priced for Perfection"
        : growthGap > 4
          ? "Expects Acceleration"
          : growthGap < -4
            ? "Conservative Bar"
            : "In Line With History",
    headlineStat: `${formatPct(impliedCagr)} / yr`,
    explanation: `Today's price implies ${formatPct(impliedCagr)} annual revenue growth for the next 10 years, compared to ${formatPct(revenueCagr)}/yr historically.`,
    tone:
      impliedCagr >= 22 || growthGap > 6
        ? "amber"
        : growthGap < -3
          ? "positive"
          : "neutral",
    actionTab: "dcf",
    actionLabel: "Test your own assumptions →",
  };

  // Standout Takeaways ("Things you didn't even know to look for")
  const standouts: StandoutInsight[] = [];

  if (Math.abs(growthGap) >= 4) {
    standouts.push({
      id: "growth-gap",
      tag: "Expectation Gap",
      title:
        growthGap > 0
          ? `The market expects growth to accelerate by +${growthGap.toFixed(1)} pts/yr`
          : `The market is pricing in a slowdown from ${formatPct(revenueCagr)} to ${formatPct(impliedCagr)}/yr`,
      detail:
        growthGap > 0
          ? `Over recent fiscal years ${company.ticker} compounded revenue at ${formatPct(revenueCagr)}/yr, but its current Enterprise Value requires ${formatPct(impliedCagr)}/yr for a decade.`
          : `${company.ticker} grew revenue at ${formatPct(revenueCagr)}/yr historically; even if growth moderates to ${formatPct(impliedCagr)}/yr, today's valuation still works under baseline assumptions.`,
      tone: growthGap > 6 ? "amber" : "positive",
    });
  }

  if (latest.sbcPctRevenue >= 10) {
    standouts.push({
      id: "sbc-drag",
      tag: "Hidden Cost",
      title: `Employee stock comp absorbs ${formatPct(latest.sbcPctReportedFcf, false, 0)} of headline Free Cash Flow`,
      detail: `Standard screeners highlight ${formatCurrencyCompact(latest.reportedFcf)} in FCF, but ${company.ticker} issued ${formatCurrencyCompact(latest.sbc)} in stock compensation (${formatPct(latest.sbcPctRevenue)} of revenue).`,
      tone: latest.trueFcf < 0 ? "negative" : "amber",
    });
  }

  if (dilutionCagr <= -1.2) {
    standouts.push({
      id: "buyback-cannibal",
      tag: "Shareholder Tailwind",
      title: `Share count shrank ${Math.abs(dilutionCagr).toFixed(1)}%/yr via buybacks`,
      detail: `${company.name} reduced diluted shares from ${series[0].dilutedShares.toLocaleString()}M to ${latest.dilutedShares.toLocaleString()}M, giving existing owners a larger slice of future cash flows automatically.`,
      tone: "positive",
    });
  } else if (dilutionCagr >= 2.2) {
    standouts.push({
      id: "dilution-headwind",
      tag: "Ownership Dilution",
      title: `Diluted shares expanded +${dilutionCagr.toFixed(1)}%/yr`,
      detail: `Share count grew from ${series[0].dilutedShares.toLocaleString()}M to ${latest.dilutedShares.toLocaleString()}M, so business growth has to outrun ~${dilutionCagr.toFixed(1)}%/yr of dilution just to keep per-share value flat.`,
      tone: "negative",
    });
  }

  if (prev && prev.capex > 0 && latest.capex / prev.capex >= 1.35 && capexPctRev >= 8) {
    const capexJump = ((latest.capex - prev.capex) / prev.capex) * 100;
    standouts.push({
      id: "capex-surge",
      tag: "Capital Cycle",
      title: `Capital spending surged +${capexJump.toFixed(0)}% to ${formatCurrencyCompact(latest.capex)}`,
      detail: `CapEx now equals ${formatPct(capexPctRev)} of revenue, temporarily depressing near-term Free Cash Flow while building capacity for future demand.`,
      tone: "amber",
    });
  }

  const buyTrades = insiderTrades.filter((t) => t.transactionType === "Buy");
  const sellTrades = insiderTrades.filter((t) => t.transactionType === "Sell");
  if (buyTrades.length > 0) {
    const buyTotal = buyTrades.reduce((s, t) => s + t.totalValue, 0);
    standouts.push({
      id: "insider-buy",
      tag: "Insider Signal",
      title: `Insiders bought ${formatCurrencyCompact(buyTotal)} on the open market`,
      detail: `${buyTrades.length} recent SEC Form 4 open-market purchase(s) recorded, a notable signal of management conviction.`,
      tone: "positive",
    });
  } else if (sellTrades.length >= 3) {
    const sellTotal = sellTrades.reduce((s, t) => s + t.totalValue, 0);
    standouts.push({
      id: "insider-sell",
      tag: "Insider Activity",
      title: `${formatCurrencyCompact(sellTotal)} in recent open-market insider sales`,
      detail: `${sellTrades.length} recent SEC Form 4 sales logged across executives/directors. Check the Insiders tab for individual transactions.`,
      tone: "neutral",
    });
  }

  if (company.filingDiffs.length > 0 && standouts.length < 3) {
    const topDiff = company.filingDiffs[0];
    standouts.push({
      id: "top-filing-diff",
      tag: `SEC ${topDiff.filingType}`,
      title: topDiff.headline,
      detail: topDiff.summary,
      tone: topDiff.materiality === "High" ? "amber" : "neutral",
    });
  }

  return {
    revenueCagr,
    latestRevGrowth,
    netCash,
    capexPctRev,
    pillars: [growthPillar, cashPillar, balancePillar, expectationsPillar],
    standouts: standouts.slice(0, 4),
  };
}

export type IndexSortKey =
  | "marketCap"
  | "trueFcf"
  | "trueFcfMargin"
  | "sbcPctRevenue"
  | "netDilutionCagr"
  | "impliedCagr";

export interface DiscoveryLens {
  id: string;
  title: string;
  subtitle: string;
  whyItMatters: string;
  defaultSortKey: IndexSortKey;
  defaultSortDir: "desc" | "asc";
  filter: (entry: SearchIndexEntry) => boolean;
  sort: (a: SearchIndexEntry, b: SearchIndexEntry) => number;
}

export const DISCOVERY_LENSES: DiscoveryLens[] = [
  {
    id: "cash-machines",
    title: "Cash Machines",
    subtitle: "High real cash margins, low dilution",
    whyItMatters:
      "Businesses that convert >22% of revenue into real cash after stock comp tend to self-fund growth and weather downturns.",
    defaultSortKey: "trueFcfMargin",
    defaultSortDir: "desc",
    filter: (c) =>
      c.revenue >= 500 &&
      c.trueFcfMargin >= 22 &&
      c.trueFcfMargin <= 75 &&
      c.sbcPctRevenue <= 8,
    sort: (a, b) => b.trueFcfMargin - a.trueFcfMargin,
  },
  {
    id: "buyback-cannibals",
    title: "Buyback Cannibals",
    subtitle: "Steadily shrinking their share count",
    whyItMatters:
      "Companies that retire 2%+ of their shares every year increase your ownership stake automatically, even when revenue grows modestly.",
    defaultSortKey: "netDilutionCagr",
    defaultSortDir: "asc",
    filter: (c) =>
      c.revenue >= 500 &&
      c.netDilutionCagr <= -1.5 &&
      c.trueFcf > 0,
    sort: (a, b) => a.netDilutionCagr - b.netDilutionCagr,
  },
  {
    id: "priced-for-perfection",
    title: "Priced for Perfection",
    subtitle: "Steepest market-implied 10Y growth",
    whyItMatters:
      "Great companies can still be risky stocks when the share price already bakes in 18%+ annual growth for the next decade.",
    defaultSortKey: "impliedCagr",
    defaultSortDir: "desc",
    filter: (c) =>
      c.revenue >= 300 &&
      c.impliedCagr >= 15 &&
      c.impliedCagr < 60,
    sort: (a, b) => b.impliedCagr - a.impliedCagr,
  },
  {
    id: "hidden-dilution",
    title: "Hidden Dilution",
    subtitle: "Headline FCF masked by heavy stock comp",
    whyItMatters:
      "Standard screeners ignore stock-based compensation. These companies look much more profitable before you count what employees are paid in equity.",
    defaultSortKey: "sbcPctRevenue",
    defaultSortDir: "desc",
    filter: (c) =>
      c.revenue >= 300 &&
      c.sbcPctRevenue >= 12 &&
      c.sbcPctRevenue <= 85,
    sort: (a, b) => b.sbcPctRevenue - a.sbcPctRevenue,
  },
  {
    id: "reasonable-expectations",
    title: "Modest Expectations",
    subtitle: "Cash-generative stocks with a low bar",
    whyItMatters:
      "Profitable businesses where the market is only pricing in single-digit long-term growth, leaving room for upside surprises.",
    defaultSortKey: "impliedCagr",
    defaultSortDir: "asc",
    filter: (c) =>
      c.revenue >= 1000 &&
      c.trueFcfMargin >= 12 &&
      c.trueFcfMargin <= 75 &&
      c.impliedCagr > 0 &&
      c.impliedCagr <= 9,
    sort: (a, b) => a.impliedCagr - b.impliedCagr,
  },
];
