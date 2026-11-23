"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowRight,
  Compass,
  FileDiff,
  Flame,
  Gauge,
  Landmark,
  Layers,
  SlidersHorizontal,
  Star,
  UserCheck,
  X,
} from "lucide-react";
import { SEARCH_INDEX, type SearchIndexEntry } from "@/data/universe";
import type {
  MarketFilingDiffItem,
  MarketInsiderFeedItem,
} from "@/data/repository";
import { useWatchlist } from "@/lib/watchlist";
import { TopNav } from "@/components/TopNav";
import { CommandSearch } from "@/components/CommandSearch";
import { MethodologyModal } from "@/components/MethodologyModal";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";
import { DISCOVERY_LENSES, type IndexSortKey } from "@/lib/insights";

type SortKey = IndexSortKey;

const LENS_STYLES: Record<
  string,
  { icon: typeof Landmark; badge: string }
> = {
  "cash-machines": {
    icon: Landmark,
    badge: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400",
  },
  "buyback-cannibals": {
    icon: Flame,
    badge: "bg-orange-500/12 text-orange-600 ring-orange-500/25 dark:text-orange-400",
  },
  "priced-for-perfection": {
    icon: Gauge,
    badge: "bg-violet-500/12 text-violet-600 ring-violet-500/25 dark:text-violet-400",
  },
  "hidden-dilution": {
    icon: AlertTriangle,
    badge: "bg-rose-500/12 text-rose-600 ring-rose-500/25 dark:text-rose-400",
  },
  "modest-expectations": {
    icon: Compass,
    badge: "bg-teal-500/12 text-teal-600 ring-teal-500/25 dark:text-teal-400",
  },
};

export function SignalIndex({
  entries = SEARCH_INDEX,
  initialLensId = null,
  recentDiffs = [],
  recentInsiders = [],
}: {
  entries?: SearchIndexEntry[];
  initialLensId?: string | null;
  recentDiffs?: MarketFilingDiffItem[];
  recentInsiders?: MarketInsiderFeedItem[];
}) {
  const initialLens = initialLensId
    ? DISCOVERY_LENSES.find((l) => l.id === initialLensId) ?? null
    : null;
  const [sortKey, setSortKey] = useState<SortKey>(
    initialLens?.defaultSortKey ?? "marketCap"
  );
  const [sortDir, setSortDir] = useState<"desc" | "asc">(
    initialLens?.defaultSortDir ?? "desc"
  );
  const [filter, setFilter] = useState("");
  const [selectedSector, setSelectedSector] = useState<string>("All");
  const [activeLensId, setActiveLensId] = useState<string | null>(
    initialLens?.id ?? null
  );
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [groupBySector, setGroupBySector] = useState(false);
  const [screenerOpen, setScreenerOpen] = useState(false);
  const [minFcfMargin, setMinFcfMargin] = useState("");
  const [maxSbcPct, setMaxSbcPct] = useState("");
  const [maxImplied, setMaxImplied] = useState("");
  const [maxDilution, setMaxDilution] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(30);
  const watchlist = useWatchlist();

  // Hydrate shareable lens & screener query params (?lens=cash-machines&fcf=20&sbc=5&imp=12&dil=0)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lensParam = params.get("lens");
    if (lensParam) {
      const found = DISCOVERY_LENSES.find((l) => l.id === lensParam);
      if (found) {
        setActiveLensId(found.id);
        setSortKey(found.defaultSortKey);
        setSortDir(found.defaultSortDir);
      }
    }
    const fcf = params.get("fcf");
    const sbc = params.get("sbc");
    const imp = params.get("imp");
    const dil = params.get("dil");
    if (fcf || sbc || imp || dil) {
      if (fcf) setMinFcfMargin(fcf);
      if (sbc) setMaxSbcPct(sbc);
      if (imp) setMaxImplied(imp);
      if (dil) setMaxDilution(dil);
      setScreenerOpen(true);
    }
  }, []);

  const activeFilterCount =
    (minFcfMargin.trim() ? 1 : 0) +
    (maxSbcPct.trim() ? 1 : 0) +
    (maxImplied.trim() ? 1 : 0) +
    (maxDilution.trim() ? 1 : 0) +
    (selectedSector !== "All" ? 1 : 0) +
    (groupBySector ? 1 : 0);

  const hasCustomScreen = activeFilterCount > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (activeLensId) {
      url.searchParams.set("lens", activeLensId);
    } else {
      url.searchParams.delete("lens");
    }
    const setOrDel = (k: string, v: string) => {
      if (v.trim() !== "" && Number.isFinite(Number(v))) url.searchParams.set(k, v.trim());
      else url.searchParams.delete(k);
    };
    setOrDel("fcf", minFcfMargin);
    setOrDel("sbc", maxSbcPct);
    setOrDel("imp", maxImplied);
    setOrDel("dil", maxDilution);
    if (selectedSector !== "All") url.searchParams.set("sector", selectedSector);
    else url.searchParams.delete("sector");
    if (sortKey !== "marketCap") url.searchParams.set("sort", sortKey);
    else url.searchParams.delete("sort");
    if (sortDir !== "desc") url.searchParams.set("dir", sortDir);
    else url.searchParams.delete("dir");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [activeLensId, minFcfMargin, maxSbcPct, maxImplied, maxDilution, selectedSector, sortKey, sortDir]);

  const activeLens = useMemo(
    () => DISCOVERY_LENSES.find((l) => l.id === activeLensId) ?? null,
    [activeLensId]
  );

  const lensCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const lens of DISCOVERY_LENSES) {
      map.set(lens.id, entries.filter(lens.filter).length);
    }
    return map;
  }, [entries]);

  function selectLens(lensId: string | null) {
    if (!lensId || lensId === activeLensId) {
      setActiveLensId(null);
      setSortKey("marketCap");
      setSortDir("desc");
    } else {
      const found = DISCOVERY_LENSES.find((l) => l.id === lensId);
      setActiveLensId(lensId);
      if (found) {
        setSortKey(found.defaultSortKey);
        setSortDir(found.defaultSortDir);
      }
    }
    setVisibleLimit(30);
  }

  const sectors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of entries) {
      counts.set(c.sector, (counts.get(c.sector) ?? 0) + 1);
    }
    return [
      "All",
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7)
        .map(([sector]) => sector),
    ];
  }, [entries]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Guardrails: exclude extreme XBRL anomalies & banks from FCF margin leaderboards
  const leaderboardEligible = useMemo(
    () =>
      entries.filter(
        (c) =>
          c.revenue >= 250 &&
          c.trueFcfMargin <= 75 &&
          c.trueFcfMargin >= -120 &&
          c.sbcPctRevenue <= 85
      ),
    [entries]
  );

  const steepestSbc = useMemo(
    () =>
      [...leaderboardEligible]
        .filter((c) => c.sbcPctRevenue > 0)
        .sort((a, b) => b.sbcPctRevenue - a.sbcPctRevenue)
        .slice(0, 5),
    [leaderboardEligible]
  );

  const cleanestCash = useMemo(
    () =>
      [...leaderboardEligible]
        .filter((c) => c.trueFcfMargin > 0 && c.sbcPctRevenue <= 10)
        .sort((a, b) => b.trueFcfMargin - a.trueFcfMargin)
        .slice(0, 5),
    [leaderboardEligible]
  );

  const steepestImplied = useMemo(
    () =>
      [...leaderboardEligible]
        .filter((c) => c.impliedCagr > 0 && c.impliedCagr < 60)
        .sort((a, b) => b.impliedCagr - a.impliedCagr)
        .slice(0, 5),
    [leaderboardEligible]
  );

  const rows = useMemo<SearchIndexEntry[]>(() => {
    const q = filter.trim().toLowerCase();
    const minFcfVal = minFcfMargin.trim() !== "" ? Number(minFcfMargin) : null;
    const maxSbcVal = maxSbcPct.trim() !== "" ? Number(maxSbcPct) : null;
    const maxImpVal = maxImplied.trim() !== "" ? Number(maxImplied) : null;
    const maxDilVal = maxDilution.trim() !== "" ? Number(maxDilution) : null;

    const filtered = entries.filter((c) => {
      if (watchlistOnly && !watchlist.has(c.ticker)) return false;
      if (activeLens && !activeLens.filter(c)) return false;
      if (selectedSector !== "All" && c.sector !== selectedSector) return false;
      if (minFcfVal !== null && Number.isFinite(minFcfVal) && c.trueFcfMargin < minFcfVal) return false;
      if (maxSbcVal !== null && Number.isFinite(maxSbcVal) && c.sbcPctRevenue > maxSbcVal) return false;
      if (maxImpVal !== null && Number.isFinite(maxImpVal) && c.impliedCagr > maxImpVal) return false;
      if (maxDilVal !== null && Number.isFinite(maxDilVal) && c.netDilutionCagr > maxDilVal) return false;
      if (!q) return true;
      return (
        c.ticker.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.sector.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "desc" ? -diff : diff;
    });
  }, [
    entries,
    filter,
    selectedSector,
    activeLens,
    watchlistOnly,
    watchlist,
    minFcfMargin,
    maxSbcPct,
    maxImplied,
    maxDilution,
    sortKey,
    sortDir,
  ]);

  const visibleRows = rows.slice(0, visibleLimit);

  const groupedBySector = useMemo(() => {
    if (!groupBySector) return [];
    const map = new Map<string, SearchIndexEntry[]>();
    // Cap per-sector DOM rows when viewing the full universe so toggling Group by Sector stays instant
    for (const c of visibleRows) {
      const list = map.get(c.sector) ?? [];
      list.push(c);
      map.set(c.sector, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [groupBySector, visibleRows]);

  const sortColumns: Array<{ key: SortKey; label: string; tip?: string }> = [
    { key: "marketCap", label: "Mkt Cap", tip: "Latest market capitalization" },
    {
      key: "trueFcf",
      label: "True FCF",
      tip: "Free Cash Flow minus Stock-Based Compensation (real cash after equity dilution)",
    },
    {
      key: "trueFcfMargin",
      label: "True Margin",
      tip: "True Free Cash Flow as a percentage of Revenue",
    },
    {
      key: "sbcPctRevenue",
      label: "SBC / Rev",
      tip: "Employee stock-based compensation as a % of Revenue",
    },
    {
      key: "netDilutionCagr",
      label: "Dilution (4Y)",
      tip: "Annualized 4-year change in diluted share count (negative = buyback shrinkage)",
    },
    {
      key: "impliedCagr",
      label: "Implied 10Y",
      tip: "10-year annual revenue growth rate already priced into today's stock price (Reverse DCF)",
    },
  ];

  const featuredDiff = useMemo(() => {
    return (
      recentDiffs.find((d) => d.materiality === "High") ?? recentDiffs[0] ?? null
    );
  }, [recentDiffs]);

  const featuredInsiderBuy = useMemo(() => {
    const buys = recentInsiders.filter((i) => i.transactionType === "Buy");
    return (
      [...buys].sort((a, b) => b.totalValue - a.totalValue)[0] ?? null
    );
  }, [recentInsiders]);

  const featuredExpectation = useMemo(() => {
    return (
      [...leaderboardEligible]
        .filter((c) => c.marketCap >= 50_000 && c.impliedCagr > 0 && c.impliedCagr < 60)
        .sort((a, b) => b.impliedCagr - a.impliedCagr)[0] ?? null
    );
  }, [leaderboardEligible]);

  const QUICK_CHECK_TICKERS = ["NVDA", "AAPL", "MSFT", "PLTR", "META", "COST"];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        {/* Quiet Tool Header */}
        <section className="border-b border-[var(--border)] pb-8">
          <h1 className="max-w-2xl text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
            SEC filings, cash flow, and valuation.
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
            Financials, filing changes, implied growth, and Form 4 insider trades across {entries.length} public companies.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <CommandSearch variant="hero" initialEntries={entries} />
            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_CHECK_TICKERS.map((t) => (
                <Link
                  key={t}
                  href={`/t/${t}`}
                  className="font-mono-num inline-flex h-8 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)]"
                >
                  {t}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Recent Filings & Insider Activity */}
        {!initialLensId && (featuredDiff || featuredInsiderBuy || featuredExpectation) && (
          <section aria-label="Latest filings and insider activity" className="mt-7">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Latest Filings &amp; Insider Activity
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
                        onClick={() => watchlist.toggle(featuredDiff.ticker)}
                        aria-label={`Follow ${featuredDiff.ticker}`}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer ${
                          watchlist.has(featuredDiff.ticker)
                            ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <Star
                          className="h-3 w-3"
                          fill={watchlist.has(featuredDiff.ticker) ? "currentColor" : "none"}
                        />
                        {watchlist.has(featuredDiff.ticker) ? "Following" : "Follow"}
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
                        onClick={() => watchlist.toggle(featuredInsiderBuy.ticker)}
                        aria-label={`Follow ${featuredInsiderBuy.ticker}`}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer ${
                          watchlist.has(featuredInsiderBuy.ticker)
                            ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <Star
                          className="h-3 w-3"
                          fill={watchlist.has(featuredInsiderBuy.ticker) ? "currentColor" : "none"}
                        />
                        {watchlist.has(featuredInsiderBuy.ticker) ? "Following" : "Follow"}
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
                        {featuredInsiderBuy.insiderName} ({featuredInsiderBuy.insiderTitle}) bought {Math.round(featuredInsiderBuy.shares).toLocaleString()} shares at ${featuredInsiderBuy.pricePerShare.toFixed(2)}.
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
                        onClick={() => watchlist.toggle(featuredExpectation.ticker)}
                        aria-label={`Follow ${featuredExpectation.ticker}`}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer ${
                          watchlist.has(featuredExpectation.ticker)
                            ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <Star
                          className="h-3 w-3"
                          fill={watchlist.has(featuredExpectation.ticker) ? "currentColor" : "none"}
                        />
                        {watchlist.has(featuredExpectation.ticker) ? "Following" : "Follow"}
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
                        At {formatCurrencyCompact(featuredExpectation.marketCap)} market cap, today&apos;s valuation demands sustained decade-long compounding. Stress-test the sliders yourself.
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
        )}

        {/* Companies Table + Integrated Lens Filters */}
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2
                id="coverage-caption"
                className="flex items-baseline gap-2 text-sm font-semibold text-[var(--text-primary)]"
              >
                <span>Companies</span>
                <span className="font-mono-num text-xs font-normal text-[var(--text-muted)]">
                  {rows.length}
                </span>
              </h2>

              <button
                type="button"
                onClick={() => {
                  setWatchlistOnly((prev) => !prev);
                  setVisibleLimit(30);
                }}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors cursor-pointer ${
                  watchlistOnly
                    ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Star
                  className="h-3.5 w-3.5"
                  fill={watchlistOnly ? "currentColor" : "none"}
                />
                Watchlist
                {watchlist.tickers.length > 0 && (
                  <span className="font-mono-num opacity-75">
                    ({watchlist.tickers.length})
                  </span>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setVisibleLimit(30);
                }}
                placeholder="Filter table…"
                aria-label="Filter companies table"
                className="h-8 w-44 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber-border)]"
              />

              <select
                aria-label="Sort companies"
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(":") as [IndexSortKey, "asc" | "desc"];
                  setSortKey(k);
                  setSortDir(d);
                }}
                className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-secondary)] focus:border-[var(--amber-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber-border)] sm:hidden"
              >
                <option value="marketCap:desc">Sort: Market Cap</option>
                <option value="trueFcf:desc">Sort: True FCF</option>
                <option value="trueFcfMargin:desc">Sort: True Margin</option>
                <option value="sbcPctRevenue:desc">Sort: SBC % (High)</option>
                <option value="netDilutionCagr:asc">Sort: Buybacks</option>
                <option value="impliedCagr:desc">Sort: Implied 10Y</option>
              </select>

              <button
                type="button"
                onClick={() => setScreenerOpen((prev) => !prev)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors cursor-pointer ${
                  screenerOpen || hasCustomScreen
                    ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="font-mono-num rounded-full bg-[var(--cta-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--cta-fg)]">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Integrated Discovery Lens Strip */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {DISCOVERY_LENSES.map((lens) => {
              const isSelected = activeLensId === lens.id;
              const matchCount = lensCounts.get(lens.id) ?? 0;
              const style = LENS_STYLES[lens.id] ?? {
                icon: Compass,
                badge: "bg-amber-500/12 text-amber-600 ring-amber-500/25 dark:text-amber-400",
              };
              const LensIcon = style.icon;
              return (
                <button
                  key={lens.id}
                  type="button"
                  onClick={() => selectLens(lens.id)}
                  title={isSelected ? `Clear ${lens.title} filter` : lens.subtitle}
                  className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${style.badge}`}
                  >
                    <LensIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className={isSelected ? "font-semibold text-[var(--amber)]" : ""}>
                    {lens.title}
                  </span>
                  {isSelected ? (
                    <X className="h-3.5 w-3.5 text-[var(--amber)] opacity-80" aria-hidden="true" />
                  ) : (
                    <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                      {matchCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {activeLens && (
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              <span className="font-medium text-[var(--text-secondary)]">
                {activeLens.title}:
              </span>{" "}
              {activeLens.criteriaSummary}
            </p>
          )}

          {/* Consolidated Filters Drawer (Sector, Fundamentals, Grouping) */}
          {screenerOpen && (
            <div className="mb-4 space-y-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <label className="col-span-2 block sm:col-span-1">
                  <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                    Sector
                  </span>
                  <select
                    value={selectedSector}
                    onChange={(e) => {
                      setSelectedSector(e.target.value);
                      setVisibleLimit(30);
                    }}
                    className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--amber-border)] focus:outline-none"
                  >
                    {sectors.map((s) => (
                      <option key={s} value={s}>
                        {s === "All" ? "All Sectors" : s}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                    Min True FCF %
                  </span>
                  <input
                    type="number"
                    step="1"
                    value={minFcfMargin}
                    onChange={(e) => {
                      setMinFcfMargin(e.target.value);
                      setVisibleLimit(30);
                    }}
                    placeholder="e.g. 20"
                    className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                    Max SBC / Rev %
                  </span>
                  <input
                    type="number"
                    step="1"
                    value={maxSbcPct}
                    onChange={(e) => {
                      setMaxSbcPct(e.target.value);
                      setVisibleLimit(30);
                    }}
                    placeholder="e.g. 5"
                    className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                    Max Implied 10Y %
                  </span>
                  <input
                    type="number"
                    step="1"
                    value={maxImplied}
                    onChange={(e) => {
                      setMaxImplied(e.target.value);
                      setVisibleLimit(30);
                    }}
                    placeholder="e.g. 10"
                    className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                    Max Dilution %
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    value={maxDilution}
                    onChange={(e) => {
                      setMaxDilution(e.target.value);
                      setVisibleLimit(30);
                    }}
                    placeholder="e.g. 0"
                    className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                <button
                  type="button"
                  onClick={() => setGroupBySector((prev) => !prev)}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors cursor-pointer ${
                    groupBySector
                      ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
                      : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Group by Sector
                </button>

                {hasCustomScreen && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSector("All");
                      setGroupBySector(false);
                      setMinFcfMargin("");
                      setMaxSbcPct("");
                      setMaxImplied("");
                      setMaxDilution("");
                    }}
                    className="text-xs font-medium text-[var(--amber)] hover:underline cursor-pointer"
                  >
                    Reset all filters
                  </button>
                )}
              </div>
            </div>
          )}

          <div
            tabIndex={0}
            role="region"
            aria-labelledby="coverage-caption"
            className="amber-table-wrapper"
          >
            <table className="amber-table">
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  {sortColumns.map((col) => {
                    const isSorted = sortKey === col.key;
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        aria-sort={
                          isSorted
                            ? sortDir === "desc"
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          title={col.tip}
                          className={`inline-flex items-center gap-1 transition-colors cursor-pointer ${
                            isSorted
                              ? "font-semibold text-[var(--amber)]"
                              : "hover:text-[var(--text-primary)]"
                          }`}
                        >
                          {col.label}
                          {isSorted ? (
                            sortDir === "desc" ? (
                              <ArrowDown className="h-3 w-3 text-[var(--amber)]" />
                            ) : (
                              <ArrowUp className="h-3 w-3 text-[var(--amber)]" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-45" />
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="!py-12 !text-center text-sm text-[var(--text-secondary)]"
                    >
                      <p>
                        {watchlistOnly && watchlist.tickers.length === 0
                          ? "Your watchlist is empty. Star any company to track it here."
                          : "No companies match the active filters."}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setFilter("");
                          setWatchlistOnly(false);
                          setActiveLensId(null);
                          setSelectedSector("All");
                          setGroupBySector(false);
                          setMinFcfMargin("");
                          setMaxSbcPct("");
                          setMaxImplied("");
                          setMaxDilution("");
                        }}
                        className="mt-3 inline-flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--amber)] hover:border-[var(--amber-border)] cursor-pointer"
                      >
                        Reset filters
                      </button>
                    </td>
                  </tr>
                ) : groupBySector
                  ? groupedBySector.map(([sector, sectorRows]) => (
                      <Fragment key={sector}>
                        <tr>
                          <td
                            colSpan={7}
                            className="!bg-[var(--surface-subtle)] !py-2 !text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]"
                          >
                            {sector}{" "}
                            <span className="font-mono-num ml-1 opacity-75">
                              ({sectorRows.length})
                            </span>
                          </td>
                        </tr>
                        {sectorRows.map((c) => {
                          const starred = watchlist.has(c.ticker);
                          return (
                            <tr key={c.ticker}>
                              <th scope="row">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => watchlist.toggle(c.ticker)}
                                    aria-label={
                                      starred
                                        ? `Remove ${c.ticker} from watchlist`
                                        : `Add ${c.ticker} to watchlist`
                                    }
                                    className={`transition-colors cursor-pointer ${
                                      starred
                                        ? "text-[var(--amber)]"
                                        : "text-[var(--border-strong)] hover:text-[var(--text-secondary)]"
                                    }`}
                                  >
                                    <Star
                                      className="h-3.5 w-3.5"
                                      fill={starred ? "currentColor" : "none"}
                                    />
                                  </button>
                                  <Link
                                    href={`/t/${c.ticker}`}
                                    className="group inline-flex items-center gap-2 hover:text-[var(--amber)]"
                                  >
                                    <span className="font-mono-num w-12 font-semibold text-[var(--amber)]">
                                      {c.ticker}
                                    </span>
                                    <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                                      {c.name}
                                    </span>
                                  </Link>
                                </div>
                              </th>
                              <td data-label="Mkt Cap" className="font-mono-num">
                                {formatCurrencyCompact(c.marketCap)}
                              </td>
                              <td
                                data-label="True FCF"
                                className={`font-mono-num font-semibold ${
                                  c.trueFcf >= 0
                                    ? "text-[var(--amber)]"
                                    : "text-[var(--negative)]"
                                }`}
                              >
                                {formatCurrencyCompact(c.trueFcf)}
                              </td>
                              <td data-label="True Margin" className="font-mono-num">
                                {formatPct(c.trueFcfMargin)}
                              </td>
                              <td
                                data-label="SBC / Rev"
                                className="font-mono-num text-[var(--sbc)]"
                              >
                                {formatPct(c.sbcPctRevenue)}
                              </td>
                              <td
                                data-label="Dilution (4Y)"
                                className={`font-mono-num ${
                                  c.netDilutionCagr > 1.5
                                    ? "text-[var(--negative)]"
                                    : c.netDilutionCagr < -0.5
                                      ? "text-[var(--positive)]"
                                      : "text-[var(--text-secondary)]"
                                }`}
                              >
                                {formatPct(c.netDilutionCagr, true)}
                              </td>
                              <td
                                data-label="Implied 10Y"
                                className="font-mono-num font-medium"
                              >
                                {formatPct(c.impliedCagr)}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))
                  : visibleRows.map((c) => {
                  const starred = watchlist.has(c.ticker);
                  return (
                  <tr key={c.ticker}>
                    <th scope="row">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => watchlist.toggle(c.ticker)}
                          aria-label={
                            starred
                              ? `Remove ${c.ticker} from watchlist`
                              : `Add ${c.ticker} to watchlist`
                          }
                          className={`transition-colors cursor-pointer ${
                            starred
                              ? "text-[var(--amber)]"
                              : "text-[var(--border-strong)] hover:text-[var(--text-secondary)]"
                          }`}
                        >
                          <Star
                            className="h-3.5 w-3.5"
                            fill={starred ? "currentColor" : "none"}
                          />
                        </button>
                        <Link
                          href={`/t/${c.ticker}`}
                          className="group inline-flex items-center gap-2 hover:text-[var(--amber)]"
                        >
                          <span className="font-mono-num w-12 font-semibold text-[var(--amber)]">
                            {c.ticker}
                          </span>
                          <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                            {c.name}
                          </span>
                        </Link>
                      </div>
                    </th>
                    <td data-label="Mkt Cap" className="font-mono-num">
                      {formatCurrencyCompact(c.marketCap)}
                    </td>
                    <td
                      data-label="True FCF"
                      className={`font-mono-num font-semibold ${
                        c.trueFcf >= 0
                          ? "text-[var(--amber)]"
                          : "text-[var(--negative)]"
                      }`}
                    >
                      {formatCurrencyCompact(c.trueFcf)}
                    </td>
                    <td data-label="True Margin" className="font-mono-num">
                      {formatPct(c.trueFcfMargin)}
                    </td>
                    <td
                      data-label="SBC / Rev"
                      className="font-mono-num text-[var(--sbc)]"
                    >
                      {formatPct(c.sbcPctRevenue)}
                    </td>
                    <td
                      data-label="Dilution (4Y)"
                      className={`font-mono-num ${
                        c.netDilutionCagr > 1.5
                          ? "text-[var(--negative)]"
                          : c.netDilutionCagr < -0.5
                            ? "text-[var(--positive)]"
                            : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {formatPct(c.netDilutionCagr, true)}
                    </td>
                    <td
                      data-label="Implied 10Y"
                      className="font-mono-num font-medium"
                    >
                      {formatPct(c.impliedCagr)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!groupBySector && rows.length > visibleLimit && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 40)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
              >
                Show more ({rows.length - visibleLimit} remaining)
              </button>
            </div>
          )}
        </section>

        {/* Market Extremes & Leaderboards */}
        <section aria-label="High-signal leaderboards" className="mt-12">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Market Extremes &amp; Leaderboards
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Top 5 standouts across stock compensation, real cash margins, and priced-in growth.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Card 1: Steepest SBC Burden */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  Steepest SBC Burden
                </h3>
                <span className="font-mono-num text-[11px] text-[var(--sbc)]">
                  SBC / Rev
                </span>
              </div>
              <ul className="mt-3.5 divide-y divide-[var(--border)]">
                {steepestSbc.map((c) => (
                  <li key={c.ticker}>
                    <Link
                      href={`/t/${c.ticker}`}
                      className="flex items-center justify-between py-2.5 text-xs transition-colors hover:text-[var(--amber)]"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-mono-num w-12 shrink-0 font-semibold text-[var(--amber)]">
                          {c.ticker}
                        </span>
                        <span className="truncate text-[var(--text-secondary)]">
                          {c.name}
                        </span>
                      </span>
                      <span className="font-mono-num shrink-0 font-semibold text-[var(--sbc)]">
                        {formatPct(c.sbcPctRevenue)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 2: Cleanest True FCF Margins */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  Cleanest True FCF Margins
                </h3>
                <span className="font-mono-num text-[11px] text-[var(--amber)]">
                  True FCF %
                </span>
              </div>
              <ul className="mt-3.5 divide-y divide-[var(--border)]">
                {cleanestCash.map((c) => (
                  <li key={c.ticker}>
                    <Link
                      href={`/t/${c.ticker}`}
                      className="flex items-center justify-between py-2.5 text-xs transition-colors hover:text-[var(--amber)]"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-mono-num w-12 shrink-0 font-semibold text-[var(--amber)]">
                          {c.ticker}
                        </span>
                        <span className="truncate text-[var(--text-secondary)]">
                          {c.name}
                        </span>
                      </span>
                      <span className="font-mono-num shrink-0 font-semibold text-[var(--positive)]">
                        {formatPct(c.trueFcfMargin)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 3: Steepest Implied Growth */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  Highest Implied 10Y Growth
                </h3>
                <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                  Reverse DCF
                </span>
              </div>
              <ul className="mt-3.5 divide-y divide-[var(--border)]">
                {steepestImplied.map((c) => (
                  <li key={c.ticker}>
                    <Link
                      href={`/t/${c.ticker}`}
                      className="flex items-center justify-between py-2.5 text-xs transition-colors hover:text-[var(--amber)]"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-mono-num w-12 shrink-0 font-semibold text-[var(--amber)]">
                          {c.ticker}
                        </span>
                        <span className="truncate text-[var(--text-secondary)]">
                          {c.name}
                        </span>
                      </span>
                      <span className="font-mono-num shrink-0 font-semibold text-[var(--text-primary)]">
                        {formatPct(c.impliedCagr)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <footer className="mt-14 flex flex-col items-start justify-between gap-2 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-4">
            <span>© {new Date().getFullYear()} Amber</span>
            <Link href="/privacy" className="hover:text-[var(--text-primary)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--text-primary)]">
              Terms
            </Link>
            <span>Not investment advice.</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <MethodologyModal />
          </div>
        </footer>
      </main>
    </div>
  );
}
