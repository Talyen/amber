import type { InsiderTradeItem } from "@/components/InsiderRadar";
import type { SearchIndexEntry } from "@/data/search-index";
import {
  computeCompanyValuation,
  formatCurrencyCompact,
  formatPct,
  isFinancialInstitution,
  type CompanySnapshot,
} from "./finance.ts";
import { formatInsiderName, formatInsiderTitle } from "./insider-format.ts";
import { DISCOVERY_LENSES, type LensFilterContext } from "./insights.ts";
import { SITE_NAME, SITE_URL } from "./site.ts";

export function sectorSlug(sector: string): string {
  return sector
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface PublicCompanyPayload {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  sector_slug: string;
  cik: string;
  price_usd: number;
  price_as_of: string | null;
  market_cap_m: number;
  enterprise_value_m: number;
  cash_and_equiv_m: number;
  total_debt_m: number;
  net_cash_m: number;
  latest_period: string;
  last_filing: {
    type: string;
    date: string;
    accession_number: string;
  };
  metrics: {
    revenue_m: number;
    reported_fcf_m: number | null;
    sbc_m: number;
    sbc_pct_revenue: number;
    true_fcf_m: number | null;
    true_fcf_margin_pct: number | null;
    diluted_shares_m: number;
    net_dilution_4y_cagr_pct: number;
    implied_10y_revenue_cagr_pct: number | null;
  };
  recent_filing_diffs: Array<{
    id: string;
    filing_type: string;
    filing_date: string;
    section: string;
    category: string;
    materiality: string;
    headline: string;
    summary: string;
    url: string;
  }>;
  recent_insider_buys: Array<{
    filing_date: string;
    insider_name: string;
    insider_title: string;
    shares: number;
    price_per_share: number;
    total_value_m: number;
  }>;
  urls: {
    overview: string;
    sbc_and_true_fcf: string;
    valuation: string;
    filings: string;
    rss: string;
    embed_sankey: string | null;
    embed_true_fcf: string | null;
  };
  attribution: string;
}

export function buildPublicCompanyPayload(
  company: CompanySnapshot,
  insiderTrades: InsiderTradeItem[] = []
): PublicCompanyPayload {
  const { latest, enterpriseValue, netDilutionCagr, reverseDcf } =
    computeCompanyValuation(company);
  const netCash = company.cashAndEquiv - company.totalDebt;
  const equityLensOnly = isFinancialInstitution(company);

  const recentDiffs = company.filingDiffs.slice(0, 5).map((d) => ({
    id: d.id,
    filing_type: d.filingType,
    filing_date: d.filingDate,
    section: d.section,
    category: d.category,
    materiality: d.materiality,
    headline: d.headline,
    summary: d.summary,
    url: `${SITE_URL}/filings/${encodeURIComponent(d.id)}`,
  }));

  const recentBuys = insiderTrades
    .filter((t) => t.transactionType === "Buy")
    .slice(0, 5)
    .map((t) => ({
      filing_date: t.filingDate,
      insider_name: formatInsiderName(t.insiderName),
      insider_title: formatInsiderTitle(t.insiderTitle),
      shares: Math.round(t.shares),
      price_per_share: Number(t.pricePerShare.toFixed(2)),
      total_value_m: Number(t.totalValue.toFixed(2)),
    }));

  return {
    ticker: company.ticker,
    name: company.name,
    exchange: company.exchange,
    sector: company.sector,
    sector_slug: sectorSlug(company.sector),
    cik: company.cik,
    price_usd: company.price,
    price_as_of: company.priceAsOf ?? null,
    market_cap_m: Math.round(company.marketCap),
    enterprise_value_m: Math.round(enterpriseValue),
    cash_and_equiv_m: Math.round(company.cashAndEquiv),
    total_debt_m: Math.round(company.totalDebt),
    net_cash_m: Math.round(netCash),
    latest_period: latest.fiscalYear,
    last_filing: {
      type: company.lastFiling.type,
      date: company.lastFiling.date,
      accession_number: company.lastFiling.accessionNumber,
    },
    metrics: {
      revenue_m: Math.round(latest.revenue),
      reported_fcf_m: equityLensOnly ? null : Math.round(latest.reportedFcf),
      sbc_m: Math.round(latest.sbc),
      sbc_pct_revenue: Number(latest.sbcPctRevenue.toFixed(2)),
      true_fcf_m: equityLensOnly ? null : Math.round(latest.trueFcf),
      true_fcf_margin_pct: equityLensOnly ? null : Number(latest.trueFcfMargin.toFixed(2)),
      diluted_shares_m: Number(latest.dilutedShares.toFixed(1)),
      net_dilution_4y_cagr_pct: Number(netDilutionCagr.toFixed(2)),
      implied_10y_revenue_cagr_pct:
        reverseDcf?.impliedRevenueCagrPct != null
          ? Number(reverseDcf.impliedRevenueCagrPct.toFixed(2))
          : null,
    },
    recent_filing_diffs: recentDiffs,
    recent_insider_buys: recentBuys,
    urls: {
      overview: `${SITE_URL}/t/${company.ticker}`,
      sbc_and_true_fcf: `${SITE_URL}/t/${company.ticker}/sbc`,
      valuation: `${SITE_URL}/t/${company.ticker}/valuation`,
      filings: `${SITE_URL}/t/${company.ticker}/filings`,
      rss: `${SITE_URL}/t/${company.ticker}/feed.xml`,
      embed_sankey: equityLensOnly ? null : `${SITE_URL}/embed/${company.ticker}?chart=sankey`,
      embed_true_fcf: equityLensOnly ? null : `${SITE_URL}/embed/${company.ticker}?chart=true-fcf`,
    },
    attribution: `SEC EDGAR verified data via ${SITE_NAME} (${SITE_URL}/t/${company.ticker})`,
  };
}

export function formatCompanyMarkdown(payload: PublicCompanyPayload): string {
  const m = payload.metrics;
  const netBalanceLabel =
    payload.net_cash_m >= 0
      ? `+${formatCurrencyCompact(payload.net_cash_m)} net cash`
      : `${formatCurrencyCompact(Math.abs(payload.net_cash_m))} net debt`;

  const lines: string[] = [
    `# ${payload.name} (${payload.ticker})`,
    "",
    `> ${payload.exchange} · ${payload.sector} · SEC ${payload.last_filing.type} (${payload.last_filing.date}) · Interactive model: ${payload.urls.overview}`,
    "",
    "## Key Fundamentals (SEC EDGAR Verified)",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Price | $${payload.price_usd.toFixed(2)} (${payload.price_as_of ? `close ${payload.price_as_of}` : "close date unavailable"}) |`,
    `| Market Cap | ${formatCurrencyCompact(payload.market_cap_m)} |`,
    `| Enterprise Value | ${formatCurrencyCompact(payload.enterprise_value_m)} |`,
    `| Balance Sheet | ${netBalanceLabel} (Cash ${formatCurrencyCompact(payload.cash_and_equiv_m)} vs. Debt ${formatCurrencyCompact(payload.total_debt_m)}) |`,
    `| Revenue (${payload.latest_period}) | ${formatCurrencyCompact(m.revenue_m)} |`,
    `| Reported FCF | ${m.reported_fcf_m === null ? "N/A (Sector-native lens)" : formatCurrencyCompact(m.reported_fcf_m)} |`,
    `| Stock-Based Compensation (SBC) | ${formatCurrencyCompact(m.sbc_m)} (${formatPct(m.sbc_pct_revenue)} of revenue) |`,
    `| **True FCF (FCF − SBC)** | ${m.true_fcf_m === null ? "N/A (Sector-native lens)" : `**${formatCurrencyCompact(m.true_fcf_m)} (${formatPct(m.true_fcf_margin_pct)} margin)**`} |`,
    `| 4Y Share Count Trend | ${formatPct(m.net_dilution_4y_cagr_pct, true)}/yr (${m.diluted_shares_m.toLocaleString()}M diluted shares) |`,
    `| Reverse DCF Priced-In 10Y Growth | ${m.implied_10y_revenue_cagr_pct !== null ? `${formatPct(m.implied_10y_revenue_cagr_pct)}/yr` : "N/A (Sector-native lens)"} |`,
    "",
  ];

  if (payload.recent_filing_diffs.length > 0) {
    lines.push("## Recent SEC Filing Diffs");
    for (const d of payload.recent_filing_diffs) {
      lines.push(`- **${d.filing_type} (${d.filing_date}, ${d.materiality}) — ${d.headline}**: ${d.summary} ([View diff](${d.url}))`);
    }
    lines.push("");
  }

  if (payload.recent_insider_buys.length > 0) {
    lines.push("## Recent Open-Market Insider Buys (Form 4)");
    for (const b of payload.recent_insider_buys) {
      lines.push(
        `- **${b.filing_date}**: ${b.insider_name} (${b.insider_title}) bought ${b.shares.toLocaleString()} shares at $${b.price_per_share.toFixed(2)} (${formatCurrencyCompact(b.total_value_m)})`
      );
    }
    lines.push("");
  }

  lines.push("## Interactive Amber Links");
  lines.push(`- ${payload.urls.embed_sankey ? "Overview & Revenue Sankey" : "Company Overview"}: ${payload.urls.overview}`);
  lines.push(`- ${payload.urls.embed_true_fcf ? "SBC, Dilution & True FCF Bridge" : "SBC & Dilution"}: ${payload.urls.sbc_and_true_fcf}`);
  lines.push(`- ${m.implied_10y_revenue_cagr_pct !== null ? "Reverse DCF & " : ""}5-Year Scenario Studio: ${payload.urls.valuation}`);
  lines.push(`- SEC Filing Diffs & Form 4 Insiders: ${payload.urls.filings}`);
  lines.push("");

  return lines.join("\n");
}

export interface AgentScreenerFilters {
  lens?: string;
  sector?: string;
  minTrueFcfMargin?: number;
  maxSbcPct?: number;
  maxImpliedCagr?: number;
  maxDilution?: number;
  minMarketCapB?: number;
  limit?: number;
}

const NUMERIC_SCREEN_FILTERS = [
  "minTrueFcfMargin", "maxSbcPct", "maxImpliedCagr", "maxDilution", "minMarketCapB", "limit",
] as const;

export function parseAgentScreenerFilters(
  read: (key: keyof AgentScreenerFilters) => unknown,
  source: "query" | "json",
): { filters: AgentScreenerFilters } | { error: string } {
  const filters: AgentScreenerFilters = {};
  for (const key of ["lens", "sector"] as const) {
    const value = read(key);
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.trim()) return { error: `Invalid ${key} filter.` };
    filters[key] = value.trim();
  }
  if (filters.lens && !DISCOVERY_LENSES.some(({ id }) => id === filters.lens)) {
    return { error: `Unknown screener lens: ${filters.lens}.` };
  }
  for (const key of NUMERIC_SCREEN_FILTERS) {
    const raw = read(key);
    if (raw === undefined) continue;
    const value = source === "query" && typeof raw === "string" && raw.trim()
      ? Number(raw) : raw;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { error: `The ${key} filter must be a finite number.` };
    }
    if (key === "limit" && (!Number.isInteger(value) || value < 1 || value > 50)) {
      return { error: "Limit must be a whole number between 1 and 50." };
    }
    filters[key] = value;
  }
  return { filters };
}

export function screenCompaniesForAgent(
  entries: readonly SearchIndexEntry[],
  filters: AgentScreenerFilters,
  lensContext?: LensFilterContext,
) {
  let list = [...entries];

  if (filters.lens) {
    const lens = DISCOVERY_LENSES.find((l) => l.id === filters.lens);
    if (lens) {
      list = list.filter((e) => lens.filter(e, lensContext));
    }
  }

  if (filters.sector) {
    const target = filters.sector.trim().toLowerCase();
    list = list.filter(
      (e) =>
        e.sector.toLowerCase() === target || sectorSlug(e.sector) === target
    );
  }

  if (typeof filters.minTrueFcfMargin === "number" && Number.isFinite(filters.minTrueFcfMargin)) {
    list = list.filter(
      (e) => !e.scenarioBasis.equityLensOnly && e.trueFcfMargin >= filters.minTrueFcfMargin!
    );
  }
  if (typeof filters.maxSbcPct === "number" && Number.isFinite(filters.maxSbcPct)) {
    list = list.filter((e) => e.sbcPctRevenue <= filters.maxSbcPct!);
  }
  if (typeof filters.maxImpliedCagr === "number" && Number.isFinite(filters.maxImpliedCagr)) {
    list = list.filter(
      (e) => e.impliedCagr !== null && e.impliedCagr <= filters.maxImpliedCagr!
    );
  }
  if (typeof filters.maxDilution === "number" && Number.isFinite(filters.maxDilution)) {
    list = list.filter((e) => e.netDilutionCagr <= filters.maxDilution!);
  }
  if (typeof filters.minMarketCapB === "number" && Number.isFinite(filters.minMarketCapB)) {
    list = list.filter((e) => e.marketCap >= filters.minMarketCapB! * 1000);
  }

  list.sort((a, b) => b.marketCap - a.marketCap);
  const limit = Math.max(1, Math.min(50, Math.round(filters.limit ?? 20)));

  return {
    total_matches: list.length,
    returned: Math.min(limit, list.length),
    companies: list.slice(0, limit).map((c) => ({
      ticker: c.ticker,
      name: c.name,
      sector: c.sector,
      market_cap_m: Math.round(c.marketCap),
      true_fcf_m: c.scenarioBasis.equityLensOnly ? null : Math.round(c.trueFcf),
      true_fcf_margin_pct: c.scenarioBasis.equityLensOnly ? null : Number(c.trueFcfMargin.toFixed(2)),
      sbc_pct_revenue: Number(c.sbcPctRevenue.toFixed(2)),
      net_dilution_4y_cagr_pct: Number(c.netDilutionCagr.toFixed(2)),
      implied_10y_revenue_cagr_pct:
        c.impliedCagr !== null ? Number(c.impliedCagr.toFixed(2)) : null,
      url: `${SITE_URL}/t/${c.ticker}`,
    })),
  };
}
