import {
  type CompanySnapshot,
  type ComputedAnnual,
  computeEnterpriseValue,
  computeNetDilutionCagr,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";
import type { SearchIndexEntry } from "@/data/universe";
import { SITE_URL } from "@/lib/site";

export function buildTickerMarkdown(
  company: CompanySnapshot,
  series: ComputedAnnual[],
  impliedCagr: number,
  siteOrigin = SITE_URL
): string {
  const latest = series[series.length - 1];
  const ev = computeEnterpriseValue(company);
  const dilution = computeNetDilutionCagr(company.annuals);

  const lines = [
    `### ${company.name} (${company.ticker}): Fundamental Snapshot`,
    "",
    `- **Price / Market Cap / EV:** $${company.price.toFixed(2)} | ${formatCurrencyCompact(company.marketCap)} Mkt Cap | ${formatCurrencyCompact(ev)} EV`,
    `- **True Free Cash Flow (${latest.fiscalYear}):** **${formatCurrencyCompact(latest.trueFcf)}** (${formatPct(latest.trueFcfMargin)} margin) vs. ${formatCurrencyCompact(latest.reportedFcf)} Reported FCF`,
    `- **Stock-Based Comp (SBC):** ${formatCurrencyCompact(latest.sbc)} (${formatPct(latest.sbcPctRevenue)} of rev | ${formatPct(latest.sbcPctReportedFcf, false, 0)} of Reported FCF)`,
    `- **Net Share Dilution (4Y CAGR):** ${formatPct(dilution, true)} (${latest.dilutedShares.toLocaleString()}M diluted shares)`,
    `- **Market-Implied 10Y Revenue CAGR:** ${formatPct(impliedCagr)}/yr`,
    "",
    "| Period | Revenue | Reported FCF | SBC | True FCF | True Margin | Shares (M) |",
    "| :--- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...[...series].reverse().map(
      (r) =>
        `| ${r.fiscalYear} | ${formatCurrencyCompact(r.revenue)} | ${formatCurrencyCompact(r.reportedFcf)} | ${formatCurrencyCompact(r.sbc)} | **${formatCurrencyCompact(r.trueFcf)}** | ${formatPct(r.trueFcfMargin)} | ${r.dilutedShares.toLocaleString()}M |`
    ),
    "",
    `*Source: SEC EDGAR ${company.lastFiling.type} (${company.lastFiling.date}) | Interactive model on [Amber](${siteOrigin}/t/${company.ticker})*`,
  ];

  return lines.join("\n");
}

export function buildComparisonMarkdown(
  items: SearchIndexEntry[],
  siteOrigin = SITE_URL
): string {
  if (items.length === 0) return "";
  const title = items.map((i) => i.ticker).join(" vs. ");
  const slug =
    items.length === 2
      ? `${siteOrigin}/compare/${items[0].ticker}-vs-${items[1].ticker}`
      : `${siteOrigin}/compare?t=${items.map((i) => i.ticker).join(",")}`;

  const lines = [
    `### ${title}: True FCF, SBC & Valuation Comparison`,
    "",
    "| Metric | " + items.map((i) => `**${i.ticker}**`).join(" | ") + " |",
    "| :--- | " + items.map(() => "---:").join(" | ") + " |",
    "| Market Cap | " + items.map((i) => formatCurrencyCompact(i.marketCap)).join(" | ") + " |",
    "| Revenue | " + items.map((i) => formatCurrencyCompact(i.revenue)).join(" | ") + " |",
    "| Reported FCF | " + items.map((i) => formatCurrencyCompact(i.reportedFcf)).join(" | ") + " |",
    "| Stock-Based Comp | " + items.map((i) => formatCurrencyCompact(i.sbc)).join(" | ") + " |",
    "| **True FCF (FCF − SBC)** | " + items.map((i) => `**${formatCurrencyCompact(i.trueFcf)}**`).join(" | ") + " |",
    "| True FCF Margin | " + items.map((i) => formatPct(i.trueFcfMargin)).join(" | ") + " |",
    "| SBC % of Revenue | " + items.map((i) => formatPct(i.sbcPctRevenue)).join(" | ") + " |",
    "| Net Dilution (4Y) | " + items.map((i) => formatPct(i.netDilutionCagr, true)).join(" | ") + " |",
    "| **Implied 10Y Rev CAGR** | " + items.map((i) => `**${formatPct(i.impliedCagr)}**`).join(" | ") + " |",
    "",
    `*Source: SEC EDGAR XBRL | Interactive comparison on [Amber](${slug})*`,
  ];

  return lines.join("\n");
}
