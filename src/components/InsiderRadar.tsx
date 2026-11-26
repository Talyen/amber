"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from "lucide-react";
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

function formatInsiderName(raw: string): string {
  const cleaned = raw
    .replace(/&amp;/gi, "&")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .trim();
  if (cleaned === cleaned.toUpperCase() && cleaned.length > 3) {
    return cleaned
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return cleaned;
}

function formatInsiderTitle(raw: string): string {
  const cleaned = raw
    .replace(/&amp;/gi, "&")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/See Remarks below\.?/i, "Executive Officer")
    .trim();
  if (!cleaned || cleaned === "Dir") return "Director";
  return cleaned
    .replace(/\bDir\b/g, "Director")
    .replace(/\bPres\b/g, "President")
    .replace(/\bTreas\b/g, "Treasurer")
    .replace(/\bSec\b/g, "Secretary");
}

export function InsiderRadar({ ticker, trades }: InsiderRadarProps) {
  const [typeFilter, setTypeFilter] = useState<"all" | "Buy" | "Sell">("all");

  const buyTrades = trades.filter((t) => t.transactionType === "Buy");
  const sellTrades = trades.filter((t) => t.transactionType === "Sell");
  const totalBuys = buyTrades.reduce((s, t) => s + t.totalValue, 0);
  const totalSells = sellTrades.reduce((s, t) => s + t.totalValue, 0);
  const netFlow = totalBuys - totalSells;

  const visibleTrades =
    typeFilter === "all"
      ? trades
      : trades.filter((t) => t.transactionType === typeFilter);

  return (
    <div className="space-y-5">
      {/* Summary Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <ArrowUpRight className="h-3.5 w-3.5 text-[var(--positive)]" aria-hidden="true" />
            Buys
          </div>
          <div className="font-mono-num mt-1.5 text-xl font-semibold text-[var(--positive)]">
            {totalBuys > 0 ? formatCurrencyCompact(totalBuys) : "$0"}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <ArrowDownRight className="h-3.5 w-3.5 text-[var(--sbc)]" aria-hidden="true" />
            Sales
          </div>
          <div className="font-mono-num mt-1.5 text-xl font-semibold text-[var(--text-primary)]">
            {totalSells > 0 ? formatCurrencyCompact(totalSells) : "$0"}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <ArrowLeftRight className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
            Net Flow
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

      {/* Buy / Sell Filter Bar */}
      {trades.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "all", label: "All", count: trades.length },
              { id: "Buy", label: "Buys", count: buyTrades.length },
              { id: "Sell", label: "Sales", count: sellTrades.length },
            ] as const
          ).map((pill) => {
            const active = typeFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setTypeFilter(pill.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {pill.label}
                <span className="font-mono-num ml-1.5 opacity-70">
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Table or Empty State */}
      {visibleTrades.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <div className="text-sm font-medium text-[var(--text-primary)]">
            {trades.length === 0
              ? `No recent open-market Form 4 filings for ${ticker}`
              : `No ${typeFilter === "Buy" ? "open-market purchases" : "open-market sales"} recorded for ${ticker}`}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Amber excludes routine RSU grants and tax-withholding awards, surfacing only open-market SEC Form 4 purchases (Code P) and sales (Code S).
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
              {visibleTrades.map((t) => (
                <tr key={t.id}>
                  <th scope="row" className="font-mono-num">
                    {t.filingDate}
                  </th>
                  <td data-label="Insider" className="!text-left">
                    <div className="text-right sm:text-left">
                      <div className="font-medium text-[var(--text-primary)]">
                        {formatInsiderName(t.insiderName)}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {formatInsiderTitle(t.insiderTitle)}
                      </div>
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
