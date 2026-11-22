"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, ArrowRight } from "lucide-react";
import { SEARCH_INDEX, type SearchIndexEntry } from "@/data/universe";
import { TopNav } from "@/components/TopNav";
import { CommandSearch } from "@/components/CommandSearch";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

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
  const [visibleLimit, setVisibleLimit] = useState(30);

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

  const steepestSbc = useMemo(
    () =>
      [...entries]
        .sort((a, b) => b.sbcPctRevenue - a.sbcPctRevenue)
        .slice(0, 5),
    [entries]
  );

  const cleanestCash = useMemo(
    () =>
      [...entries]
        .filter((c) => c.trueFcfMargin > 0)
        .sort((a, b) => b.trueFcfMargin - a.trueFcfMargin)
        .slice(0, 5),
    [entries]
  );

  const steepestImplied = useMemo(
    () =>
      [...entries]
        .sort((a, b) => b.impliedCagr - a.impliedCagr)
        .slice(0, 5),
    [entries]
  );

  const rows = useMemo<SearchIndexEntry[]>(() => {
    const q = filter.trim().toLowerCase();
    const filtered = entries.filter((c) => {
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
  }, [entries, filter, selectedSector, sortKey, sortDir]);

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
            Owner earnings, SBC dilution, and market-implied growth—without the noise.
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
            Amber strips Stock-Based Compensation out of headline Free Cash Flow, stress-tests what current Enterprise Value prices in via Reverse DCF, and surfaces material SEC filing diffs.
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

        {/* 3 High-Signal Leaderboards */}
        <section
          aria-label="High-signal leaderboards"
          className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3"
        >
          {/* Card 1: Steepest SBC Burden */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Steepest SBC Burden
              </h2>
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
              <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Cleanest True FCF Margins
              </h2>
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
              <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Highest Implied 10Y Growth
              </h2>
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

          {/* Sector Filter Pills */}
          <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
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
                {visibleRows.map((c) => (
                  <tr key={c.ticker}>
                    <th scope="row">
                      <Link
                        href={`/t/${c.ticker}`}
                        className="group inline-flex items-center gap-2.5 hover:text-[var(--amber)]"
                      >
                        <span className="font-mono-num w-12 font-semibold text-[var(--amber)]">
                          {c.ticker}
                        </span>
                        <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                          {c.name}
                        </span>
                      </Link>
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
                ))}
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

        <footer className="mt-14 flex flex-col items-start justify-between gap-2 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center">
          <p>
            Amber · Deterministic fundamental analysis from SEC EDGAR 10-K XBRL filings. Not investment advice.
          </p>
          <p className="font-mono-num">
            {entries.length} tickers · Neon Postgres + Vercel ISR
          </p>
        </footer>
      </main>
    </div>
  );
}
