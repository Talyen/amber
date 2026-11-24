"use client";

import Link from "next/link";
import { ArrowRight, FileDiff, Gauge, Star, UserCheck } from "lucide-react";
import type { SearchIndexEntry } from "@/data/search-index";
import type {
  MarketFilingDiffItem,
  MarketInsiderFeedItem,
} from "@/data/repository";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

interface ExploreSignalStripProps {
  entries: SearchIndexEntry[];
  featuredDiff: MarketFilingDiffItem | null;
  featuredInsiderBuy: MarketInsiderFeedItem | null;
  featuredExpectation: SearchIndexEntry | null;
  hasInWatchlist: (ticker: string) => boolean;
  onToggleWatchlist: (ticker: string) => void;
}

export function ExploreSignalStrip({
  entries,
  featuredDiff,
  featuredInsiderBuy,
  featuredExpectation,
  hasInWatchlist,
  onToggleWatchlist,
}: ExploreSignalStripProps) {
  if (!featuredDiff && !featuredInsiderBuy && !featuredExpectation) {
    return null;
  }

  return (
    <section aria-label="Trending filings and insider activity" className="mt-7">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Trending Filings &amp; Insider Activity
        </h2>
        <Link
          href="/feed"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--amber)] hover:underline"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
        {featuredDiff && (
          <div className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--amber-border)]">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--amber)]">
                  <FileDiff className="h-3.5 w-3.5" />
                  {featuredDiff.filingType} Filing
                </span>
                <button
                  type="button"
                  onClick={() => onToggleWatchlist(featuredDiff.ticker)}
                  aria-label={`Follow ${featuredDiff.ticker}`}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer ${
                    hasInWatchlist(featuredDiff.ticker)
                      ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Star
                    className="h-3 w-3"
                    fill={hasInWatchlist(featuredDiff.ticker) ? "currentColor" : "none"}
                  />
                  {hasInWatchlist(featuredDiff.ticker) ? "Following" : "Follow"}
                </button>
              </div>
              <Link
                href={`/t/${featuredDiff.ticker}?tab=diffs`}
                className="mt-2 block group"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono-num font-bold text-[var(--amber)]">
                    {featuredDiff.ticker}
                  </span>
                  <span className="truncate text-[var(--text-muted)]">
                    {featuredDiff.companyName}
                  </span>
                </div>
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                  {featuredDiff.headline}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {featuredDiff.summary}
                </p>
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--text-muted)]">
              <span>{featuredDiff.category}</span>
              <span className="font-mono-num">{featuredDiff.filingDate}</span>
            </div>
          </div>
        )}

        {featuredInsiderBuy && (
          <div className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--amber-border)]">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--positive)]">
                  <UserCheck className="h-3.5 w-3.5" />
                  Insider Buy
                </span>
                <button
                  type="button"
                  onClick={() => onToggleWatchlist(featuredInsiderBuy.ticker)}
                  aria-label={`Follow ${featuredInsiderBuy.ticker}`}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer ${
                    hasInWatchlist(featuredInsiderBuy.ticker)
                      ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Star
                    className="h-3 w-3"
                    fill={hasInWatchlist(featuredInsiderBuy.ticker) ? "currentColor" : "none"}
                  />
                  {hasInWatchlist(featuredInsiderBuy.ticker) ? "Following" : "Follow"}
                </button>
              </div>
              <Link
                href={`/t/${featuredInsiderBuy.ticker}?tab=insiders`}
                className="mt-2 block group"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono-num font-bold text-[var(--amber)]">
                    {featuredInsiderBuy.ticker}
                  </span>
                  <span className="truncate text-[var(--text-muted)]">
                    {entries.find((e) => e.ticker === featuredInsiderBuy.ticker)?.name ??
                      featuredInsiderBuy.ticker}
                  </span>
                </div>
                <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                  {formatCurrencyCompact(featuredInsiderBuy.totalValue)} open-market purchase
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {featuredInsiderBuy.insiderName} ({featuredInsiderBuy.insiderTitle}) bought{" "}
                  {Math.round(featuredInsiderBuy.shares).toLocaleString()} shares at $
                  {featuredInsiderBuy.pricePerShare.toFixed(2)}.
                </p>
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--text-muted)]">
              <span>SEC Form 4 (Code P)</span>
              <span className="font-mono-num">{featuredInsiderBuy.filingDate}</span>
            </div>
          </div>
        )}

        {featuredExpectation && (
          <div className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--amber-border)]">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--amber)]">
                  <Gauge className="h-3.5 w-3.5" />
                  Implied Growth
                </span>
                <button
                  type="button"
                  onClick={() => onToggleWatchlist(featuredExpectation.ticker)}
                  aria-label={`Follow ${featuredExpectation.ticker}`}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer ${
                    hasInWatchlist(featuredExpectation.ticker)
                      ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Star
                    className="h-3 w-3"
                    fill={hasInWatchlist(featuredExpectation.ticker) ? "currentColor" : "none"}
                  />
                  {hasInWatchlist(featuredExpectation.ticker) ? "Following" : "Follow"}
                </button>
              </div>
              <Link
                href={`/t/${featuredExpectation.ticker}?tab=dcf`}
                className="mt-2 block group"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono-num font-bold text-[var(--amber)]">
                    {featuredExpectation.ticker}
                  </span>
                  <span className="truncate text-[var(--text-muted)]">
                    {featuredExpectation.name}
                  </span>
                </div>
                <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                  Pricing in {formatPct(featuredExpectation.impliedCagr)}/yr growth for 10 years
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  At {formatCurrencyCompact(featuredExpectation.marketCap)} market cap, today&apos;s
                  valuation demands sustained decade-long compounding. Stress-test the sliders
                  yourself.
                </p>
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--text-muted)]">
              <span>Interactive Reverse DCF</span>
              <span className="font-mono-num text-[var(--amber)]">Stress-test →</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
