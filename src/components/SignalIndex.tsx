"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, ArrowRight, Star } from "lucide-react";
import { SEARCH_INDEX, type SearchIndexEntry } from "@/data/universe";
import { useWatchlist } from "@/lib/watchlist";
import { TopNav } from "@/components/TopNav";
import { CommandSearch } from "@/components/CommandSearch";
import { NotableSignalsFeed } from "@/components/NotableSignalsFeed";
import { MethodologyModal } from "@/components/MethodologyModal";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";
import { DISCOVERY_LENSES } from "@/lib/insights";

type SortKey =
  | "marketCap"
  | "trueFcf"
  | "trueFcfMargin"
  | "sbcPctRevenue"
  | "netDilutionCagr"
  | "impliedCagr";

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
  const [visibleLimit, setVisibleLimit] = useState(30);
  const watchlist = useWatchlist();

  const activeLens = useMemo(
    () => DISCOVERY_LENSES.find((l) => l.id === activeLensId) ?? null,
    [activeLensId]
  );

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

    if (activeLens && sortKey === "marketCap" && sortDir === "desc") {
      return [...filtered].sort(activeLens.sort);
    }

    return [...filtered].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "desc" ? -diff : diff;
    });
  }, [entries, filter, selectedSector, activeLens, watchlistOnly, watchlist, sortKey, sortDir]);

  const visibleRows = rows.slice(0, visibleLimit);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        {/* Crisp Editorial Hero */}
        <section className="border-b border-[var(--border)] pb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3 py-1 text-[11px] font-medium text-[var(--amber)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
            Live SEC EDGAR 10-K XBRL · {entries.length} Companies Indexed
          </div>

          <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] sm:text-4xl">
            Understand any public business in 60 seconds—without Wall Street noise.
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
            Pick a curated lens below or search any company to see if it&apos;s growing, generating real cash, financially safe, and what growth the stock price already expects.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <CommandSearch variant="hero" initialEntries={entries} />
            <Link
              href="/t/PLTR"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)]"
            >
              Open PLTR Demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Market-Wide Notable Signals Feed */}
        <NotableSignalsFeed entries={entries} />

        {/* Curated Discovery Lenses ("Start Exploring") */}
        <section aria-label="Curated discovery lenses" className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Not sure where to start? Explore by lens
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Click any theme to filter the market and see why it matters.
              </p>
            </div>
            {activeLens && (
              <button
                type="button"
                onClick={() => setActiveLensId(null)}
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
              return (
                <button
                  key={lens.id}
                  type="button"
                  onClick={() => {
                    setActiveLensId(isSelected ? null : lens.id);
                    setVisibleLimit(30);
                  }}
                  className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? "border-[var(--amber-border)] bg-[var(--amber-soft)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-semibold ${
                        isSelected
                          ? "text-[var(--amber)]"
                          : "text-[var(--text-primary)]"
                      }`}
                    >
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
            <div className="mt-3 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-3 text-xs text-[var(--text-primary)]">
              <span className="font-semibold text-[var(--amber)]">
                Why {activeLens.title} matters:{" "}
              </span>
              <span className="text-[var(--text-secondary)]">
                {activeLens.whyItMatters}
              </span>
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

            <input
              type="search"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setVisibleLimit(30);
              }}
              placeholder="Filter table…"
              aria-label="Filter coverage table"
              className="h-8 w-52 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
            />
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
                  <th scope="col">
                    <button
                      type="button"
                      onClick={() => toggleSort("marketCap")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      Mkt Cap
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      onClick={() => toggleSort("trueFcf")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      True FCF
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      onClick={() => toggleSort("trueFcfMargin")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      True Margin
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      onClick={() => toggleSort("sbcPctRevenue")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      SBC / Rev
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      onClick={() => toggleSort("netDilutionCagr")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      Dilution (4Y)
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      onClick={() => toggleSort("impliedCagr")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      Implied 10Y
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((c) => {
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

          {rows.length > visibleLimit && (
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
          <p>
            Amber · Deterministic fundamental analysis from SEC EDGAR 10-K/10-Q XBRL filings. Not investment advice.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <MethodologyModal />
            <span className="font-mono-num">
              {entries.length} tickers · Neon Postgres + Vercel ISR
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
