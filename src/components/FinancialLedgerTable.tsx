"use client";

import { FileSpreadsheet } from "lucide-react";
import {
  type ComputedAnnual,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";
import { exportFinancialLedgerCsv } from "@/lib/export-csv";

interface FinancialLedgerTableProps {
  ticker: string;
  series: ComputedAnnual[];
}

export function FinancialLedgerTable({
  ticker,
  series,
}: FinancialLedgerTableProps) {
  return (
    <div className="mt-5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h3
          id="ledger-caption"
          className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]"
        >
          {ticker} Cash Flow &amp; Dilution Ledger (SEC 10-K / 10-Q)
        </h3>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-[var(--text-muted)] sm:inline">
            USD, Tabular numerals
          </span>
          <button
            type="button"
            onClick={() => exportFinancialLedgerCsv(ticker, series)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-labelledby="ledger-caption"
        className="amber-table-wrapper"
      >
        <table className="amber-table">
          <thead>
            <tr>
              <th scope="col">Fiscal Year</th>
              <th scope="col">Revenue</th>
              <th scope="col">Op. Cash Flow</th>
              <th scope="col">CapEx</th>
              <th scope="col">Reported FCF</th>
              <th scope="col">SBC</th>
              <th scope="col">True FCF</th>
              <th scope="col">True Margin</th>
              <th scope="col">Diluted Shares</th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map((row) => (
              <tr key={row.fiscalYear}>
                <th scope="row" className="font-mono-num">
                  {row.fiscalYear}
                </th>
                <td data-label="Revenue" className="font-mono-num">
                  {formatCurrencyCompact(row.revenue)}
                </td>
                <td data-label="Op. Cash Flow" className="font-mono-num">
                  {formatCurrencyCompact(row.operatingCashFlow)}
                </td>
                <td
                  data-label="CapEx"
                  className="font-mono-num text-[var(--text-secondary)]"
                >
                  {formatCurrencyCompact(-row.capex)}
                </td>
                <td data-label="Reported FCF" className="font-mono-num">
                  {formatCurrencyCompact(row.reportedFcf)}
                </td>
                <td
                  data-label="SBC"
                  className="font-mono-num text-[var(--sbc)]"
                >
                  {formatCurrencyCompact(row.sbc)}
                </td>
                <td
                  data-label="True FCF"
                  className={`font-mono-num font-semibold ${
                    row.trueFcf >= 0
                      ? "text-[var(--amber)]"
                      : "text-[var(--negative)]"
                  }`}
                >
                  {formatCurrencyCompact(row.trueFcf)}
                </td>
                <td
                  data-label="True Margin"
                  className="font-mono-num text-[var(--text-secondary)]"
                >
                  {formatPct(row.trueFcfMargin)}
                </td>
                <td data-label="Diluted Shares" className="font-mono-num">
                  {row.dilutedShares.toLocaleString()}M
                  {row.yoyShareChangePct !== null && (
                    <span
                      className={`ml-1.5 text-[11px] ${
                        row.yoyShareChangePct > 0.5
                          ? "text-[var(--negative)]"
                          : row.yoyShareChangePct < -0.5
                            ? "text-[var(--positive)]"
                            : "text-[var(--text-muted)]"
                      }`}
                    >
                      {formatPct(row.yoyShareChangePct, true)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
