"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Star } from "lucide-react";
import type { SearchIndexEntry } from "@/data/universe";
import type { MarketInsiderFeedItem } from "@/data/repository";
import { useWatchlist } from "@/lib/watchlist";
import { TopNav } from "@/components/TopNav";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

interface SignalFeedProps {
  entries: SearchIndexEntry[];
  insiders: MarketInsiderFeedItem[];
}

type FeedScope = "watchlist" | "market";
type FeedFilter = "all" | "headlines" | "filings" | "insider-buys" | "insider-sells";

const QUICK_STAR_TICKERS = ["NVDA", "MSFT", "AAPL", "AMZN", "META", "COST"];

function cleanEntity(str: string): string {
  const decoded = str
    .replace(/&amp;/gi, "&")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\/+$/g, "")
    .trim();
  if (
    decoded.length >= 4 &&
    decoded === decoded.toUpperCase() &&
    /[A-Z]/.test(decoded)
  ) {
    return decoded
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/\b(Ceo|Cfo|Coo|Cto|Evp|Svp|Vp|Iii|Ii)\b/g, (m) => m.toUpperCase());
  }
  return decoded;
}

export function SignalFeed({ entries, insiders }: SignalFeedProps) {
  const watchlist = useWatchlist();
  const [scope, setScope] = useState<FeedScope>("market");
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [headlines, setHeadlines] = useState<
    Array<{ title: string; link: string; pubDate: string }>
  >([]);
  const autoSelectedRef = useRef(false);

  // Auto-select "My Watchlist" on initial load if the user has starred companies
  useEffect(() => {
    if (!autoSelectedRef.current && watchlist.tickers.length > 0) {
      setScope("watchlist");
      autoSelectedRef.current = true;
    }
  }, [watchlist.tickers.length]);

  const watchlistOnly = scope === "watchlist";

  const newsKey =
    watchlistOnly && watchlist.tickers.length > 0
      ? watchlist.tickers.slice(0, 8).join(",")
      : "NVDA,MSFT,AAPL,AMZN,META,GOOGL";

  useEffect(() => {
    if (watchlistOnly && watchlist.tickers.length === 0) {
      setHeadlines([]);
      return;
    }
    let active = true;
    fetch(`/api/watchlist-news?tickers=${encodeURIComponent(newsKey)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            items?: Array<{ title: string; link: string; pubDate: string }>;
          } | null
        ) => {
          if (active && Array.isArray(data?.items)) {
            setHeadlines(data.items.slice(0, 6));
          }
        }
      )
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [newsKey, watchlistOnly, watchlist.tickers.length]);

  const upcomingEarnings = useMemo(() => {
    const base = watchlistOnly
      ? entries.filter((e) => watchlist.has(e.ticker))
      : entries.slice(0, 14);

    return base
      .filter((e) => e.lastFilingDate)
      .map((e) => {
        const last = Date.parse(e.lastFilingDate);
        const estNextMs = Number.isFinite(last)
          ? last + 91 * 86400 * 1000
          : Date.now();
        const estDate = new Date(estNextMs).toISOString().slice(0, 10);
        const daysAway = Math.round((estNextMs - Date.now()) / 86400000);
        return { ticker: e.ticker, name: cleanEntity(e.name), estDate, daysAway };
      })
      .filter((x) => x.daysAway >= -5 && x.daysAway <= 75)
      .sort((a, b) => a.daysAway - b.daysAway)
      .slice(0, 6);
  }, [entries, watchlist, watchlistOnly]);

  const recentFilings = useMemo(
    () =>
      [...entries]
        .filter(
          (e) =>
            e.lastFilingDate && (!watchlistOnly || watchlist.has(e.ticker))
        )
        .sort((a, b) => b.lastFilingDate.localeCompare(a.lastFilingDate))
        .slice(0, 30),
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

  const showHeadlines = filter === "all" || filter === "headlines";
  const showFilings = filter === "all" || filter === "filings";
  const showInsiders =
    filter === "all" || filter === "insider-buys" || filter === "insider-sells";

  const isEmptyWatchlist = watchlistOnly && watchlist.tickers.length === 0;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="feed" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        {/* Header + Primary Watchlist vs Market Toggle */}
        <section className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
              {watchlistOnly ? "Your Feed" : "Market Feed"}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Headlines, upcoming earnings, SEC filings, and insider trades in one stream.
            </p>
          </div>

          <div className="inline-flex shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setScope("watchlist")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                watchlistOnly
                  ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Star
                className="h-3.5 w-3.5"
                fill={watchlistOnly ? "currentColor" : "none"}
              />
              My Watchlist
              {watchlist.tickers.length > 0 && (
                <span className="font-mono-num opacity-75">
                  ({watchlist.tickers.length})
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setScope("market")}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                !watchlistOnly
                  ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              All Market
            </button>
          </div>
        </section>

        {/* Empty Watchlist Quick-Start */}
        {isEmptyWatchlist ? (
          <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-7 text-center">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Your watchlist is empty
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Star a few companies below to tailor headlines, filings, and insider alerts to what you follow.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {QUICK_STAR_TICKERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => watchlist.toggle(t)}
                  className="font-mono-num inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
                >
                  <Star className="h-3.5 w-3.5 text-[var(--amber)]" />
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setScope("market")}
                className="text-xs font-medium text-[var(--amber)] hover:underline cursor-pointer"
              >
                Or browse All Market activity
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Content Type Filter Pills */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "headlines", label: "Headlines" },
                  { id: "filings", label: "Filings" },
                  { id: "insider-buys", label: "Insider Buys" },
                  { id: "insider-sells", label: "Insider Sales" },
                ] as const
              ).map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                        : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Headlines Strip */}
            {showHeadlines && headlines.length > 0 && (
              <section className="mt-6">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Headlines
                  </h2>
                  <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                    {watchlistOnly
                      ? watchlist.tickers.slice(0, 6).join(", ")
                      : "Trending Market Leaders"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {headlines.map((item) => (
                    <a
                      key={item.link}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex flex-col justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 transition-colors hover:border-[var(--amber-border)]"
                    >
                      <div className="line-clamp-2 text-xs font-medium leading-snug text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                        {item.title}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                        <span className="font-mono-num">
                          {item.pubDate ? item.pubDate.slice(0, 16) : "Recent"}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 opacity-70 group-hover:text-[var(--amber)]" />
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming Earnings Strip */}
            {filter === "all" && upcomingEarnings.length > 0 && (
              <section className="mt-6">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Upcoming Earnings (Est.)
                  </h2>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Quarterly SEC cadence
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                  {upcomingEarnings.map((item) => (
                    <Link
                      key={item.ticker}
                      href={`/t/${item.ticker}`}
                      className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors hover:border-[var(--amber-border)]"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono-num text-xs font-bold text-[var(--amber)]">
                          {item.ticker}
                        </span>
                        <span className="font-mono-num text-[10px] text-[var(--text-muted)]">
                          {item.daysAway <= 0 ? "Soon" : `~${item.daysAway}d`}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                        {item.name}
                      </div>
                      <div className="font-mono-num mt-1 text-[10px] text-[var(--text-muted)]">
                        {item.estDate}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Filings & Insider Activity Grid */}
            {(showFilings || showInsiders) && (
              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
                {showFilings && (
                  <section
                    className={showInsiders ? "lg:col-span-7" : "lg:col-span-12"}
                  >
                    <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
                      Recent SEC Filings
                    </h2>

                    {recentFilings.length === 0 ? (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-xs text-[var(--text-muted)]">
                        No recent SEC filings for your watchlist yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                        {recentFilings.map((c) => (
                          <Link
                            key={c.ticker}
                            href={`/t/${c.ticker}`}
                            className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-subtle)]"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono-num text-xs font-semibold text-[var(--amber)]">
                                  {c.ticker}
                                </span>
                                <span className="truncate text-xs font-medium text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                                  {cleanEntity(c.name)}
                                </span>
                                <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                                  {c.lastFilingDate}
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
                                    {formatCurrencyCompact(c.trueFcf)} (
                                    {formatPct(c.trueFcfMargin)})
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
                    )}
                  </section>
                )}

                {showInsiders && (
                  <section
                    className={showFilings ? "lg:col-span-5" : "lg:col-span-12"}
                  >
                    <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
                      Insider Trades (Form 4)
                    </h2>

                    {visibleInsiders.length === 0 ? (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-xs text-[var(--text-muted)]">
                        No matching Form 4 trades in this view yet.
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
                              {cleanEntity(t.insiderName)}{" "}
                              <span className="text-[var(--text-muted)]">
                                ({cleanEntity(t.insiderTitle)})
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
