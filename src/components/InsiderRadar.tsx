import { formatCurrencyCompact } from "@/lib/finance";

export interface InsiderTradeItem {
  id: string;
  filingDate: string;
  insiderName: string;
  insiderTitle: string;
  transactionType: "Buy" | "Sell";
  shares: number;
  pricePerShare: number;
  totalValue: number; // $M
  accessionNumber: string;
}

interface InsiderRadarProps {
  ticker: string;
  trades: InsiderTradeItem[];
}

export function InsiderRadar({ ticker, trades }: InsiderRadarProps) {
  const totalBuys = trades
    .filter((t) => t.transactionType === "Buy")
    .reduce((s, t) => s + t.totalValue, 0);
  const totalSells = trades
    .filter((t) => t.transactionType === "Sell")
    .reduce((s, t) => s + t.totalValue, 0);
  const netFlow = totalBuys - totalSells;

  return (
    <div className="space-y-5">
      {/* Summary Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs text-[var(--text-muted)]">
            Open-Market Insider Buys (Recent Form 4)
          </div>
          <div className="font-mono-num mt-1.5 text-xl font-semibold text-[var(--positive)]">
            {totalBuys > 0 ? formatCurrencyCompact(totalBuys) : "$0"}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs text-[var(--text-muted)]">
            Open-Market Insider Sales (Recent Form 4)
          </div>
          <div className="font-mono-num mt-1.5 text-xl font-semibold text-[var(--text-primary)]">
            {totalSells > 0 ? formatCurrencyCompact(totalSells) : "$0"}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs text-[var(--text-muted)]">
            Net Insider Flow
          </div>
          <div
            className={`font-mono-num mt-1.5 text-xl font-semibold ${
              netFlow > 0
                ? "text-[var(--positive)]"
                : netFlow < 0
                  ? "text-[var(--sbc)]"
                  : "text-[var(--text-secondary)]"
            }`}
          >
            {netFlow > 0 ? "+" : ""}
            {formatCurrencyCompact(netFlow)}
          </div>
        </div>
      </div>

      {/* Table or Empty State */}
      {trades.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <div className="text-sm font-medium text-[var(--text-primary)]">
            No open-market Form 4 buys or sales cached yet for {ticker}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Amber filters out routine RSU grants/tax-withholding awards and only surfaces open-market SEC Form 4 transactions (Codes P and S) during nightly syncs.
          </p>
        </div>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-label={`${ticker} SEC Form 4 insider transactions`}
          className="amber-table-wrapper"
        >
          <table className="amber-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="!text-left">
                  Insider
                </th>
                <th scope="col">Type</th>
                <th scope="col">Shares</th>
                <th scope="col">Avg Price</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <th scope="row" className="font-mono-num">
                    {t.filingDate}
                  </th>
                  <td data-label="Insider" className="!text-left">
                    <div className="font-medium text-[var(--text-primary)]">
                      {t.insiderName}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {t.insiderTitle}
                    </div>
                  </td>
                  <td data-label="Type">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${
                        t.transactionType === "Buy"
                          ? "bg-[var(--surface-subtle)] text-[var(--positive)]"
                          : "bg-[var(--amber-soft)] text-[var(--sbc)]"
                      }`}
                    >
                      {t.transactionType}
                    </span>
                  </td>
                  <td data-label="Shares" className="font-mono-num">
                    {Math.round(t.shares).toLocaleString()}
                  </td>
                  <td data-label="Avg Price" className="font-mono-num">
                    ${t.pricePerShare.toFixed(2)}
                  </td>
                  <td
                    data-label="Value"
                    className={`font-mono-num font-semibold ${
                      t.transactionType === "Buy"
                        ? "text-[var(--positive)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {formatCurrencyCompact(t.totalValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
