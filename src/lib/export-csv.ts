import type { ComputedAnnual } from "@/lib/finance";
import type { ComparisonEntry } from "@/lib/compare";

function escapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null>>) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsv).join(","));
  const blob = new Blob([lines.join("\n") + "\n"], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportFinancialLedgerCsv(
  ticker: string,
  series: ComputedAnnual[],
  showFcf = true,
) {
  const headers = [
    "Ticker",
    "Period",
    "Revenue ($M)",
    "Operating Cash Flow ($M)",
    "CapEx ($M)",
    "Reported FCF ($M)",
    "SBC ($M)",
    "True FCF ($M)",
    "True FCF Margin (%)",
    "SBC % Revenue",
    "Buybacks ($M)",
    "Diluted Shares (M)",
    "YoY Share Change (%)",
  ];

  const rows = [...series].reverse().map((r) => [
    ticker,
    r.fiscalYear,
    r.revenue,
    r.operatingCashFlow,
    r.capex,
    showFcf ? r.reportedFcf : null,
    r.sbc,
    showFcf ? r.trueFcf : null,
    showFcf ? Number(r.trueFcfMargin.toFixed(2)) : null,
    Number(r.sbcPctRevenue.toFixed(2)),
    r.buybacks,
    r.dilutedShares,
    r.yoyShareChangePct !== null ? Number(r.yoyShareChangePct.toFixed(2)) : "",
  ]);

  downloadCsv(`amber-${ticker.toLowerCase()}-ledger.csv`, headers, rows);
}

export function exportComparisonCsv(items: ComparisonEntry[]) {
  const headers = [
    "Ticker",
    "Company",
    "Sector",
    "Market Cap ($M)",
    "Revenue ($M)",
    "Reported FCF ($M)",
    "SBC ($M)",
    "True FCF ($M)",
    "True FCF Margin (%)",
    "SBC % Revenue",
    "Net Dilution 4Y CAGR (%)",
    "Implied 10Y Rev CAGR (%)",
  ];

  const rows = items.map((i) => [
    i.ticker,
    i.name,
    i.sector,
    i.marketCap,
    i.revenue,
    i.reportedFcf,
    i.sbc,
    i.trueFcf,
    i.trueFcfMargin,
    i.sbcPctRevenue,
    i.netDilutionCagr,
    i.impliedCagr,
  ]);

  downloadCsv(
    `amber-compare-${items.map((i) => i.ticker.toLowerCase()).join("-")}.csv`,
    headers,
    rows
  );
}
