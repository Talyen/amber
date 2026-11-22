"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Plus, X } from "lucide-react";
import type { SearchIndexEntry } from "@/data/universe";
import { TopNav } from "@/components/TopNav";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";
import { exportComparisonCard } from "@/lib/export-card";
import { exportComparisonCsv } from "@/lib/export-csv";

const PRESETS: Array<{ label: string; tickers: string[] }> = [
  { label: "AI & Cloud", tickers: ["PLTR", "NVDA", "MSFT", "ORCL"] },
  { label: "High-SBC SaaS", tickers: ["SNOW", "CRWD", "DDOG", "NET"] },
  { label: "Cash Flow Kings", tickers: ["V", "MA", "AAPL", "COST"] },
];

interface CompareStudioProps {
  entries: SearchIndexEntry[];
}

export function CompareStudio({ entries }: CompareStudioProps) {
  const byTicker = useMemo(
    () => new Map(entries.map((e) => [e.ticker, e])),
    [entries]
  );

  const [selectedTickers, setSelectedTickers] = useState<string[]>([
    "PLTR",
    "SNOW",
    "NVDA",
    "COST",
  ]);
  const [addQuery, setAddQuery] = useState("");
  const hydratedRef = useRef(false);

  // Hydrate ?t=PLTR,SNOW,NOW from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("t");
    if (raw) {
      const parsed = raw
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter((t) => byTicker.has(t))
        .slice(0, 4);
      if (parsed.length >= 1) {
        setSelectedTickers(parsed);
      }
    }
    hydratedRef.current = true;
  }, [byTicker]);

  // Keep ?t= synced cleanly for 1-click Share
  useEffect(() => {
    if (!hydratedRef.current || selectedTickers.length === 0) return;
    const url = new URL(window.location.href);
    url.searchParams.set("t", selectedTickers.join(","));
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [selectedTickers]);

  const selectedItems = useMemo(
    () =>
      selectedTickers
        .map((t) => byTicker.get(t))
        .filter((x): x is SearchIndexEntry => Boolean(x)),
    [selectedTickers, byTicker]
  );

  const suggestions = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return [];
    return entries
      .filter(
        (e) =>
          !selectedTickers.includes(e.ticker) &&
          (e.ticker.toLowerCase().includes(q) ||
            e.name.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [addQuery, entries, selectedTickers]);

  function addTicker(ticker: string) {
    if (selectedTickers.length >= 4 || selectedTickers.includes(ticker)) return;
    setSelectedTickers((prev) => [...prev, ticker]);
    setAddQuery("");
  }

  function removeTicker(ticker: string) {
    if (selectedTickers.length <= 1) return;
    setSelectedTickers((prev) => prev.filter((t) => t !== ticker));
  }

  const maxTrueMargin = Math.max(
    10,
    ...selectedItems.map((i) => Math.abs(i.trueFcfMargin))
  );
  const maxSbcPct = Math.max(
    5,
    ...selectedItems.map((i) => i.sbcPctRevenue)
  );
  const maxImplied = Math.max(
    10,
    ...selectedItems.map((i) => Math.abs(i.impliedCagr))
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="compare" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        {/* Header */}
        <section className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
              AMBER COMPARISON STUDIO
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
              Side-by-Side Fundamental Comparison
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Compare up to 4 companies on True FCF, SBC burden, dilution, and market-implied growth.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => exportComparisonCsv(selectedItems)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => exportComparisonCard(selectedItems)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3.5 text-xs font-semibold text-[var(--amber)] transition-opacity hover:opacity-90 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Export PNG
            </button>
          </div>
        </section>

        {/* Presets & Active Ticker Slots */}
        <section className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {selectedItems.map((item) => (
              <span
                key={item.ticker}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 py-1.5 text-xs"
              >
                <Link
                  href={`/t/${item.ticker}`}
                  className="font-mono-num font-semibold text-[var(--amber)] hover:underline"
                >
                  {item.ticker}
                </Link>
                <span className="hidden text-[var(--text-secondary)] sm:inline">
                  {item.name}
                </span>
                {selectedItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTicker(item.ticker)}
                    aria-label={`Remove ${item.ticker}`}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            ))}

            {selectedItems.length < 4 && (
              <div className="relative">
                <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
                  <Plus className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                    placeholder="Add ticker…"
                    aria-label="Add company to comparison"
                    className="w-28 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  />
                </div>

                {suggestions.length > 0 && (
                  <ul className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-xl">
                    {suggestions.map((s) => (
                      <li key={s.ticker}>
                        <button
                          type="button"
                          onClick={() => addTicker(s.ticker)}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-[var(--surface-subtle)] cursor-pointer"
                        >
                          <span className="font-mono-num font-semibold text-[var(--amber)]">
                            {s.ticker}
                          </span>
                          <span className="truncate text-[var(--text-secondary)]">
                            {s.name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--text-muted)]">Presets:</span>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  setSelectedTickers(
                    preset.tickers.filter((t) => byTicker.has(t))
                  )
                }
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        {/* Visual Metric Comparison Cards */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* True FCF Margin */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              True FCF Margin (FCF − SBC)
            </div>
            <div className="mt-4 space-y-3.5">
              {selectedItems.map((item) => (
                <div key={item.ticker}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                      {item.ticker}
                    </span>
                    <span
                      className={`font-mono-num font-semibold ${
                        item.trueFcfMargin >= 0
                          ? "text-[var(--amber)]"
                          : "text-[var(--negative)]"
                      }`}
                    >
                      {formatPct(item.trueFcfMargin)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${Math.min(100, (Math.abs(item.trueFcfMargin) / maxTrueMargin) * 100)}%`,
                        backgroundColor:
                          item.trueFcfMargin >= 0
                            ? "var(--amber)"
                            : "var(--negative)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SBC Burden */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              SBC Burden (% of Revenue)
            </div>
            <div className="mt-4 space-y-3.5">
              {selectedItems.map((item) => (
                <div key={item.ticker}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                      {item.ticker}
                    </span>
                    <span className="font-mono-num font-semibold text-[var(--sbc)]">
                      {formatPct(item.sbcPctRevenue)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--sbc)] transition-all duration-200"
                      style={{
                        width: `${Math.min(100, (item.sbcPctRevenue / maxSbcPct) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Implied 10Y Revenue CAGR */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Implied 10Y Revenue CAGR
            </div>
            <div className="mt-4 space-y-3.5">
              {selectedItems.map((item) => (
                <div key={item.ticker}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                      {item.ticker}
                    </span>
                    <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                      {formatPct(item.impliedCagr)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--text-primary)] opacity-75 transition-all duration-200"
                      style={{
                        width: `${Math.min(100, (Math.abs(item.impliedCagr) / maxImplied) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Full Side-by-Side Comparison Ledger */}
        <section className="mt-6">
          <div
            tabIndex={0}
            role="region"
            aria-label="Side-by-side financial comparison table"
            className="amber-table-wrapper"
          >
            <table className="amber-table">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  {selectedItems.map((item) => (
                    <th key={item.ticker} scope="col" className="font-mono-num">
                      <Link
                        href={`/t/${item.ticker}`}
                        className="text-[var(--amber)] hover:underline"
                      >
                        {item.ticker}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Market Cap</th>
                  {selectedItems.map((i) => (
                    <td key={i.ticker} data-label={i.ticker} className="font-mono-num">
                      {formatCurrencyCompact(i.marketCap)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Revenue (Latest FY)</th>
                  {selectedItems.map((i) => (
                    <td key={i.ticker} data-label={i.ticker} className="font-mono-num">
                      {formatCurrencyCompact(i.revenue)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Reported FCF</th>
                  {selectedItems.map((i) => (
                    <td key={i.ticker} data-label={i.ticker} className="font-mono-num">
                      {formatCurrencyCompact(i.reportedFcf)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Stock-Based Comp (SBC)</th>
                  {selectedItems.map((i) => (
                    <td
                      key={i.ticker}
                      data-label={i.ticker}
                      className="font-mono-num text-[var(--sbc)]"
                    >
                      {formatCurrencyCompact(i.sbc)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">True FCF (FCF − SBC)</th>
                  {selectedItems.map((i) => (
                    <td
                      key={i.ticker}
                      data-label={i.ticker}
                      className={`font-mono-num font-semibold ${
                        i.trueFcf >= 0
                          ? "text-[var(--amber)]"
                          : "text-[var(--negative)]"
                      }`}
                    >
                      {formatCurrencyCompact(i.trueFcf)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Net Share Dilution (4Y CAGR)</th>
                  {selectedItems.map((i) => (
                    <td
                      key={i.ticker}
                      data-label={i.ticker}
                      className={`font-mono-num ${
                        i.netDilutionCagr > 1.5
                          ? "text-[var(--negative)]"
                          : i.netDilutionCagr < -0.5
                            ? "text-[var(--positive)]"
                            : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {formatPct(i.netDilutionCagr, true)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Implied 10Y Revenue CAGR</th>
                  {selectedItems.map((i) => (
                    <td
                      key={i.ticker}
                      data-label={i.ticker}
                      className="font-mono-num font-semibold"
                    >
                      {formatPct(i.impliedCagr)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
