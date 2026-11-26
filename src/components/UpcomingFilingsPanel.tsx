"use client";

import Link from "next/link";
import { CalendarClock, ArrowRight } from "lucide-react";
import type { UpcomingFilingItem } from "@/lib/filing-calendar";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

interface UpcomingFilingsPanelProps {
  items: UpcomingFilingItem[];
  watchlistOnly: boolean;
  compact?: boolean;
  onViewAll?: () => void;
}

function formatExpectedLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "Due now";
  if (daysUntil === 1) return "In 1d";
  return `In ${daysUntil}d`;
}

export function UpcomingFilingsPanel({
  items,
  watchlistOnly,
  compact = false,
  onViewAll,
}: UpcomingFilingsPanelProps) {
  if (items.length === 0) {
    if (compact) return null;
    return (
      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <CalendarClock className="mx-auto h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          {watchlistOnly
            ? "None of your watchlist companies are projected to file a 10-Q or 10-K within the next 30 days."
            : "No projected SEC filings in the next 30 days."}
        </p>
      </section>
    );
  }

  if (compact) {
    const preview = items.slice(0, 6);
    return (
      <section
        aria-label="Upcoming SEC filings"
        className="mt-5 rounded-xl border border-[var(--amber-border)] bg-[var(--amber-soft)]/50 px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
            <CalendarClock className="h-3.5 w-3.5 text-[var(--amber)]" aria-hidden="true" />
            <span>
              Upcoming Filings ({items.length} {watchlistOnly ? "in watchlist" : "expected"} next 30d)
            </span>
          </div>
          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--amber)] hover:underline cursor-pointer"
            >
              View calendar
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {preview.map((item) => (
            <Link
              key={item.ticker}
              href={`/t/${item.ticker}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs transition-colors hover:border-[var(--amber-border)]"
            >
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {item.ticker}
              </span>
              <span className="font-mono-num text-[11px] text-[var(--text-secondary)]">
                ~{item.expectedFilingDate.slice(5)}
              </span>
              <span
                className={`font-mono-num rounded px-1 py-0.5 text-[10px] font-semibold ${
                  item.bucket === "imminent"
                    ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "bg-[var(--surface-subtle)] text-[var(--text-muted)]"
                }`}
              >
                {formatExpectedLabel(item.daysUntil)}
              </span>
            </Link>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6" aria-label="Upcoming SEC filing calendar">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <CalendarClock className="h-4 w-4 text-[var(--amber)]" aria-hidden="true" />
            Upcoming SEC Filing Calendar
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Projected 10-Q / 10-K windows based on each issuer&apos;s ~91-day SEC reporting cadence.
          </p>
        </div>
        <span className="font-mono-num text-xs text-[var(--text-muted)]">
          {items.length} expected in next 30 days
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[600px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[11px] font-medium text-[var(--text-muted)]">
              <th className="px-4 py-2.5">Company</th>
              <th className="px-3 py-2.5">Est. Filing Window</th>
              <th className="px-3 py-2.5">Last Filed</th>
              <th className="px-3 py-2.5 text-right">Mkt Cap</th>
              <th className="px-3 py-2.5 text-right">True FCF %</th>
              <th className="px-4 py-2.5 text-right">Priced-In 10Y</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {items.slice(0, 60).map((item) => (
              <tr
                key={item.ticker}
                className="cv-row transition-colors hover:bg-[var(--surface-subtle)]/60"
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/t/${item.ticker}`}
                    className="inline-flex items-baseline gap-2 hover:text-[var(--amber)]"
                  >
                    <span className="font-mono-num font-semibold text-[var(--amber)]">
                      {item.ticker}
                    </span>
                    <span className="truncate max-w-[200px] text-[var(--text-primary)]">
                      {item.name}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-mono-num text-[var(--text-primary)]">
                    ~{item.expectedFilingDate}
                  </span>
                  <span
                    className={`font-mono-num ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      item.bucket === "imminent"
                        ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                        : "bg-[var(--surface-subtle)] text-[var(--text-muted)]"
                    }`}
                  >
                    {formatExpectedLabel(item.daysUntil)}
                  </span>
                </td>
                <td className="font-mono-num px-3 py-2.5 text-[var(--text-muted)]">
                  {item.lastFilingDate}
                </td>
                <td className="font-mono-num px-3 py-2.5 text-right text-[var(--text-secondary)]">
                  {formatCurrencyCompact(item.marketCap)}
                </td>
                <td className="font-mono-num px-3 py-2.5 text-right text-[var(--text-secondary)]">
                  {formatPct(item.trueFcfMargin)}
                </td>
                <td className="font-mono-num px-4 py-2.5 text-right font-semibold text-[var(--text-primary)]">
                  {item.impliedCagr === null ? "—" : `${formatPct(item.impliedCagr)}/yr`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
