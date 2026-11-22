"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowRight,
  Compass,
  Flame,
  Gauge,
  Landmark,
  Layers,
  Rocket,
  Sparkles,
  Star,
} from "lucide-react";
import { SEARCH_INDEX, type SearchIndexEntry } from "@/data/universe";
import { useWatchlist } from "@/lib/watchlist";
import { TopNav } from "@/components/TopNav";
import { CommandSearch } from "@/components/CommandSearch";
import { NotableSignalsFeed } from "@/components/NotableSignalsFeed";
import { MethodologyModal } from "@/components/MethodologyModal";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";
import { DISCOVERY_LENSES, type IndexSortKey } from "@/lib/insights";

type SortKey = IndexSortKey;

const LENS_ICONS: Record<string, typeof Landmark> = {
  "cash-machines": Landmark,
  "buyback-cannibals": Flame,
  "priced-for-perfection": Gauge,
  "hidden-dilution": AlertTriangle,
  "modest-expectations": Compass,
};

export function SignalIndex({
  entries = SEARCH_INDEX,
}: {
  entries?: SearchIndexEntry[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [filter, setFilter] = useState("");
  const [selectedSector, setSelectedSector] = useState<string>("All");
  const [activeLensId, setActiveLensId] = useState<string | null>(null);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [groupBySector, setGroupBySector] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(30);
  const watchlist = useWatchlist();

  const activeLens = useMemo(
    () => DISCOVERY_LENSES.find((l) => l.id === activeLensId) ?? null,
    [activeLensId]
  );

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
    const filtered = entries.filter((c) => {
      if (watchlistOnly && !watchlist.has(c.ticker)) return false;
      if (activeLens && !activeLens.filter(c)) return false;
      if (selectedSector !== "All" && c.sector !== selectedSector) return false;
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
  }, [entries, filter, selectedSector, activeLens, watchlistOnly, watchlist, sortKey, sortDir]);

  const visibleRows = rows.slice(0, visibleLimit);

  const groupedBySector = useMemo(() => {
    if (!groupBySector) return [];
    const map = new Map<string, SearchIndexEntry[]>();
    // Group across ALL matching rows so sector totals are accurate (not clipped at 30)
    for (const c of rows) {
      const list = map.get(c.sector) ?? [];
      list.push(c);
      map.set(c.sector, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [groupBySector, rows]);

  const sortColumns: Array<{ key: SortKey; label: string }> = [
    { key: "marketCap", label: "Mkt Cap" },
    { key: "trueFcf", label: "True FCF" },
    { key: "trueFcfMargin", label: "True Margin" },
    { key: "sbcPctRevenue", label: "SBC / Rev" },
    { key: "netDilutionCagr", label: "Dilution (4Y)" },
    { key: "impliedCagr", label: "Implied 10Y" },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        {/* Crisp Editorial Hero */}
        <section className="border-b border-[var(--border)] pb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3 py-1 text-[11px] font-medium text-[var(--amber)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
            SEC EDGAR XBRL · {entries.length} Companies
          </div>

          <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] sm:text-4xl">
            Understand any business in 60 seconds.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
            Real cash flow, dilution, and priced-in growth from SEC filings.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <CommandSearch variant="hero" initialEntries={entries} />
            <Link
              href="/t/NVDA"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)]"
            >
              Open NVDA Demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Market-Wide Notable Signals Feed */}
        <NotableSignalsFeed entries={entries} />

        {/* Curated Discovery Lenses ("Start Exploring") */}
        <section aria-label="Curated discovery lenses" className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--amber)]" />
              Explore by Lens
            </h2>
            {activeLens && (
              <button
                type="button"
                onClick={() => selectLens(null)}
                className="text-xs font-medium text-[var(--amber)] hover:underline cursor-pointer"
              >
                Clear lens
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {DISCOVERY_LENSES.map((lens) => {
              const isSelected = activeLensId === lens.id;
              const matchCount = entries.filter(lens.filter).length;
              const LensIcon = LENS_ICONS[lens.id] ?? Compass;
              return (
                <button
                  key={lens.id}
                  type="button"
                  onClick={() => selectLens(lens.id)}
                  className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? "border-[var(--amber-border)] bg-[var(--amber-soft)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                        isSelected
                          ? "text-[var(--amber)]"
                          : "text-[var(--text-primary)]"
                      }`}
                    >
                      <LensIcon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isSelected ? "text-[var(--amber)]" : "text-[var(--text-muted)]"
                        }`}
                        aria-hidden="true"
                      />
                      {lens.title}
                    </span>
                    <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                      {matchCount}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-[var(--text-secondary)]">
                    {lens.subtitle}
                  </p>
                </button>
              );
            })}
          </div>

          {activeLens && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-3 text-xs text-[var(--text-primary)]">
              <div>
                <span className="font-semibold text-[var(--amber)]">
                  Why {activeLens.title} matters:{" "}
                </span>
                <span className="text-[var(--text-secondary)]">
                  {activeLens.whyItMatters}
                </span>
              </div>
              <Link
                href={`/lenses/${activeLens.id}`}
                className="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--amber)] hover:underline"
              >
                Open full lens page
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </section>

        {/* Full Coverage Screener Table */}
        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="coverage-caption"
                className="text-sm font-semibold text-[var(--text-primary)]"
              >
                SEC-Verified Coverage Universe ({rows.length})
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Click any column header to sort, or click a company to launch its True FCF &amp; Reverse DCF workspace.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setGroupBySector((prev) => !prev)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors cursor-pointer ${
                  groupBySector
                    ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Group by Sector
              </button>

              <input
                type="search"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setVisibleLimit(30);
                }}
                placeholder="Filter table…"
                aria-label="Filter coverage table"
                className="h-8 w-48 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
              />
            </div>
          </div>

          {/* Watchlist + Sector Filter Pills */}
          <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setWatchlistOnly((prev) => !prev);
                setVisibleLimit(30);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
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

            {sectors.map((sector) => {
              const active = selectedSector === sector;
              return (
                <button
                  key={sector}
                  type="button"
                  onClick={() => {
                    setSelectedSector(sector);
                    setVisibleLimit(30);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                      : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {sector}
                </button>
              );
            })}
          </div>

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
                {groupBySector
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
                <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  <AlertTriangle className="h-3.5 w-3.5 text-[var(--sbc)]" aria-hidden="true" />
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
                <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  <Landmark className="h-3.5 w-3.5 text-[var(--positive)]" aria-hidden="true" />
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
                <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  <Rocket className="h-3.5 w-3.5 text-[var(--amber)]" aria-hidden="true" />
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
          <p>© {new Date().getFullYear()} Amber · Not investment advice.</p>
          <div className="flex flex-wrap items-center gap-4">
            <MethodologyModal />
          </div>
        </footer>
      </main>
    </div>
  );
}
