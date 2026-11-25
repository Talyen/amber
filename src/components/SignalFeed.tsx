"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  FileDiff,
  Flame,
  Radar,
  Star,
  UserCheck,
  X,
} from "lucide-react";
import type { SearchIndexEntry } from "@/data/search-index";
import type {
  MarketFilingDiffItem,
  MarketInsiderFeedItem,
} from "@/data/repository";
import type {
  HeadlineItem,
  TrendingTickerItem,
} from "@/app/api/watchlist-news/route";
import { selectFeaturedSignals } from "@/lib/featured-signals";
import { useWatchlist } from "@/lib/watchlist";
import { TopNav } from "@/components/TopNav";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

interface SignalFeedProps {
  entries: SearchIndexEntry[];
  insiders: MarketInsiderFeedItem[];
  diffs?: MarketFilingDiffItem[];
  initialTrending?: TrendingTickerItem[];
  initialHeadlines?: HeadlineItem[];
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
    .replace(/&apos;|&#39;/g, "'")
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

function formatEditionDate(nowMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(nowMs));
}

export function SignalFeed({
  entries,
  insiders,
  diffs = [],
  initialTrending = [],
  initialHeadlines = [],
}: SignalFeedProps) {
  const watchlist = useWatchlist();
  const [scope, setScope] = useState<FeedScope | null>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [showAllDiffs, setShowAllDiffs] = useState(false);
  const [news, setNews] = useState<{ url: string; items: HeadlineItem[] } | null>(() =>
    initialHeadlines.length > 0
      ? { url: "/api/watchlist-news?scope=market", items: initialHeadlines }
      : null
  );
  const [trending, setTrending] = useState<TrendingTickerItem[]>(initialTrending);
  const [showAllHeadlines, setShowAllHeadlines] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const hasWatchlist = watchlist.tickers.length > 0;
  const watchlistOnly = scope === "watchlist" || (scope === null && hasWatchlist);

  const entryByTicker = useMemo(
    () => new Map(entries.map((e) => [e.ticker, e])),
    [entries]
  );

  const newsQueryUrl = useMemo(() => {
    if (!watchlist.ready) return null;
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
  }, [watchlist.ready, selectedTicker, watchlistOnly, watchlist.tickers]);

  const headlines =
    news?.url === newsQueryUrl
      ? news.items
      : newsQueryUrl === null && !watchlistOnly && !selectedTicker
        ? initialHeadlines
        : [];
  const loadingNews =
    newsQueryUrl !== null &&
    news?.url !== newsQueryUrl &&
    !(newsQueryUrl === "/api/watchlist-news?scope=market" && initialHeadlines.length > 0);

  useEffect(() => {
    if (!newsQueryUrl) return;
    if (news?.url === newsQueryUrl) return;
    const controller = new AbortController();
    fetch(newsQueryUrl, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            items?: HeadlineItem[];
            trending?: TrendingTickerItem[];
          } | null
        ) => {
          if (controller.signal.aborted) return;
          setNews({ url: newsQueryUrl, items: Array.isArray(data?.items) ? data.items : [] });
          if (Array.isArray(data?.trending) && data.trending.length > 0) {
            setTrending(data.trending);
          }
        }
      )
      .catch(() => {
        if (!controller.signal.aborted) setNews({ url: newsQueryUrl, items: [] });
      });
    return () => {
      controller.abort();
    };
  }, [newsQueryUrl, news?.url]);

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
          : nowMs;
        const estDate = new Date(estNextMs).toISOString().slice(0, 10);
        const daysAway = Math.round((estNextMs - nowMs) / 86400000);
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
  }, [entries, watchlist, watchlistOnly, selectedTicker, nowMs]);

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
        .slice(0, 24),
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
    const buys = scopedInsiders
      .filter((i) => i.transactionType === "Buy")
      .slice(0, 10);
    const sells = scopedInsiders
      .filter((i) => i.transactionType === "Sell")
      .slice(0, 10);
    return [...buys, ...sells].sort((a, b) =>
      b.filingDate.localeCompare(a.filingDate)
    );
  }, [scopedInsiders, filter]);

  const scopedDiffs = useMemo(() => {
    return diffs.filter(
      (d) =>
        (!selectedTicker || d.ticker === selectedTicker) &&
        (!watchlistOnly || watchlist.has(d.ticker))
    );
  }, [diffs, watchlistOnly, watchlist, selectedTicker]);

  const trendingSyms = useMemo(() => trending.map((t) => t.ticker), [trending]);

  const { featuredDiffs: briefDiffs, featuredInsiderBuy: briefInsiderBuy } =
    useMemo(
      () =>
        selectFeaturedSignals({
          diffs: scopedDiffs,
          insiders: scopedInsiders,
          entries,
          trendingTickers: trendingSyms,
        }),
      [scopedDiffs, scopedInsiders, entries, trendingSyms]
    );

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

  // Newspaper hierarchy: 1 Hero Lead + 2 Secondary Stories + 2-column Wire
  const heroStory = headlines[0] ?? null;
  const secondaryStories = headlines.slice(1, 3);
  const wirePool = showAllHeadlines
    ? headlines.slice(3)
    : headlines.slice(3, 13);
  const wireMid = Math.ceil(wirePool.length / 2);
  const wireLeft = wirePool.slice(0, wireMid);
  const wireRight = wirePool.slice(wireMid);

  const heroPrimaryTicker = heroStory?.tickers?.[0];
  const heroCompany = heroPrimaryTicker
    ? entryByTicker.get(heroPrimaryTicker) ?? null
    : null;

  const showFrontPage = filter === "all" || filter === "headlines";
  const showWire = (filter === "all" || filter === "headlines") && wirePool.length > 0;
  const showDiffs = filter === "all" || filter === "diffs";
  const showFilings = filter === "all" || filter === "filings";
  const showInsiders =
    filter === "all" || filter === "insider-buys" || filter === "insider-sells";

  const isEmptyWatchlist = watchlistOnly && watchlist.tickers.length === 0;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="feed" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        {/* Editorial Masthead */}
        <header className="border-b-2 border-[var(--border-strong)] pb-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="font-mono-num flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                <span>{formatEditionDate(nowMs)}</span>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--amber)]">
                  {watchlistOnly ? "Watchlist Edition" : "Market Edition"}
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)] sm:text-3xl">
                The Feed
              </h1>
            </div>

            <div className="inline-flex shrink-0 self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs sm:self-auto">
              <button
                type="button"
                aria-pressed={watchlistOnly}
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
                aria-pressed={!watchlistOnly}
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
          </div>

          {/* Slim Inline Trending Ticker Strip */}
          {!watchlistOnly && trending.length > 0 && (
            <div className="mt-3.5 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 border-t border-[var(--border)] pt-3">
              <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                <Flame className="h-3 w-3 text-[var(--amber)]" />
                Trending
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
                    className={`font-mono-num inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                      active
                        ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--amber)]"
                    }`}
                  >
                    <span>{item.ticker}</span>
                    {active && <X className="h-3 w-3 opacity-80" />}
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
            </div>
          )}
        </header>

        {/* Empty Watchlist Quick-Start */}
        {isEmptyWatchlist ? (
          <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Build your morning briefing
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Follow a starter pack or individual companies to personalize headlines, SEC filings, and Form 4 trades.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {STARTER_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  disabled={!watchlist.canEdit}
                  onClick={() => {
                    for (const t of pack.tickers) {
                      if (!watchlist.has(t)) watchlist.toggle(t);
                    }
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3 text-xs font-semibold text-[var(--amber)] transition-opacity hover:opacity-90 cursor-pointer disabled:cursor-wait"
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
                  disabled={!watchlist.canEdit}
                  onClick={() => watchlist.toggle(t)}
                  className="font-mono-num inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer disabled:cursor-wait"
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
                Or read the All Market edition
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* FRONT PAGE: Asymmetric Broadsheet Above the Fold */}
            {showFrontPage && (
              <section
                aria-label="Front page lead stories"
                className="mt-6 grid grid-cols-1 gap-6 border-b border-[var(--border)] pb-7 lg:grid-cols-12 lg:gap-0 lg:divide-x lg:divide-[var(--border)]"
              >
                {/* Left 8 Columns: Hero Lead Story + 2 Secondary Stories */}
                <div className="lg:col-span-8 lg:pr-7">
                  {loadingNews && headlines.length === 0 ? (
                    <div className="space-y-4">
                      <div className="h-44 animate-pulse rounded-lg bg-[var(--surface)]" />
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="h-24 animate-pulse rounded-lg bg-[var(--surface)]" />
                        <div className="h-24 animate-pulse rounded-lg bg-[var(--surface)]" />
                      </div>
                    </div>
                  ) : !heroStory ? (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center text-xs text-[var(--text-secondary)]">
                      No matching Tier-1 or Tier-2 headlines right now for{" "}
                      <span className="font-semibold text-[var(--text-primary)]">
                        {selectedTicker ?? (watchlistOnly ? "your watchlist" : "this view")}
                      </span>
                      .
                    </div>
                  ) : (
                    <>
                      {/* HERO LEAD STORY */}
                      <article className="group pb-6">
                        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.08em] text-[var(--amber)]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
                              Lead Story
                            </span>
                            <span className="text-[var(--border-strong)]" aria-hidden="true">
                              |
                            </span>
                            <span className="font-semibold text-[var(--text-secondary)]">
                              {heroStory.source || "Financial Wire"}
                            </span>
                            <span className="font-mono-num text-[var(--text-muted)]">
                              {formatRelativeTime(heroStory.pubDate)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {(heroStory.tickers ?? []).map((sym) => (
                              <Link
                                key={sym}
                                href={`/t/${sym}`}
                                className="font-mono-num rounded border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--amber)] transition-opacity hover:opacity-85"
                              >
                                {sym}
                              </Link>
                            ))}
                          </div>
                        </div>

                        <a
                          href={heroStory.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <h2 className="text-2xl font-bold leading-[1.16] tracking-[-0.028em] text-[var(--text-primary)] transition-colors group-hover:text-[var(--amber)] sm:text-[31px]">
                            {heroStory.title}
                            <ArrowUpRight className="ml-1.5 inline-block h-5 w-5 -translate-y-0.5 text-[var(--text-muted)] transition-colors group-hover:text-[var(--amber)]" />
                          </h2>
                        </a>

                        {/* Amber Fundamental Context Strip for the Lead Company */}
                        {heroCompany && (
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-xs">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--text-secondary)]">
                              <span className="font-semibold text-[var(--text-primary)]">
                                {cleanEntity(heroCompany.name)}
                              </span>
                              <span>
                                Mkt Cap{" "}
                                <strong className="font-mono-num text-[var(--text-primary)]">
                                  {formatCurrencyCompact(heroCompany.marketCap)}
                                </strong>
                              </span>
                              <span>
                                True FCF %{" "}
                                <strong className="font-mono-num text-[var(--text-primary)]">
                                  {formatPct(heroCompany.trueFcfMargin)}
                                </strong>
                              </span>
                              <span>
                                Priced-In Growth{" "}
                                <strong className="font-mono-num text-[var(--text-primary)]">
                                  {formatPct(heroCompany.impliedCagr)}
                                </strong>
                              </span>
                            </div>
                            <Link
                              href={`/t/${heroCompany.ticker}`}
                              className="inline-flex items-center gap-1 font-semibold text-[var(--amber)] hover:underline"
                            >
                              Open {heroCompany.ticker}
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        )}
                      </article>

                      {/* 2 SECONDARY STORIES */}
                      {secondaryStories.length > 0 && (
                        <div className="grid grid-cols-1 gap-5 border-t border-[var(--border)] pt-5 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-[var(--border)]">
                          {secondaryStories.map((item, idx) => (
                            <article
                              key={item.link}
                              className={`group flex flex-col justify-between ${
                                idx === 0 ? "sm:pr-5" : "sm:pl-5"
                              }`}
                            >
                              <div>
                                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                  <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                                    <span className="font-semibold text-[var(--text-secondary)]">
                                      {item.source || "Financial Wire"}
                                    </span>
                                    <span className="font-mono-num">
                                      {formatRelativeTime(item.pubDate)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {(item.tickers ?? []).map((sym) => (
                                      <Link
                                        key={sym}
                                        href={`/t/${sym}`}
                                        className="font-mono-num rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--amber)] hover:border-[var(--amber-border)] hover:bg-[var(--amber-soft)]"
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
                                  className="block text-[17px] font-semibold leading-snug tracking-[-0.015em] text-[var(--text-primary)] transition-colors group-hover:text-[var(--amber)]"
                                >
                                  {item.title}
                                  <ArrowUpRight className="ml-1 inline-block h-3.5 w-3.5 -translate-y-0.5 text-[var(--text-muted)] group-hover:text-[var(--amber)]" />
                                </a>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Right 4 Columns: SEC & Insider Brief (Instant SSR) */}
                <aside className="lg:col-span-4 lg:pl-6">
                  <div className="mb-3 flex items-center justify-between border-b border-[var(--border)] pb-2">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                      SEC &amp; Insider Brief
                    </h2>
                    <span className="font-mono-num text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      Live EDGAR
                    </span>
                  </div>

                  {briefDiffs.length === 0 && !briefInsiderBuy ? (
                    <p className="py-4 text-xs text-[var(--text-muted)]">
                      No recent SEC filing changes or insider buys in this view.
                    </p>
                  ) : (
                    <div className="divide-y divide-[var(--border)]">
                      {briefDiffs.map((diff) => (
                        <Link
                          key={diff.id}
                          href={`/t/${diff.ticker}?tab=diffs`}
                          className="group block py-3 first:pt-0"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--amber)]">
                              <FileDiff className="h-3 w-3" />
                              {diff.filingType} · {diff.materiality}
                            </span>
                            <span className="font-mono-num text-[var(--text-muted)]">
                              {diff.filingDate}
                            </span>
                          </div>
                          <div className="mt-1 flex items-baseline gap-1.5">
                            <span className="font-mono-num text-xs font-bold text-[var(--amber)]">
                              {diff.ticker}
                            </span>
                            <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                              {diff.headline}
                            </h3>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                            {diff.summary}
                          </p>
                        </Link>
                      ))}

                      {briefInsiderBuy && (
                        <Link
                          href={`/t/${briefInsiderBuy.ticker}?tab=insiders`}
                          className="group block pt-3"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--positive)]">
                              <UserCheck className="h-3 w-3" />
                              Insider Buy
                            </span>
                            <span className="font-mono-num text-[var(--text-muted)]">
                              {briefInsiderBuy.filingDate}
                            </span>
                          </div>
                          <div className="mt-1 flex items-baseline gap-1.5">
                            <span className="font-mono-num text-xs font-bold text-[var(--amber)]">
                              {briefInsiderBuy.ticker}
                            </span>
                            <h3 className="text-[13.5px] font-semibold leading-snug text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                              {formatCurrencyCompact(briefInsiderBuy.totalValue)} open-market purchase
                            </h3>
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">
                            {cleanEntity(briefInsiderBuy.insiderName)}
                            {briefInsiderBuy.insiderTitle
                              ? ` (${cleanEntity(briefInsiderBuy.insiderTitle)})`
                              : ""}
                          </p>
                        </Link>
                      )}
                    </div>
                  )}
                </aside>
              </section>
            )}

            {/* Section Filter Bar */}
            <nav
              aria-label="Feed sections"
              className="mt-5 flex flex-wrap items-center gap-1.5"
            >
              {(
                [
                  { id: "all", label: "All" },
                  {
                    id: "diffs",
                    label:
                      scopedDiffs.length > 0
                        ? `Filings & 8-Ks (${scopedDiffs.length})`
                        : "Filings & 8-Ks",
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
                        ? `Market Wire (${headlines.length})`
                        : "Market Wire",
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
            </nav>

            {/* MARKET WIRE: 2-Column Editorial News List */}
            {showWire && (
              <section className="mt-7 border-t border-[var(--border)] pt-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                    {selectedTicker
                      ? `${selectedTicker} Wire`
                      : watchlistOnly
                        ? "Watchlist Wire"
                        : "Market Wire"}
                  </h2>
                  <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                    Multi-Source Financial Wire
                  </span>
                </div>

                <div
                  className={`grid grid-cols-1 divide-y divide-[var(--border)] border-y border-[var(--border)] ${
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
                        className={`divide-y divide-[var(--border)] ${
                          colIdx === 0 && wireRight.length > 0
                            ? "lg:pr-6"
                            : colIdx === 1
                              ? "lg:pl-6"
                              : ""
                        }`}
                      >
                        {col.map((item) => (
                          <div
                            key={item.link}
                            className="group py-3 transition-colors"
                          >
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start justify-between gap-2 text-[13.5px] font-medium leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--amber)]"
                            >
                              <span>{item.title}</span>
                              <ArrowUpRight
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--amber)]"
                                aria-hidden="true"
                              />
                            </a>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
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
                                  className="font-mono-num rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--amber)] transition-colors hover:border-[var(--amber-border)] hover:bg-[var(--amber-soft)]"
                                >
                                  {sym}
                                </Link>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                </div>

                {headlines.length > 13 && (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowAllHeadlines((v) => !v)}
                      className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
                    >
                      {showAllHeadlines
                        ? "Show fewer wire stories"
                        : `Show all ${headlines.length} stories`}
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* SEC FILING CHANGES & 8-Ks (with integrated Topics filter) */}
            {showDiffs && scopedDiffs.length > 0 && (
              <section className="mt-8 border-t border-[var(--border)] pt-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <FileDiff className="h-4 w-4 text-[var(--amber)]" />
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                      {selectedTheme
                        ? `SEC Filings · ${CROSS_FILING_THEMES.find((t) => t.id === selectedTheme)?.label}`
                        : selectedTicker
                          ? `${selectedTicker} Filing Changes & 8-Ks`
                          : "SEC Filing Changes & 8-Ks"}
                    </h2>
                  </div>

                  {/* Contextual Topics Filter */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                      <Radar className="h-3 w-3 text-[var(--amber)]" />
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
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                            active
                              ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                              : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--amber-border)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          <span>{theme.label}</span>
                          <span className="font-mono-num text-[10px] opacity-75">
                            {count}
                          </span>
                          {active && <X className="h-3 w-3" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
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
                              disabled={!watchlist.canEdit}
                              onClick={() => watchlist.toggle(d.ticker)}
                              aria-label={isFollowing ? `Unfollow ${d.ticker}` : `Follow ${d.ticker}`}
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer disabled:cursor-wait ${
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
                            <h3 className="text-[15px] font-semibold leading-snug text-[var(--text-primary)] group-hover:text-[var(--amber)]">
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

            {/* BOTTOM BROADSHEET: Insider Activity + Filing Calendar / Recent SEC Filings */}
            {(showFilings || showInsiders) && (
              <div className="mt-8 grid grid-cols-1 gap-8 border-t border-[var(--border)] pt-5 lg:grid-cols-12">
                {showInsiders && (
                  <section
                    className={showFilings ? "lg:col-span-5" : "lg:col-span-12"}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                        Insider Activity (Form 4)
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
                      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                        {visibleInsiders.map((t) => {
                          const isBuy = t.transactionType === "Buy";
                          return (
                            <Link
                              key={t.id}
                              href={`/t/${t.ticker}?tab=insiders`}
                              className={`block px-4 py-3 transition-colors hover:bg-[var(--surface-subtle)] ${
                                isBuy ? "border-l-2 border-l-[var(--positive)]" : ""
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono-num text-xs font-bold text-[var(--amber)]">
                                    {t.ticker}
                                  </span>
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                      isBuy
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
                                    isBuy
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
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                {showFilings && (
                  <section
                    className={showInsiders ? "lg:col-span-7" : "lg:col-span-12"}
                  >
                    {/* Compact Upcoming Filing Window */}
                    {filter === "all" && upcomingEarnings.length > 0 && (
                      <div className="mb-6">
                        <div className="mb-2.5 flex items-center justify-between gap-2">
                          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                            Next Filing Window
                          </h2>
                          <span className="text-[11px] text-[var(--text-muted)]">
                            Quarterly SEC cadence
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {upcomingEarnings.map((item) => (
                            <Link
                              key={item.ticker}
                              href={`/t/${item.ticker}`}
                              className="group rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition-colors hover:border-[var(--amber-border)]"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-mono-num text-xs font-bold text-[var(--amber)]">
                                  {item.ticker}
                                </span>
                                <span className="font-mono-num text-[10px] text-[var(--text-muted)]">
                                  {item.daysAway <= 0 ? "Soon" : `~${item.daysAway}d`}
                                </span>
                              </div>
                              <div className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                                {item.name}
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                        Recent SEC Filings
                      </h2>
                      <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                        10-K / 10-Q
                      </span>
                    </div>

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
                                <span className="font-mono-num text-xs font-bold text-[var(--amber)]">
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
                                  Stock Comp:{" "}
                                  <strong className="font-mono-num text-[var(--sbc)]">
                                    {formatPct(c.sbcPctRevenue)}
                                  </strong>
                                </span>
                                <span>
                                  Priced-In Growth:{" "}
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
