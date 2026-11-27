"use client";

import Link from "next/link";
import { ArrowRight, FileDiff, Star, UserCheck } from "lucide-react";
import type { SearchIndexEntry } from "@/data/search-index";
import type {
  MarketFilingDiffItem,
  MarketInsiderFeedItem,
} from "@/data/repository";
import { formatCurrencyCompact } from "@/lib/finance";
import { formatInsiderName, formatInsiderTitle } from "@/lib/insider-format";

interface ExploreSignalStripProps {
  entries: Pick<SearchIndexEntry, "ticker" | "name">[];
  featuredDiffs: MarketFilingDiffItem[];
  featuredInsiderBuy: MarketInsiderFeedItem | null;
  hasInWatchlist: (ticker: string) => boolean;
  onToggleWatchlist: (ticker: string) => void;
}

export function ExploreSignalStrip({
  entries,
  featuredDiffs,
  featuredInsiderBuy,
  hasInWatchlist,
  onToggleWatchlist,
}: ExploreSignalStripProps) {
  if (featuredDiffs.length === 0 && !featuredInsiderBuy) {
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
        {featuredDiffs.map((diff) => (
          <div
            key={diff.id}
            className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--amber-border)]"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--amber)]">
                  <FileDiff className="h-3.5 w-3.5" />
                  {diff.filingType} Filing
                </span>
                <button
                  type="button"
                  onClick={() => onToggleWatchlist(diff.ticker)}
                  aria-label={`Follow ${diff.ticker}`}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer ${
                    hasInWatchlist(diff.ticker)
                      ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Star
                    className="h-3 w-3"
                    fill={hasInWatchlist(diff.ticker) ? "currentColor" : "none"}
                  />
                  {hasInWatchlist(diff.ticker) ? "Following" : "Follow"}
                </button>
              </div>
              <Link
                href={`/t/${diff.ticker}?tab=diffs`}
                className="mt-2 block group"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono-num font-bold text-[var(--amber)]">
                    {diff.ticker}
                  </span>
                  <span className="truncate text-[var(--text-muted)]">
                    {diff.companyName}
                  </span>
                </div>
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                  {diff.headline}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {diff.summary}
                </p>
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--text-muted)]">
              <span>{diff.category}</span>
              <span className="font-mono-num">{diff.filingDate}</span>
            </div>
          </div>
        ))}

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
                    fill={
                      hasInWatchlist(featuredInsiderBuy.ticker)
                        ? "currentColor"
                        : "none"
                    }
                  />
                  {hasInWatchlist(featuredInsiderBuy.ticker)
                    ? "Following"
                    : "Follow"}
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
                    {entries.find((e) => e.ticker === featuredInsiderBuy.ticker)
                      ?.name ?? featuredInsiderBuy.ticker}
                  </span>
                </div>
                <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                  {formatCurrencyCompact(featuredInsiderBuy.totalValue)}{" "}
                  open-market purchase
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {formatInsiderName(featuredInsiderBuy.insiderName)}
                  {featuredInsiderBuy.insiderTitle
                    ? ` (${formatInsiderTitle(featuredInsiderBuy.insiderTitle)})`
                    : ""}{" "}
                  bought{" "}
                  {Math.round(featuredInsiderBuy.shares).toLocaleString()} shares
                  at ${featuredInsiderBuy.pricePerShare.toFixed(2)}.
                </p>
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--text-muted)]">
              <span>SEC Form 4 (Code P)</span>
              <span className="font-mono-num">
                {featuredInsiderBuy.filingDate}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
