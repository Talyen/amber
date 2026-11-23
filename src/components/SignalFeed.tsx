"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, FileDiff, Flame, Radar, Star, X } from "lucide-react";
import type { SearchIndexEntry } from "@/data/universe";
import type {
  MarketFilingDiffItem,
  MarketInsiderFeedItem,
} from "@/data/repository";
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
  diffs?: MarketFilingDiffItem[];
}

type FeedScope = "watchlist" | "market";
type FeedFilter =
  | "all"
  | "diffs"
  | "headlines"
  | "filings"
  | "insider-buys"
  | "insider-sells";

const QUICK_STAR_TICKERS = ["NVDA", "MSFT", "AAPL", "AMZN", "META", "COST"];

const STARTER_PACKS: Array<{ id: string; label: string; tickers: string[] }> = [
  { id: "mag7", label: "Mag 7", tickers: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"] },
  { id: "ai-semis", label: "AI & Semis", tickers: ["NVDA", "AMD", "AVGO", "TSM", "ASML", "ANET"] },
  { id: "cloud", label: "Cloud & Cyber", tickers: ["CRWD", "PANW", "DDOG", "SNOW", "NET", "NOW"] },
  { id: "compounders", label: "Quality Compounders", tickers: ["COST", "V", "MA", "SPGI", "FICO", "CTAS"] },
];

const CROSS_FILING_THEMES: Array<{
  id: string;
  label: string;
  pattern: RegExp;
}> = [
  {
    id: "tariffs",
    label: "Tariffs & Trade",
    pattern: /\b(tariff|trade war|duties|customs|import|geopolitical|china)\b/i,
  },
  {
    id: "ai-capex",
    label: "AI & CapEx Surge",
    pattern: /\b(artificial intelligence|\bai\b|capex|capital expenditure|data center|infrastructure|gpu|compute)\b/i,
  },
  {
    id: "customer-conc",
    label: "Customer Concentration",
    pattern: /\b(customer concentration|single customer|largest customer|top customer|revenue concentration|accounted for \d+%)\b/i,
  },
  {
    id: "regulatory",
    label: "Export & Regulatory",
    pattern: /\b(export control|antitrust|litigation|regulatory|investigation|doj|ftc|sec inquiry|restatement)\b/i,
  },
  {
    id: "margins",
    label: "Margins & Demand",
    pattern: /\b(margin pressure|pricing pressure|slowdown|decelerat|demand|inventory|impairment|restructuring)\b/i,
  },
  {
    id: "leadership",
    label: "Leadership & Comp",
    pattern: /\b(ceo|cfo|executive|departure|resign|board|compensation|stock-based|sbc|dilution)\b/i,
  },
];

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

export function SignalFeed({ entries, insiders, diffs = [] }: SignalFeedProps) {
  const watchlist = useWatchlist();
  const [scope, setScope] = useState<FeedScope>("market");
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [showAllDiffs, setShowAllDiffs] = useState(false);
  const [headlines, setHeadlines] = useState<HeadlineItem[]>([]);
  const [trending, setTrending] = useState<TrendingTickerItem[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [showAllHeadlines, setShowAllHeadlines] = useState(false);
  const [scopeReady, setScopeReady] = useState(false);
  const autoSelectedRef = useRef(false);

  // Auto-select "My Watchlist" on initial load if the user has starred companies (avoids double-fetch flash)
  useEffect(() => {
    if (!autoSelectedRef.current) {
      try {
        const raw = window.localStorage.getItem("amber-watchlist-v1");
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setScope("watchlist");
          autoSelectedRef.current = true;
        }
      } catch {
        // Ignore storage restrictions
      }
      setScopeReady(true);
    }
  }, []);

  useEffect(() => {
    if (!autoSelectedRef.current && watchlist.tickers.length > 0) {
      setScope("watchlist");
      autoSelectedRef.current = true;
    }
  }, [watchlist.tickers.length]);

  const watchlistOnly = scope === "watchlist";

  const newsQueryUrl = useMemo(() => {
    if (!scopeReady) return null;
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
  }, [scopeReady, selectedTicker, watchlistOnly, watchlist.tickers]);

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

  const visibleHeadlines = showAllHeadlines
    ? headlines
    : headlines.slice(0, 10);

  const leadStories = visibleHeadlines.slice(0, 2);
  const wireStories = visibleHeadlines.slice(2);
  const midPoint = Math.ceil(wireStories.length / 2);
  const wireLeft = wireStories.slice(0, midPoint);
  const wireRight = wireStories.slice(midPoint);

  const scopedDiffs = useMemo(() => {
    return diffs.filter(
      (d) =>
        (!selectedTicker || d.ticker === selectedTicker) &&
        (!watchlistOnly || watchlist.has(d.ticker))
    );
  }, [diffs, watchlistOnly, watchlist, selectedTicker]);

  const themeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const theme of CROSS_FILING_THEMES) {
      const uniqueTickers = new Set<string>();
      for (const d of scopedDiffs) {
        const hay = `${d.headline} ${d.summary} ${d.currentExcerpt} ${d.category}`;
        if (theme.pattern.test(hay)) uniqueTickers.add(d.ticker);
      }
      map.set(theme.id, uniqueTickers.size);
    }
    return map;
  }, [scopedDiffs]);

  const visibleDiffs = useMemo(() => {
    const activeTheme = selectedTheme
      ? CROSS_FILING_THEMES.find((t) => t.id === selectedTheme) ?? null
      : null;
    const filtered = activeTheme
      ? scopedDiffs.filter((d) =>
          activeTheme.pattern.test(
            `${d.headline} ${d.summary} ${d.currentExcerpt} ${d.category}`
          )
        )
      : scopedDiffs;
    return showAllDiffs ? filtered.slice(0, 30) : filtered.slice(0, 6);
  }, [scopedDiffs, selectedTheme, showAllDiffs]);

  const showDiffs = filter === "all" || filter === "diffs";
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
              {watchlistOnly ? "Watchlist Feed" : "Market Feed"}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              SEC filing changes, Form 8-K events, Form 4 insider trades, and headlines.
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
              Follow a preset list or star individual companies to filter filings, 8-Ks, and insider trades.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {STARTER_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => {
                    for (const t of pack.tickers) {
                      if (!watchlist.has(t)) watchlist.toggle(t);
                    }
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3 text-xs font-semibold text-[var(--amber)] transition-opacity hover:opacity-90 cursor-pointer"
                >
                  <Star className="h-3.5 w-3.5" />
                  Follow {pack.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {QUICK_STAR_TICKERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => watchlist.toggle(t)}
                  className="font-mono-num inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
                >
                  <Star className="h-3 w-3 text-[var(--amber)]" />
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
                Or browse All Market
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Filing Topics Filter */}
            {scopedDiffs.length > 0 && (
              <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)] mr-1">
                    <Radar className="h-3.5 w-3.5 text-[var(--amber)]" />
                    Topics:
                  </span>
                  {CROSS_FILING_THEMES.map((theme) => {
                    const count = themeCounts.get(theme.id) ?? 0;
                    if (count === 0) return null;
                    const active = selectedTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => {
                          setSelectedTheme(active ? null : theme.id);
                          setFilter(active ? "all" : "diffs");
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                            : "border border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--amber-border)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <span>{theme.label}</span>
                        <span className="font-mono-num text-[11px] opacity-75">
                          {count}
                        </span>
                        {active && <X className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Content Type Filter Pills */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: "All" },
                  {
                    id: "diffs",
                    label:
                      scopedDiffs.length > 0
                        ? `Filing Changes & 8-Ks (${scopedDiffs.length})`
                        : "Filing Changes & 8-Ks",
                  },
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
                  {
                    id: "headlines",
                    label:
                      headlines.length > 0
                        ? `Headlines (${headlines.length})`
                        : "Headlines",
                  },
                  { id: "filings", label: "Filing Dates" },
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

            {/* Primary Signal Section: SEC Fine-Print Diffs & Form 8-K Events */}
            {showDiffs && visibleDiffs.length > 0 && (
              <section className="mt-6">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileDiff className="h-4 w-4 text-[var(--amber)]" />
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      {selectedTheme
                        ? `Filings Mentioning "${CROSS_FILING_THEMES.find((t) => t.id === selectedTheme)?.label}"`
                        : selectedTicker
                          ? `${selectedTicker} Filing Changes & 8-Ks`
                          : watchlistOnly
                            ? "Watchlist Filing Changes & 8-Ks"
                            : "Recent Filing Changes & 8-Ks"}
                    </h2>
                  </div>
                  <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                    Direct from SEC EDGAR
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {visibleDiffs.map((d) => {
                    const isFollowing = watchlist.has(d.ticker);
                    return (
                      <article
                        key={d.id}
                        className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--amber-border)]"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link
                                href={`/t/${d.ticker}?tab=diffs`}
                                className="font-mono-num text-xs font-bold text-[var(--amber)] hover:underline"
                              >
                                {d.ticker}
                              </Link>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  d.materiality === "High"
                                    ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                                    : "bg-[var(--surface-subtle)] text-[var(--text-secondary)]"
                                }`}
                              >
                                {d.filingType} · {d.materiality}
                              </span>
                              <span className="text-[11px] text-[var(--text-muted)]">
                                {d.category}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => watchlist.toggle(d.ticker)}
                              aria-label={isFollowing ? `Unfollow ${d.ticker}` : `Follow ${d.ticker}`}
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer ${
                                isFollowing
                                  ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                              }`}
                            >
                              <Star
                                className="h-3 w-3"
                                fill={isFollowing ? "currentColor" : "none"}
                              />
                              {isFollowing ? "Following" : "Follow"}
                            </button>
                          </div>

                          <Link
                            href={`/t/${d.ticker}?tab=diffs`}
                            className="mt-2 block group"
                          >
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                              {d.headline}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                              {d.summary}
                            </p>
                          </Link>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-muted)]">
                          <span className="truncate">{d.companyName}</span>
                          <span className="font-mono-num shrink-0">{d.filingDate}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {scopedDiffs.length > 6 && (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowAllDiffs((prev) => !prev)}
                      className="inline-flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
                    >
                      {showAllDiffs
                        ? "Show fewer SEC changes"
                        : `Show more SEC changes (${Math.min(30, scopedDiffs.length) - 6} more)`}
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* Headlines Strip */}
            {showHeadlines && (
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
                  <div className="h-64 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
                ) : headlines.length === 0 ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center text-xs text-[var(--text-secondary)]">
                    No matching Tier-1 or Tier-2 headlines right now for{" "}
                    <span className="font-semibold text-[var(--text-primary)]">
                      {selectedTicker ?? (watchlistOnly ? "your watchlist" : "this view")}
                    </span>
                    .
                  </div>
                ) : (
                  <>
                    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                      {/* Top Row: 2 Side-by-Side Featured Lead Stories */}
                      <div
                        className={`grid grid-cols-1 divide-y divide-[var(--border)] ${
                          leadStories.length > 1
                            ? "lg:grid-cols-2 lg:divide-x lg:divide-y-0"
                            : ""
                        }`}
                      >
                        {leadStories.map((item, idx) => (
                          <div
                            key={item.link}
                            className="group px-4 py-3.5 transition-colors hover:bg-[var(--surface-subtle)]/50 sm:px-5 sm:py-4"
                          >
                            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {idx === 0 && (
                                  <span className="rounded bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--amber)] uppercase">
                                    Top Story
                                  </span>
                                )}
                                <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                                  {item.source || "Financial Wire"}
                                </span>
                                <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                                  {formatRelativeTime(item.pubDate)}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
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
                            </div>

                            <a
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-full items-baseline justify-between gap-2 text-[15.5px] font-semibold leading-snug tracking-[-0.015em] text-[var(--text-primary)] transition-colors group-hover:text-[var(--amber)] sm:text-[16.5px]"
                            >
                              <span>{item.title}</span>
                              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-[var(--text-muted)] group-hover:text-[var(--amber)]" />
                            </a>
                          </div>
                        ))}
                      </div>

                      {/* Below: Balanced 2-Column Editorial News Wire */}
                      {wireStories.length > 0 && (
                        <div
                          className={`grid grid-cols-1 divide-y divide-[var(--border)] border-t border-[var(--border)] ${
                            wireRight.length > 0
                              ? "lg:grid-cols-2 lg:divide-x lg:divide-y-0"
                              : ""
                          }`}
                        >
                          {[wireLeft, wireRight]
                            .filter((col) => col.length > 0)
                            .map((col, colIdx) => (
                              <div
                                key={colIdx}
                                className="divide-y divide-[var(--border)]"
                              >
                                {col.map((item) => (
                                  <div
                                    key={item.link}
                                    className="group flex items-start justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-subtle)]/60 sm:px-5 sm:py-3"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <a
                                        href={item.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-start justify-between gap-2 text-[13px] font-medium leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--amber)] sm:text-[13.5px]"
                                      >
                                        <span>{item.title}</span>
                                        <ArrowUpRight
                                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--amber)]"
                                          aria-hidden="true"
                                        />
                                      </a>
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                                        <span className="font-semibold text-[var(--text-secondary)]">
                                          {item.source || "Financial Wire"}
                                        </span>
                                        <span className="font-mono-num">
                                          {formatRelativeTime(item.pubDate)}
                                        </span>
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
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {headlines.length > 10 && (
                      <div className="mt-3 flex justify-center">
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
                    Est. Next Filing Window
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
        <footer className="mt-14 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)]">
          <p>© {new Date().getFullYear()} Amber. Not investment advice.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-[var(--text-primary)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--text-primary)]">
              Terms
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
