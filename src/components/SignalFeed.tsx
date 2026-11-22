"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  FileText,
  Layers,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { SearchIndexEntry } from "@/data/universe";
import type { MarketInsiderFeedItem } from "@/data/repository";
import { useWatchlist } from "@/lib/watchlist";
import { TopNav } from "@/components/TopNav";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

interface SignalFeedProps {
  entries: SearchIndexEntry[];
  insiders: MarketInsiderFeedItem[];
}

type FeedFilter = "all" | "filings" | "insider-buys" | "insider-sells";

function cleanEntity(str: string): string {
  return str
    .replace(/&amp;/gi, "&")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

export function SignalFeed({ entries, insiders }: SignalFeedProps) {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const watchlist = useWatchlist();

  const recentFilings = useMemo(
    () =>
      [...entries]
        .filter((e) => e.lastFilingDate && (!watchlistOnly || watchlist.has(e.ticker)))
        .sort((a, b) => b.lastFilingDate.localeCompare(a.lastFilingDate))
        .slice(0, 35),
    [entries, watchlistOnly, watchlist]
  );

  const visibleInsiders = useMemo(() => {
    const base = watchlistOnly
      ? insiders.filter((i) => watchlist.has(i.ticker))
      : insiders;
    if (filter === "insider-buys") {
      return base.filter((i) => i.transactionType === "Buy");
    }
    if (filter === "insider-sells") {
      return base.filter((i) => i.transactionType === "Sell");
    }
    return base.slice(0, 20);
  }, [insiders, filter, watchlistOnly, watchlist]);

  const showFilings = filter === "all" || filter === "filings";
  const showInsiders =
    filter === "all" || filter === "insider-buys" || filter === "insider-sells";

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="filings" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <section className="border-b border-[var(--border)] pb-6">
          <div className="font-mono-num inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--amber)]">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            SEC EDGAR STREAM
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
            Filings &amp; Insider Activity
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Nightly 10-K/10-Q filings and Form 4 insider trades. Filter by your Watchlist anytime.
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setWatchlistOnly((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                watchlistOnly
                  ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Star
                className="h-3 w-3"
                fill={watchlistOnly ? "currentColor" : "none"}
              />
              Watchlist
              {watchlist.tickers.length > 0 && (
                <span className="font-mono-num opacity-75">
                  ({watchlist.tickers.length})
                </span>
              )}
            </button>
            {(
              [
                { id: "all", label: "All", icon: Layers },
                { id: "filings", label: "10-K / 10-Q", icon: FileText },
                { id: "insider-buys", label: "Insider Buys", icon: TrendingUp },
                { id: "insider-sells", label: "Insider Sales", icon: TrendingDown },
              ] as const
            ).map((tab) => {
              const active = filter === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                      : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Icon className="h-3 w-3 opacity-80" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </section>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Latest 10-K / 10-Q Filings */}
          {showFilings && (
            <section
              className={showInsiders ? "lg:col-span-7" : "lg:col-span-12"}
            >
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-[var(--amber)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Most Recently Filed 10-K / 10-Q Reports
                </h2>
              </div>

              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                {recentFilings.map((c) => (
                  <Link
                    key={c.ticker}
                    href={`/t/${c.ticker}`}
                    className="group flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-subtle)]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num text-xs font-semibold text-[var(--amber)]">
                          {c.ticker}
                        </span>
                        <span className="truncate text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                          {c.name}
                        </span>
                        <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                          · {c.lastFilingDate}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                        <span>
                          True FCF:{" "}
                          <strong
                            className={`font-mono-num ${
                              c.trueFcf >= 0
                                ? "text-[var(--text-primary)]"
                                : "text-[var(--negative)]"
                            }`}
                          >
                            {formatCurrencyCompact(c.trueFcf)} ({formatPct(c.trueFcfMargin)})
                          </strong>
                        </span>
                        <span>
                          SBC:{" "}
                          <strong className="font-mono-num text-[var(--sbc)]">
                            {formatPct(c.sbcPctRevenue)}
                          </strong>
                        </span>
                        <span>
                          Implied 10Y:{" "}
                          <strong className="font-mono-num text-[var(--text-primary)]">
                            {formatPct(c.impliedCagr)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--amber)]" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Recent Form 4 Insider Activity */}
          {showInsiders && (
            <section
              className={showFilings ? "lg:col-span-5" : "lg:col-span-12"}
            >
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--amber)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Recent Open-Market Form 4 Activity
                </h2>
              </div>

              {visibleInsiders.length === 0 ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-xs text-[var(--text-muted)]">
                  No matching Form 4 transactions in this filter yet.
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  {visibleInsiders.map((t) => (
                    <Link
                      key={t.id}
                      href={`/t/${t.ticker}?tab=insiders`}
                      className="block px-4 py-3 transition-colors hover:bg-[var(--surface-subtle)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num text-xs font-semibold text-[var(--amber)]">
                            {t.ticker}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              t.transactionType === "Buy"
                                ? "bg-[var(--surface-subtle)] text-[var(--positive)]"
                                : "bg-[var(--amber-soft)] text-[var(--sbc)]"
                            }`}
                          >
                            {t.transactionType}
                          </span>
                          <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                            {t.filingDate}
                          </span>
                        </div>
                        <span
                          className={`font-mono-num text-xs font-semibold ${
                            t.transactionType === "Buy"
                              ? "text-[var(--positive)]"
                              : "text-[var(--text-primary)]"
                          }`}
                        >
                          {formatCurrencyCompact(t.totalValue)}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                        {cleanEntity(t.insiderName)} ·{" "}
                        <span className="text-[var(--text-muted)]">
                          {cleanEntity(t.insiderTitle)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
