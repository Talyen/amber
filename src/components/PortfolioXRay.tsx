"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  X,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  Download,
  DollarSign,
  Percent,
  Trophy,
} from "lucide-react";
import type { SearchIndexEntry } from "@/data/universe";
import { authClient } from "@/lib/auth-client";
import { useWatchlist } from "@/lib/watchlist";
import { TopNav } from "@/components/TopNav";
import { LockPortfolioModal } from "@/components/LockPortfolioModal";
import { formatPct } from "@/lib/finance";
import { exportPortfolioXRayCard } from "@/lib/export-card";

const STARTER_TICKERS = ["AAPL", "MSFT", "NVDA", "COST", "PLTR"];

interface PortfolioXRayProps {
  entries: SearchIndexEntry[];
}

export function PortfolioXRay({ entries }: PortfolioXRayProps) {
  const { data: session } = authClient.useSession();
  const watchlist = useWatchlist();
  const byTicker = useMemo(
    () => new Map(entries.map((e) => [e.ticker, e])),
    [entries]
  );

  const [addQuery, setAddQuery] = useState("");
  const [pasteInput, setPasteInput] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [inputMode, setInputMode] = useState<"weight" | "dollars">("weight");
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [dollars, setDollars] = useState<Record<string, number>>({});
  const [sharedTickers, setSharedTickers] = useState<string[] | null>(null);
  const [myArena, setMyArena] = useState<{
    id: string;
    title: string;
    handle: string;
    nav: number;
  } | null>(null);
  const hydratedRef = useRef(false);

  // Fetch signed-in user's Arena status banner
  useEffect(() => {
    if (!session?.user) {
      setMyArena(null);
      return;
    }
    let active = true;
    fetch("/api/arena/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { portfolio?: { id: string; title: string; handle: string; nav: number } | null } | null) => {
        if (active) setMyArena(data?.portfolio ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.user]);

  // Hydrate shareable ?h=AAPL:25,MSFT:25 or ?add=NVDA URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("h");
    const addParam = params.get("add")?.trim().toUpperCase();
    if (raw) {
      const parsedTickers: string[] = [];
      const parsedWeights: Record<string, number> = {};
      for (const pair of raw.split(",")) {
        const [tRaw, wRaw] = pair.split(":");
        const t = (tRaw ?? "").trim().toUpperCase();
        const w = parseFloat(wRaw ?? "10");
        if (byTicker.has(t) && !parsedTickers.includes(t)) {
          parsedTickers.push(t);
          parsedWeights[t] = Number.isFinite(w) && w > 0 ? w : 10;
        }
      }
      if (parsedTickers.length > 0) {
        setSharedTickers(parsedTickers);
        setWeights(parsedWeights);
      }
    } else if (addParam && byTicker.has(addParam)) {
      setSharedTickers((prev) => {
        const base = prev ?? (watchlist.tickers.length > 0 ? watchlist.tickers : STARTER_TICKERS);
        return base.includes(addParam) ? base : [addParam, ...base];
      });
    }
    hydratedRef.current = true;
  }, [byTicker, watchlist.tickers]);

  const activeTickers =
    sharedTickers && sharedTickers.length > 0
      ? sharedTickers
      : watchlist.tickers.length > 0
        ? watchlist.tickers
        : STARTER_TICKERS;
  const usingStarter = !sharedTickers && watchlist.tickers.length === 0;

  const holdings = useMemo(
    () =>
      activeTickers
        .map((t) => byTicker.get(t))
        .filter((x): x is SearchIndexEntry => Boolean(x)),
    [activeTickers, byTicker]
  );

  const totalDollars = useMemo(() => {
    if (inputMode !== "dollars") return 0;
    return holdings.reduce(
      (sum, h) => sum + Math.max(0, dollars[h.ticker] ?? 10_000),
      0
    );
  }, [holdings, dollars, inputMode]);

  const normalizedWeights = useMemo(() => {
    const raw = holdings.map((h) =>
      inputMode === "dollars"
        ? Math.max(0, dollars[h.ticker] ?? 10_000)
        : Math.max(1, weights[h.ticker] ?? 10)
    );
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    return new Map(holdings.map((h, i) => [h.ticker, raw[i] / sum]));
  }, [holdings, weights, dollars, inputMode]);

  // Keep ?h= synced cleanly in URL so Share button captures exact portfolio & weights
  useEffect(() => {
    if (!hydratedRef.current || holdings.length === 0) return;
    if (usingStarter && Object.keys(weights).length === 0 && inputMode === "weight") {
      return;
    }
    const encoded = holdings
      .map((h) => `${h.ticker}:${Math.round((normalizedWeights.get(h.ticker) ?? 0) * 100)}`)
      .join(",");
    const url = new URL(window.location.href);
    url.searchParams.set("h", encoded);
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [holdings, normalizedWeights, usingStarter, weights, inputMode]);

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

    const valuationStance =
      wImplied <= 10.5
        ? {
            label: "Attractive Bar",
            tone: "text-[var(--positive)] bg-[var(--surface-subtle)] ring-[var(--border-strong)]",
          }
        : wImplied <= 16
          ? {
              label: "Balanced Expectations",
              tone: "text-[var(--amber)] bg-[var(--amber-soft)] ring-[var(--amber-border)]",
            }
          : {
              label: "Stretched / High Bar",
              tone: "text-[var(--negative)] bg-[var(--surface-subtle)] ring-[var(--border-strong)]",
            };

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
      valuationStance,
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
    if (sharedTickers) {
      setSharedTickers((prev) => (prev ? [...prev, ticker] : [ticker]));
    } else {
      if (usingStarter) {
        for (const s of STARTER_TICKERS) watchlist.toggle(s);
      }
      watchlist.toggle(ticker);
    }
    setAddQuery("");
  }

  function removeFromPortfolio(ticker: string) {
    if (sharedTickers) {
      setSharedTickers((prev) => (prev ? prev.filter((t) => t !== ticker) : null));
    } else {
      watchlist.toggle(ticker);
    }
  }

  function applyQuickPaste(e: React.FormEvent) {
    e.preventDefault();
    const tokens = pasteInput
      .split(/[,\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedTickers: string[] = [];
    const parsedWeights: Record<string, number> = {};

    for (const token of tokens) {
      // Matches "NVDA 30%", "NVDA:30", or "NVDA"
      const m = token.match(/^([A-Za-z0-9.-]{1,10})(?:[\s:=]+(\d+(?:\.\d+)?)\s*%?)?$/);
      if (!m) continue;
      const ticker = m[1].toUpperCase();
      if (!byTicker.has(ticker) || parsedTickers.includes(ticker)) continue;
      parsedTickers.push(ticker);
      parsedWeights[ticker] = m[2] ? Math.max(1, parseFloat(m[2])) : 10;
    }

    if (parsedTickers.length > 0) {
      setSharedTickers(parsedTickers);
      setWeights(parsedWeights);
      setInputMode("weight");
      setPasteOpen(false);
      setPasteInput("");
    }
  }

  function handleExportPng() {
    exportPortfolioXRayCard({
      holdings: holdings.map((h) => ({
        ticker: h.ticker,
        weightPct: (normalizedWeights.get(h.ticker) ?? 0) * 100,
        impliedCagr: h.impliedCagr,
        trueFcfMargin: h.trueFcfMargin,
      })),
      wImplied: metrics.wImplied,
      wTrueMargin: metrics.wTrueMargin,
      wSbcPct: metrics.wSbcPct,
      wDilution: metrics.wDilution,
      topSector: metrics.sectors[0] ?? null,
    });
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="portfolio" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        {myArena && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Trophy className="h-4 w-4 text-[var(--amber)]" aria-hidden="true" />
              <span className="font-semibold text-[var(--text-primary)]">
                Your Arena Portfolio: {myArena.title}
              </span>
              <span className="font-mono-num text-[var(--text-secondary)]">
                @{myArena.handle}
              </span>
            </div>
            <Link
              href={`/arena/${myArena.id}`}
              className="inline-flex items-center gap-1 font-semibold text-[var(--amber)] hover:underline"
            >
              View Leaderboard Entry
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}

        <section className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono-num text-xs font-semibold text-[var(--amber)]">
                PORTFOLIO ANALYZER
              </span>
              <span
                className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${metrics.valuationStance.tone}`}
              >
                {metrics.valuationStance.label}
              </span>
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
              What your portfolio is really betting on
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {usingStarter
                ? "Sample 5-stock basket. Add or paste your tickers, or publish to the Arena."
                : `${holdings.length} holdings analyzed for real cash flow, dilution, and priced-in growth.`}
            </p>
          </div>

          {/* Add Ticker + Export PNG */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="relative">
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
                  placeholder="Add ticker…"
                  aria-label="Add ticker to portfolio"
                  className="w-36 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none sm:w-40"
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

            <button
              type="button"
              onClick={() => setPasteOpen((prev) => !prev)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
              Quick Paste
            </button>

            <button
              type="button"
              onClick={handleExportPng}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3 text-xs font-semibold text-[var(--amber)] transition-opacity hover:opacity-90 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              PNG
            </button>

            <LockPortfolioModal
              positions={holdings.map((h) => ({
                ticker: h.ticker,
                weight: (normalizedWeights.get(h.ticker) ?? 0) * 100,
              }))}
            />
          </div>
        </section>

        {pasteOpen && (
          <form
            onSubmit={applyQuickPaste}
            className="mt-4 flex flex-col gap-2 rounded-xl border border-[var(--amber-border)] bg-[var(--amber-soft)] p-4 sm:flex-row sm:items-center"
          >
            <input
              type="text"
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              placeholder="Paste tickers & optional weights (e.g. NVDA 30%, MSFT 25%, PLTR 20%, COST 25%)"
              aria-label="Quick paste portfolio tickers"
              className="h-9 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
            />
            <button
              type="submit"
              className="h-9 shrink-0 rounded-md bg-[var(--amber)] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
            >
              Apply Portfolio
            </button>
          </form>
        )}

        {/* 4 Weighted Portfolio KPIs */}
        <section className="mt-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs text-[var(--text-muted)]">
              Implied 10Y Growth
            </div>
            <div className="font-mono-num mt-1.5 text-2xl font-semibold text-[var(--amber)]">
              {formatPct(metrics.wImplied)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
              Priced into your holdings
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs text-[var(--text-muted)]">
              True FCF Margin
            </div>
            <div className="font-mono-num mt-1.5 text-2xl font-semibold text-[var(--text-primary)]">
              {formatPct(metrics.wTrueMargin)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
              Cash after CapEx &amp; SBC
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs text-[var(--text-muted)]">
              SBC Burden
            </div>
            <div className="font-mono-num mt-1.5 text-2xl font-semibold text-[var(--sbc)]">
              {formatPct(metrics.wSbcPct)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
              Stock comp % of revenue
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs text-[var(--text-muted)]">
              Net Dilution
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-[var(--text-secondary)]">
              {inputMode === "dollars" ? (
                <span>
                  Total Portfolio Value:{" "}
                  <strong className="font-mono-num text-[var(--text-primary)]">
                    ${totalDollars.toLocaleString()}
                  </strong>
                </span>
              ) : (
                <span>Drag sliders to adjust relative holding weights</span>
              )}
            </div>

            <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setInputMode("weight")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  inputMode === "weight"
                    ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Percent className="h-3 w-3" />
                Weights
              </button>
              <button
                type="button"
                onClick={() => setInputMode("dollars")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  inputMode === "dollars"
                    ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <DollarSign className="h-3 w-3" />
                Dollar Value
              </button>
            </div>
          </div>

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
                  <th scope="col">
                    {inputMode === "dollars" ? "Allocation ($)" : "Weight"}
                  </th>
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
                      <td
                        data-label={inputMode === "dollars" ? "Allocation ($)" : "Weight"}
                        className="font-mono-num"
                      >
                        {inputMode === "dollars" ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="text-[var(--text-muted)]">$</span>
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={dollars[h.ticker] ?? 10000}
                              onChange={(e) =>
                                setDollars((prev) => ({
                                  ...prev,
                                  [h.ticker]: Math.max(
                                    0,
                                    parseInt(e.target.value || "0", 10)
                                  ),
                                }))
                              }
                              aria-label={`${h.ticker} dollar allocation`}
                              className="h-7 w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 text-right text-xs text-[var(--text-primary)] focus:border-[var(--amber-border)] focus:outline-none"
                            />
                            <span className="w-9 text-right text-[11px] text-[var(--text-muted)]">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        ) : (
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
                        )}
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
                            onClick={() => removeFromPortfolio(h.ticker)}
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
