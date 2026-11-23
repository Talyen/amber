"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Flame, Star, X } from "lucide-react";
import type { SearchIndexEntry } from "@/data/universe";
import type { MarketInsiderFeedItem } from "@/data/repository";
import type {
  HeadlineItem,
  TrendingTickerItem,
} from "@/app/api/watchlist-news/route";
import { useWatchlist } from "@/lib/watchlist";
import { TopNav } from "@/components/TopNav";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

interface SignalFeedProps {
  entries: SearchIndexEntry[];
  insiders: MarketInsiderFeedItem[];
}

type FeedScope = "watchlist" | "market";
type FeedFilter =
  | "all"
  | "headlines"
  | "filings"
  | "insider-buys"
  | "insider-sells";

const QUICK_STAR_TICKERS = ["NVDA", "MSFT", "AAPL", "AMZN", "META", "COST"];

function cleanEntity(str: string): string {
  const decoded = str
    .replace(/&amp;/gi, "&")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\/+$/g, "")
    .trim();
  if (!decoded || decoded === "Dir") return "Director";
  if (decoded === "10%") return "10% Owner";
  if (decoded === "Pres") return "President";
  if (
    decoded.length >= 4 &&
    decoded === decoded.toUpperCase() &&
    /[A-Z]/.test(decoded) &&
    !/^(CEO|CFO|COO|CTO|EVP|SVP|VP)$/.test(decoded)
  ) {
    return decoded
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(
        /\b(Ceo|Cfo|Coo|Cto|Evp|Svp|Vp|Iii|Ii)\b/g,
        (m) => m.toUpperCase()
      );
  }
  return decoded;
}

function formatRelativeTime(pubDate: string): string {
  if (!pubDate) return "Recent";
  const ms = Date.parse(pubDate);
  if (!Number.isFinite(ms)) return pubDate.slice(0, 16);
  const diffMin = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.round(diffHr / 24);
  if (diffDays <= 7) return `${diffDays}d ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

export function SignalFeed({ entries, insiders }: SignalFeedProps) {
  const watchlist = useWatchlist();
  const [scope, setScope] = useState<FeedScope>("market");
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [headlines, setHeadlines] = useState<HeadlineItem[]>([]);
  const [trending, setTrending] = useState<TrendingTickerItem[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [showAllHeadlines, setShowAllHeadlines] = useState(false);
  const autoSelectedRef = useRef(false);

  // Auto-select "My Watchlist" on initial load if the user has starred companies
  useEffect(() => {
    if (!autoSelectedRef.current && watchlist.tickers.length > 0) {
      setScope("watchlist");
      autoSelectedRef.current = true;
    }
  }, [watchlist.tickers.length]);

  const watchlistOnly = scope === "watchlist";

  const newsQueryUrl = useMemo(() => {
    if (selectedTicker) {
      return `/api/watchlist-news?tickers=${encodeURIComponent(selectedTicker)}&scope=custom`;
    }
    if (watchlistOnly) {
      if (watchlist.tickers.length === 0) return null;
      return `/api/watchlist-news?tickers=${encodeURIComponent(
        watchlist.tickers.slice(0, 14).join(",")
      )}&scope=watchlist`;
    }
    return `/api/watchlist-news?scope=market`;
  }, [selectedTicker, watchlistOnly, watchlist.tickers]);

  useEffect(() => {
    if (!newsQueryUrl) {
      setHeadlines([]);
      setLoadingNews(false);
      return;
    }
    let active = true;
    setLoadingNews(true);
    fetch(newsQueryUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            items?: HeadlineItem[];
            trending?: TrendingTickerItem[];
          } | null
        ) => {
          if (!active) return;
          if (Array.isArray(data?.items)) {
            setHeadlines(data.items);
          }
          if (Array.isArray(data?.trending) && data.trending.length > 0) {
            setTrending(data.trending);
          }
          setLoadingNews(false);
        }
      )
      .catch(() => {
        if (active) setLoadingNews(false);
      });
    return () => {
      active = false;
    };
  }, [newsQueryUrl]);

  const upcomingEarnings = useMemo(() => {
    const base = selectedTicker
      ? entries.filter((e) => e.ticker === selectedTicker)
      : watchlistOnly
        ? entries.filter((e) => watchlist.has(e.ticker))
        : entries.slice(0, 20);

    return base
      .filter((e) => e.lastFilingDate)
      .map((e) => {
        const last = Date.parse(e.lastFilingDate);
        const estNextMs = Number.isFinite(last)
          ? last + 91 * 86400 * 1000
          : Date.now();
        const estDate = new Date(estNextMs).toISOString().slice(0, 10);
        const daysAway = Math.round((estNextMs - Date.now()) / 86400000);
        return {
          ticker: e.ticker,
          name: cleanEntity(e.name),
          estDate,
          daysAway,
        };
      })
      .filter((x) => x.daysAway >= -5 && x.daysAway <= 75)
      .sort((a, b) => a.daysAway - b.daysAway)
      .slice(0, 6);
  }, [entries, watchlist, watchlistOnly, selectedTicker]);

  const recentFilings = useMemo(
    () =>
      [...entries]
        .filter(
          (e) =>
            e.lastFilingDate &&
            (!selectedTicker || e.ticker === selectedTicker) &&
            (!watchlistOnly || watchlist.has(e.ticker))
        )
        .sort((a, b) => b.lastFilingDate.localeCompare(a.lastFilingDate))
        .slice(0, 30),
    [entries, watchlistOnly, watchlist, selectedTicker]
  );

  const scopedInsiders = useMemo(() => {
    return insiders.filter(
      (i) =>
        (!selectedTicker || i.ticker === selectedTicker) &&
        (!watchlistOnly || watchlist.has(i.ticker))
    );
  }, [insiders, watchlistOnly, watchlist, selectedTicker]);

  const buyCount = useMemo(
    () => scopedInsiders.filter((i) => i.transactionType === "Buy").length,
    [scopedInsiders]
  );
  const sellCount = useMemo(
    () => scopedInsiders.filter((i) => i.transactionType === "Sell").length,
    [scopedInsiders]
  );

  const visibleInsiders = useMemo(() => {
    if (filter === "insider-buys") {
      return scopedInsiders
        .filter((i) => i.transactionType === "Buy")
        .slice(0, 40);
    }
    if (filter === "insider-sells") {
      return scopedInsiders
        .filter((i) => i.transactionType === "Sell")
        .slice(0, 40);
    }
    // In "All" mode, blend up to 12 recent Buys + 12 recent Sells so high-signal purchases are always visible
    const buys = scopedInsiders
      .filter((i) => i.transactionType === "Buy")
      .slice(0, 12);
    const sells = scopedInsiders
      .filter((i) => i.transactionType === "Sell")
      .slice(0, 12);
    return [...buys, ...sells].sort((a, b) =>
      b.filingDate.localeCompare(a.filingDate)
    );
  }, [scopedInsiders, filter]);

  const entryByTicker = useMemo(
    () => new Map(entries.map((e) => [e.ticker, e])),
    [entries]
  );

  const visibleHeadlines = showAllHeadlines
    ? headlines
    : headlines.slice(0, 9);

  const leadStory = visibleHeadlines[0] ?? null;
  const secondaryStories = visibleHeadlines.slice(1, 3);
  const midStories = visibleHeadlines.slice(3, 5);
  const wireStories = visibleHeadlines.slice(5);

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
              Live headlines, trending tickers, SEC filings, and open-market Form 4 insider trades.
            </p>
          </div>

          <div className="inline-flex shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setScope("watchlist");
                setSelectedTicker(null);
              }}
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
              onClick={() => {
                setScope("market");
                setSelectedTicker(null);
              }}
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

        {/* Trending Now Strip (Live Market + Insider Buy + Watchlist Signals) */}
        {!watchlistOnly && trending.length > 0 && (
          <section className="mt-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
            <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
              <Flame className="h-3.5 w-3.5 text-[var(--amber)]" />
              Trending:
            </span>
            {trending.map((item) => {
              const active = selectedTicker === item.ticker;
              return (
                <button
                  key={item.ticker}
                  type="button"
                  onClick={() =>
                    setSelectedTicker(active ? null : item.ticker)
                  }
                  title={item.name}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                      : "border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] hover:border-[var(--amber-border)] hover:text-[var(--amber)]"
                  }`}
                >
                  <span className="font-mono-num font-semibold text-[var(--amber)]">
                    {item.ticker}
                  </span>
                  {active && <X className="h-3 w-3 opacity-75" />}
                </button>
              );
            })}
            {selectedTicker && (
              <Link
                href={`/t/${selectedTicker}`}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--amber)] hover:underline"
              >
                Open {selectedTicker} analysis
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </section>
        )}

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
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: "All" },
                  {
                    id: "headlines",
                    label:
                      headlines.length > 0
                        ? `Headlines (${headlines.length})`
                        : "Headlines",
                  },
                  { id: "filings", label: "Filings" },
                  {
                    id: "insider-buys",
                    label:
                      buyCount > 0
                        ? `Insider Buys (${buyCount})`
                        : "Insider Buys",
                  },
                  {
                    id: "insider-sells",
                    label:
                      sellCount > 0
                        ? `Insider Sales (${sellCount})`
                        : "Insider Sales",
                  },
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

              {selectedTicker && (
                <button
                  type="button"
                  onClick={() => setSelectedTicker(null)}
                  className="ml-1 inline-flex items-center gap-1 rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--amber)] cursor-pointer"
                >
                  Filtered: {selectedTicker}
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Headlines Strip */}
            {showHeadlines && (headlines.length > 0 || loadingNews) && (
              <section className="mt-6">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    {selectedTicker
                      ? `${selectedTicker} Headlines`
                      : watchlistOnly
                        ? "Watchlist Headlines"
                        : "Top Market & Trending Stock Stories"}
                  </h2>
                  <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                    {selectedTicker
                      ? selectedTicker
                      : watchlistOnly
                        ? watchlist.tickers.slice(0, 8).join(", ")
                        : "Multi-Source Financial Wire"}
                  </span>
                </div>

                {loadingNews && headlines.length === 0 ? (
                  <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
                    <div className="h-56 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 lg:col-span-7" />
                    <div className="flex flex-col gap-3.5 lg:col-span-5">
                      <div className="h-26 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" />
                      <div className="h-26 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" />
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Row 1: Front-Page Newspaper Hero (7 cols) + 2 Stacked Featured Stories (5 cols) */}
                    {leadStory && (
                      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
                        {(() => {
                          const primaryTicker = leadStory.tickers?.[0];
                          const companySnap = primaryTicker
                            ? entryByTicker.get(primaryTicker)
                            : undefined;
                          return (
                            <div
                              className={`group flex flex-col justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--amber-border)] sm:p-6 ${
                                secondaryStories.length > 0
                                  ? "lg:col-span-7"
                                  : "lg:col-span-12"
                              }`}
                            >
                              <div>
                                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="rounded bg-[var(--amber-soft)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--amber)] uppercase">
                                      Top Story
                                    </span>
                                    <span className="rounded bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                                      {leadStory.source || "Financial Wire"}
                                    </span>
                                  </div>
                                  <span className="font-mono-num text-xs text-[var(--text-muted)]">
                                    {formatRelativeTime(leadStory.pubDate)}
                                  </span>
                                </div>

                                <a
                                  href={leadStory.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-lg font-semibold leading-[1.32] tracking-[-0.02em] text-[var(--text-primary)] transition-colors group-hover:text-[var(--amber)] sm:text-[21px]"
                                >
                                  {leadStory.title}
                                </a>

                                {companySnap && (
                                  <Link
                                    href={`/t/${companySnap.ticker}`}
                                    className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-xs transition-colors hover:border-[var(--amber-border)]"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono-num font-bold text-[var(--amber)]">
                                        {companySnap.ticker}
                                      </span>
                                      <span className="font-medium text-[var(--text-primary)]">
                                        {cleanEntity(companySnap.name)}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-secondary)]">
                                      <span>
                                        True FCF:{" "}
                                        <strong className="font-mono-num text-[var(--text-primary)]">
                                          {formatCurrencyCompact(
                                            companySnap.trueFcf
                                          )}{" "}
                                          ({formatPct(companySnap.trueFcfMargin)}
                                          )
                                        </strong>
                                      </span>
                                      <span>
                                        Implied 10Y:{" "}
                                        <strong className="font-mono-num text-[var(--amber)]">
                                          {formatPct(companySnap.impliedCagr)}
                                        </strong>
                                      </span>
                                    </div>
                                  </Link>
                                )}
                              </div>

                              <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {(leadStory.tickers ?? []).map((sym) => (
                                    <Link
                                      key={sym}
                                      href={`/t/${sym}`}
                                      className="font-mono-num rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--amber)] transition-colors hover:border-[var(--amber-border)] hover:bg-[var(--amber-soft)]"
                                    >
                                      {sym}
                                    </Link>
                                  ))}
                                </div>
                                <a
                                  href={leadStory.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--amber)]"
                                >
                                  Read article
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            </div>
                          );
                        })()}

                        {secondaryStories.length > 0 && (
                          <div className="flex flex-col gap-3.5 lg:col-span-5">
                            {secondaryStories.map((item) => (
                              <div
                                key={item.link}
                                className="group flex flex-1 flex-col justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--amber-border)]"
                              >
                                <div>
                                  <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <span className="rounded bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                                      {item.source || "Financial Wire"}
                                    </span>
                                    <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                                      {formatRelativeTime(item.pubDate)}
                                    </span>
                                  </div>
                                  <a
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-sm font-semibold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--amber)] sm:text-[15px]"
                                  >
                                    {item.title}
                                  </a>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-0.5">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {(item.tickers ?? []).map((sym) => (
                                      <Link
                                        key={sym}
                                        href={`/t/${sym}`}
                                        className="font-mono-num rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--amber)] transition-colors hover:border-[var(--amber-border)] hover:bg-[var(--amber-soft)]"
                                      >
                                        {sym}
                                      </Link>
                                    ))}
                                  </div>
                                  <a
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Open article"
                                    className="text-[var(--text-muted)] hover:text-[var(--amber)]"
                                  >
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Row 2: 2-Column Mid-Size Feature Pair */}
                    {midStories.length > 0 && (
                      <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                        {midStories.map((item) => (
                          <div
                            key={item.link}
                            className="group flex flex-col justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--amber-border)]"
                          >
                            <div>
                              <div className="mb-1.5 flex items-center justify-between gap-2">
                                <span className="rounded bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                                  {item.source || "Financial Wire"}
                                </span>
                                <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                                  {formatRelativeTime(item.pubDate)}
                                </span>
                              </div>
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-sm font-semibold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--amber)] sm:text-[15px]"
                              >
                                {item.title}
                              </a>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <div className="flex flex-wrap items-center gap-1">
                                {(item.tickers ?? []).map((sym) => (
                                  <Link
                                    key={sym}
                                    href={`/t/${sym}`}
                                    className="font-mono-num rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--amber)] transition-colors hover:border-[var(--amber-border)] hover:bg-[var(--amber-soft)]"
                                  >
                                    {sym}
                                  </Link>
                                ))}
                              </div>
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open article"
                                className="text-[var(--text-muted)] hover:text-[var(--amber)]"
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Row 3+: 2-Column Editorial Wire (Readable Width) */}
                    {wireStories.length > 0 && (
                      <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {wireStories.map((item) => (
                          <div
                            key={item.link}
                            className="group flex flex-col justify-between gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 transition-colors hover:border-[var(--amber-border)]"
                          >
                            <div>
                              <div className="mb-1.5 flex items-center justify-between gap-2">
                                <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                                  {item.source || "Financial Wire"}
                                </span>
                                <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                                  {formatRelativeTime(item.pubDate)}
                                </span>
                              </div>
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-[13.5px] font-medium leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--amber)]"
                              >
                                {item.title}
                              </a>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <div className="flex flex-wrap items-center gap-1">
                                {(item.tickers ?? []).map((sym) => (
                                  <Link
                                    key={sym}
                                    href={`/t/${sym}`}
                                    className="font-mono-num rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--amber)] transition-colors hover:border-[var(--amber-border)] hover:bg-[var(--amber-soft)]"
                                  >
                                    {sym}
                                  </Link>
                                ))}
                              </div>
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open article"
                                className="text-[var(--text-muted)] hover:text-[var(--amber)]"
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {headlines.length > 9 && (
                      <div className="mt-3.5 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowAllHeadlines((v) => !v)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
                        >
                          {showAllHeadlines
                            ? "Show fewer headlines"
                            : `Show all ${headlines.length} headlines`}
                        </button>
                      </div>
                    )}
                  </>
                )}
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
                        No recent SEC filings for this selection yet.
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
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        Insider Trades (Form 4)
                      </h2>
                      <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                        {buyCount} Buys / {sellCount} Sales
                      </span>
                    </div>

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
