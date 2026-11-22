"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { SearchIndexEntry } from "@/data/universe";
import { useWatchlist } from "@/lib/watchlist";
import { TopNav } from "@/components/TopNav";
import { formatPct } from "@/lib/finance";

const STARTER_TICKERS = ["AAPL", "MSFT", "NVDA", "COST", "PLTR"];

interface PortfolioXRayProps {
  entries: SearchIndexEntry[];
}

export function PortfolioXRay({ entries }: PortfolioXRayProps) {
  const watchlist = useWatchlist();
  const byTicker = useMemo(
    () => new Map(entries.map((e) => [e.ticker, e])),
    [entries]
  );

  const [addQuery, setAddQuery] = useState("");
  const [weights, setWeights] = useState<Record<string, number>>({});

  const activeTickers =
    watchlist.tickers.length > 0 ? watchlist.tickers : STARTER_TICKERS;
  const usingStarter = watchlist.tickers.length === 0;

  const holdings = useMemo(
    () =>
      activeTickers
        .map((t) => byTicker.get(t))
        .filter((x): x is SearchIndexEntry => Boolean(x)),
    [activeTickers, byTicker]
  );

  const normalizedWeights = useMemo(() => {
    const raw = holdings.map((h) => Math.max(1, weights[h.ticker] ?? 10));
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    return new Map(holdings.map((h, i) => [h.ticker, raw[i] / sum]));
  }, [holdings, weights]);

  const metrics = useMemo(() => {
    let wImplied = 0;
    let wTrueMargin = 0;
    let wSbcPct = 0;
    let wDilution = 0;
    const sectorWeights = new Map<string, number>();

    for (const h of holdings) {
      const w = normalizedWeights.get(h.ticker) ?? 0;
      wImplied += h.impliedCagr * w;
      wTrueMargin += h.trueFcfMargin * w;
      wSbcPct += h.sbcPctRevenue * w;
      wDilution += h.netDilutionCagr * w;
      sectorWeights.set(h.sector, (sectorWeights.get(h.sector) ?? 0) + w * 100);
    }

    const sectors = [...sectorWeights.entries()].sort((a, b) => b[1] - a[1]);
    const highGrowthCount = holdings.filter((h) => h.impliedCagr >= 16).length;
    const highSbcCount = holdings.filter((h) => h.sbcPctRevenue >= 12).length;

    const flags: Array<{ tone: "warn" | "ok"; text: string }> = [];
    if (sectors[0] && sectors[0][1] >= 45) {
      flags.push({
        tone: "warn",
        text: `${sectors[0][1].toFixed(0)}% of your portfolio is concentrated in ${sectors[0][0]}.`,
      });
    }
    if (wImplied >= 15) {
      flags.push({
        tone: "warn",
        text: `High expectations bar: ${highGrowthCount} of ${holdings.length} holdings price in ≥16%/yr revenue growth for a decade.`,
      });
    } else {
      flags.push({
        tone: "ok",
        text: `Reasonable aggregate expectations: weighted implied growth sits at ${formatPct(wImplied)}/yr.`,
      });
    }
    if (highSbcCount >= 2 || wSbcPct >= 10) {
      flags.push({
        tone: "warn",
        text: `Elevated stock-comp drag (${formatPct(wSbcPct)} weighted SBC/Rev across ${highSbcCount} high-SBC holdings).`,
      });
    } else {
      flags.push({
        tone: "ok",
        text: `Clean earnings quality: weighted True FCF margin is ${formatPct(wTrueMargin)} with modest SBC drag (${formatPct(wSbcPct)}).`,
      });
    }

    return {
      wImplied,
      wTrueMargin,
      wSbcPct,
      wDilution,
      sectors,
      flags,
    };
  }, [holdings, normalizedWeights]);

  const suggestions = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return [];
    return entries
      .filter(
        (e) =>
          !activeTickers.includes(e.ticker) &&
          (e.ticker.toLowerCase().includes(q) ||
            e.name.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [addQuery, entries, activeTickers]);

  function addToPortfolio(ticker: string) {
    if (usingStarter) {
      for (const s of STARTER_TICKERS) watchlist.toggle(s);
    }
    watchlist.toggle(ticker);
    setAddQuery("");
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="portfolio" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <section className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
              PORTFOLIO X-RAY
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
              See what your watchlist is really betting on
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {usingStarter
                ? "Showing a sample 5-stock portfolio. Star any company across Amber (or add a ticker on the right) to X-Ray your own holdings—stored privately in your browser."
                : `Analyzing your ${holdings.length} watchlisted companies with weighted expectations, cash quality, and sector concentration.`}
            </p>
          </div>

          {/* Quick Add Ticker */}
          <div className="relative shrink-0">
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <Plus className="h-3.5 w-3.5 text-[var(--amber)]" />
              <input
                type="text"
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && suggestions[0]) {
                    e.preventDefault();
                    addToPortfolio(suggestions[0].ticker);
                  }
                }}
                placeholder="Add ticker to X-Ray…"
                aria-label="Add ticker to portfolio X-Ray"
                className="w-40 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
            </div>

            {suggestions.length > 0 && (
              <ul className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-xl">
                {suggestions.map((s) => (
                  <li key={s.ticker}>
                    <button
                      type="button"
                      onClick={() => addToPortfolio(s.ticker)}
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
        </section>

        {/* 4 Weighted Portfolio KPIs */}
        <section className="mt-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs text-[var(--text-muted)]">
              Weighted Implied 10Y Growth
            </div>
            <div className="font-mono-num mt-1.5 text-2xl font-semibold text-[var(--amber)]">
              {formatPct(metrics.wImplied)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
              Avg growth priced into your holdings
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs text-[var(--text-muted)]">
              Weighted True FCF Margin
            </div>
            <div className="font-mono-num mt-1.5 text-2xl font-semibold text-[var(--text-primary)]">
              {formatPct(metrics.wTrueMargin)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
              Real cash after CapEx &amp; SBC
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs text-[var(--text-muted)]">
              Weighted SBC Burden
            </div>
            <div className="font-mono-num mt-1.5 text-2xl font-semibold text-[var(--sbc)]">
              {formatPct(metrics.wSbcPct)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
              Stock comp as % of revenue
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs text-[var(--text-muted)]">
              Weighted Net Dilution
            </div>
            <div
              className={`font-mono-num mt-1.5 text-2xl font-semibold ${
                metrics.wDilution > 1
                  ? "text-[var(--negative)]"
                  : metrics.wDilution < -0.5
                    ? "text-[var(--positive)]"
                    : "text-[var(--text-primary)]"
              }`}
            >
              {formatPct(metrics.wDilution, true)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
              Annual share count drift
            </div>
          </div>
        </section>

        {/* Reality Check Flags + Sector Exposure */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Portfolio Reality Check
            </h2>
            <ul className="mt-3.5 space-y-2.5">
              {metrics.flags.map((flag, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]"
                >
                  {flag.tone === "warn" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" />
                  )}
                  <span>{flag.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Sector Concentration
            </h2>
            <div className="mt-3.5 space-y-3">
              {metrics.sectors.map(([sector, pct]) => (
                <div key={sector}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">{sector}</span>
                    <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--amber)]"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Holdings Allocation Table */}
        <section className="mt-6">
          <div
            tabIndex={0}
            role="region"
            aria-label="Portfolio holdings breakdown"
            className="amber-table-wrapper"
          >
            <table className="amber-table">
              <thead>
                <tr>
                  <th scope="col">Holding</th>
                  <th scope="col">Weight</th>
                  <th scope="col">True FCF Margin</th>
                  <th scope="col">SBC / Rev</th>
                  <th scope="col">Dilution (4Y)</th>
                  <th scope="col">Implied 10Y</th>
                  {!usingStarter && (
                    <th scope="col" className="w-10">
                      <span className="sr-only">Remove</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const pct = (normalizedWeights.get(h.ticker) ?? 0) * 100;
                  return (
                    <tr key={h.ticker}>
                      <th scope="row">
                        <Link
                          href={`/t/${h.ticker}`}
                          className="inline-flex items-center gap-2 hover:text-[var(--amber)]"
                        >
                          <span className="font-mono-num w-12 font-semibold text-[var(--amber)]">
                            {h.ticker}
                          </span>
                          <span className="font-medium text-[var(--text-primary)]">
                            {h.name}
                          </span>
                        </Link>
                      </th>
                      <td data-label="Weight" className="font-mono-num">
                        <div className="inline-flex items-center gap-2">
                          <input
                            type="range"
                            min={1}
                            max={50}
                            value={weights[h.ticker] ?? 10}
                            onChange={(e) =>
                              setWeights((prev) => ({
                                ...prev,
                                [h.ticker]: parseInt(e.target.value, 10),
                              }))
                            }
                            aria-label={`${h.ticker} relative weight`}
                            className="amber-range w-20"
                          />
                          <span className="w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td data-label="True FCF Margin" className="font-mono-num">
                        {formatPct(h.trueFcfMargin)}
                      </td>
                      <td
                        data-label="SBC / Rev"
                        className="font-mono-num text-[var(--sbc)]"
                      >
                        {formatPct(h.sbcPctRevenue)}
                      </td>
                      <td data-label="Dilution (4Y)" className="font-mono-num">
                        {formatPct(h.netDilutionCagr, true)}
                      </td>
                      <td
                        data-label="Implied 10Y"
                        className="font-mono-num font-semibold"
                      >
                        {formatPct(h.impliedCagr)}
                      </td>
                      {!usingStarter && (
                        <td data-label="Remove">
                          <button
                            type="button"
                            onClick={() => watchlist.toggle(h.ticker)}
                            aria-label={`Remove ${h.ticker}`}
                            className="text-[var(--text-muted)] hover:text-[var(--negative)] cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
