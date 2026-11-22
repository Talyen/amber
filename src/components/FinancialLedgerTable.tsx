import {
  type ComputedAnnual,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";

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
      <div className="mb-2.5 flex items-center justify-between">
        <h3
          id="ledger-caption"
          className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]"
        >
          {ticker} Cash Flow &amp; Dilution Ledger (SEC 10-K)
        </h3>
        <span className="text-[11px] text-[var(--text-muted)]">
          All figures in USD · Tabular numerals
        </span>
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
