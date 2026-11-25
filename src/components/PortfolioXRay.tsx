"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Download,
  DollarSign,
  FileDiff,
  Percent,
  Trophy,
  UserCheck,
} from "lucide-react";
import type { SearchIndexEntry } from "@/data/search-index";
import { authClient } from "@/lib/auth-client";
import { useWatchlist } from "@/lib/watchlist";
import { TopNav } from "@/components/TopNav";
import { LockPortfolioModal } from "@/components/LockPortfolioModal";
import { formatPct } from "@/lib/finance";
import { exportPortfolioXRayCard } from "@/lib/export-card";
import { parsePortfolioHoldings, serializePortfolioHoldings } from "@/lib/portfolio-link";
import {
  computePortfolioThesisSummary,
  readAllLocalValuationPresets,
  type SavedValuationPreset,
} from "@/lib/valuation-presets";

const STARTER_TICKERS = ["AAPL", "MSFT", "NVDA", "COST", "META"];

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
  const [myArenaState, setMyArenaState] = useState<{
    userId: string;
    portfolio: {
      id: string;
      title: string;
      handle: string;
      nav: number;
    } | null;
  } | null>(null);
  const sessionUserId = session?.user?.id ?? null;
  const myArena =
    sessionUserId && myArenaState?.userId === sessionUserId
      ? myArenaState.portfolio
      : null;
  const [initialLocation, setInitialLocation] = useState<{ addTicker?: string; hasSharedLink?: boolean } | null>(null);
  const [savedPresets, setSavedPresets] = useState<Record<string, SavedValuationPreset>>({});
  const [portfolioSaveStatus, setPortfolioSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [holdingSignals, setHoldingSignals] = useState<{
    diffs: Array<{
      id: string;
      ticker: string;
      filingType: string;
      filingDate: string;
      section: string;
      materiality: string;
      headline: string;
      summary: string;
    }>;
    insiderBuys: Array<{
      id: string;
      ticker: string;
      filingDate: string;
      insiderName: string;
      insiderTitle: string;
      totalValue: number;
    }>;
  }>({ diffs: [], insiderBuys: [] });

  // Hydrate saved valuation presets (localStorage + account sync when signed in)
  useEffect(() => {
    let active = true;
    const local = readAllLocalValuationPresets(sessionUserId);
    queueMicrotask(() => {
      if (active) setSavedPresets(local);
    });
    if (!sessionUserId) {
      return () => {
        active = false;
      };
    }
    const controller = new AbortController();
    fetch("/api/valuation-presets", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { presets?: SavedValuationPreset[] } | null) => {
        if (!active || !data?.presets) return;
        const merged: Record<string, SavedValuationPreset> = { ...local };
        for (const preset of data.presets) {
          const existing = merged[preset.ticker];
          if (
            !existing ||
            Date.parse(preset.updatedAt) >= Date.parse(existing.updatedAt)
          ) {
            merged[preset.ticker] = preset;
          }
        }
        setSavedPresets(merged);
      })
      .catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, [sessionUserId]);

  // Fetch signed-in user's Arena status banner
  useEffect(() => {
    if (!sessionUserId) {
      return;
    }
    let active = true;
    fetch("/api/arena/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { portfolio?: { id: string; title: string; handle: string; nav: number } | null } | null) => {
        if (active) setMyArenaState({ userId: sessionUserId, portfolio: data?.portfolio ?? null });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionUserId]);

  // Hydrate shareable ?h=AAPL:25,MSFT:25 or ?add=NVDA URL on mount
  useEffect(() => {
    if (initialLocation) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("h");
      if (raw !== null) {
        const parsed = parsePortfolioHoldings(raw, byTicker);
        if (parsed.size > 0 || raw === "") {
          setSharedTickers([...parsed.keys()]);
          setWeights(Object.fromEntries(parsed));
        }
      }

      const addTicker = params.get("add")?.trim().toUpperCase();
      setInitialLocation({
        addTicker: raw === null && addTicker && byTicker.has(addTicker) ? addTicker : undefined,
        hasSharedLink: raw !== null,
      });
    });
    return () => {
      active = false;
    };
  }, [byTicker, initialLocation]);

  // Hydrate account-synced working portfolio when signed in (unless viewing a shared ?h= link)
  useEffect(() => {
    if (!sessionUserId || !initialLocation || initialLocation.hasSharedLink) return;
    const controller = new AbortController();
    fetch("/api/portfolio", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            portfolio?: {
              inputMode: "weight" | "dollars";
              holdings: Array<{ ticker: string; value: number }>;
            } | null;
          } | null
        ) => {
          if (controller.signal.aborted || !data?.portfolio?.holdings?.length) return;
          const valid = data.portfolio.holdings.filter((item) => byTicker.has(item.ticker));
          if (valid.length === 0) return;
          setSharedTickers(valid.map((item) => item.ticker));
          if (data.portfolio.inputMode === "dollars") {
            setInputMode("dollars");
            setDollars(Object.fromEntries(valid.map((item) => [item.ticker, item.value])));
          } else {
            setInputMode("weight");
            setWeights(Object.fromEntries(valid.map((item) => [item.ticker, item.value])));
          }
        }
      )
      .catch(() => {});
    return () => controller.abort();
  }, [sessionUserId, initialLocation, byTicker]);

  const addTicker = initialLocation?.addTicker;
  const activeTickers = useMemo(() => {
    if (sharedTickers !== null) return sharedTickers;
    const base = watchlist.tickers.length > 0 ? watchlist.tickers : STARTER_TICKERS;
    return addTicker && !base.includes(addTicker) ? [addTicker, ...base] : base;
  }, [addTicker, sharedTickers, watchlist.tickers]);
  const usingStarter = sharedTickers === null && !addTicker && watchlist.tickers.length === 0;

  const holdings = useMemo(
    () =>
      activeTickers
        .map((t) => byTicker.get(t))
        .filter((x): x is SearchIndexEntry => Boolean(x)),
    [activeTickers, byTicker]
  );

  const holdingsKey = holdings.map((h) => h.ticker).join(",");
  useEffect(() => {
    if (!holdingsKey) return;
    const controller = new AbortController();
    fetch(`/api/portfolio/signals?tickers=${encodeURIComponent(holdingsKey)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: typeof holdingSignals | null) => {
        if (!controller.signal.aborted && data) {
          setHoldingSignals({
            diffs: Array.isArray(data.diffs) ? data.diffs : [],
            insiderBuys: Array.isArray(data.insiderBuys) ? data.insiderBuys : [],
          });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [holdingsKey]);

  async function handleSavePortfolio() {
    if (!sessionUserId || holdings.length === 0 || portfolioSaveStatus === "saving") return;
    setPortfolioSaveStatus("saving");
    try {
      const payload = {
        inputMode,
        holdings: holdings.map((h) => ({
          ticker: h.ticker,
          value:
            inputMode === "dollars"
              ? Math.max(0, dollars[h.ticker] ?? 10_000)
              : Math.max(0, weights[h.ticker] ?? 10),
        })),
      };
      const res = await fetch("/api/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      setPortfolioSaveStatus("saved");
      window.setTimeout(() => setPortfolioSaveStatus("idle"), 2000);
    } catch {
      setPortfolioSaveStatus("failed");
    }
  }

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
        : weights[h.ticker] ?? 10
    );
    const max = Math.max(1, ...raw);
    const scaled = raw.map((weight) => weight / max);
    const sum = scaled.reduce((a, b) => a + b, 0) || 1;
    return new Map(holdings.map((h, i) => [h.ticker, scaled[i] / sum]));
  }, [holdings, weights, dollars, inputMode]);
  const hasAllocation = [...normalizedWeights.values()].some((weight) => weight > 0);

  // Keep the address shareable once the incoming link has been applied.
  useEffect(() => {
    if (!initialLocation) return;
    if (usingStarter && Object.keys(weights).length === 0 && inputMode === "weight") {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("h", serializePortfolioHoldings(normalizedWeights));
    url.searchParams.delete("add");
    if (url.href !== window.location.href) {
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, [initialLocation, normalizedWeights, usingStarter, weights, inputMode]);

  const metrics = useMemo(() => {
    let wImplied = 0;
    let wTrueMargin = 0;
    let wSbcPct = 0;
    let wDilution = 0;
    let allocatedCount = 0;
    let highGrowthCount = 0;
    let highSbcCount = 0;
    const sectorWeights = new Map<string, number>();

    for (const h of holdings) {
      const w = normalizedWeights.get(h.ticker) ?? 0;
      if (w <= 0) continue;
      allocatedCount++;
      if (h.impliedCagr >= 16) highGrowthCount++;
      if (h.sbcPctRevenue >= 12) highSbcCount++;
      wImplied += h.impliedCagr * w;
      wTrueMargin += h.trueFcfMargin * w;
      wSbcPct += h.sbcPctRevenue * w;
      wDilution += h.netDilutionCagr * w;
      sectorWeights.set(h.sector, (sectorWeights.get(h.sector) ?? 0) + w * 100);
    }

    const sectors = [...sectorWeights.entries()].sort((a, b) => b[1] - a[1]);

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
        text: `High expectations bar: ${highGrowthCount} of ${allocatedCount} holdings price in ≥16%/yr revenue growth for a decade.`,
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

  const thesisSummary = useMemo(
    () => computePortfolioThesisSummary(holdings, normalizedWeights, savedPresets),
    [holdings, normalizedWeights, savedPresets]
  );

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
    // Keep portfolio draft decoupled from the user's global Watchlist
    setSharedTickers((prev) => {
      const base = prev ?? activeTickers;
      return base.includes(ticker) ? base : [...base, ticker];
    });
    setAddQuery("");
  }

  function removeFromPortfolio(ticker: string) {
    setSharedTickers((prev) => {
      const base = prev ?? activeTickers;
      return base.filter((t) => t !== ticker);
    });
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
      const weight = m[2] ? Number(m[2]) : 10;
      parsedWeights[ticker] = Number.isFinite(weight) ? weight : 10;
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
                {myArena.handle}
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
              {hasAllocation && <span
                className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${metrics.valuationStance.tone}`}
              >
                {metrics.valuationStance.label}
              </span>}
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

            {sessionUserId && (
              <button
                type="button"
                onClick={handleSavePortfolio}
                disabled={!hasAllocation || portfolioSaveStatus === "saving"}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer disabled:opacity-50"
              >
                {portfolioSaveStatus === "saved" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[var(--positive)]" />
                    Saved
                  </>
                ) : (
                  <>
                    <Bookmark className="h-3.5 w-3.5" />
                    {portfolioSaveStatus === "saving" ? "Saving…" : "Save Portfolio"}
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleExportPng}
              disabled={!hasAllocation}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3 text-xs font-semibold text-[var(--amber)] transition-opacity hover:opacity-90 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              PNG
            </button>

            <LockPortfolioModal
              positions={[...normalizedWeights]
                .filter(([, weight]) => weight > 0)
                .map(([ticker, weight]) => ({ ticker, weight: weight * 100 }))}
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
              className="h-9 shrink-0 rounded-md bg-[var(--cta-bg)] px-4 text-xs font-semibold text-[var(--cta-fg)] ring-1 ring-inset ring-white/15 transition-colors hover:bg-[var(--cta-bg-hover)] cursor-pointer"
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
              {hasAllocation ? formatPct(metrics.wImplied) : "—"}
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
              {hasAllocation ? formatPct(metrics.wTrueMargin) : "—"}
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
              {hasAllocation ? formatPct(metrics.wSbcPct) : "—"}
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
              {hasAllocation ? formatPct(metrics.wDilution, true) : "—"}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
              Annual share count drift
            </div>
          </div>
        </section>

        {/* Saved Theses Summary Strip */}
        {hasAllocation && thesisSummary.coveredCount > 0 && thesisSummary.weightedIrrPct !== null && (
          <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <div>
                <span className="text-[var(--text-muted)]">Saved Theses Est. 5Y CAGR: </span>
                <strong
                  className={`font-mono-num text-sm ${
                    thesisSummary.weightedIrrPct >= 12
                      ? "text-[var(--positive)]"
                      : thesisSummary.weightedIrrPct >= 8
                        ? "text-[var(--amber)]"
                        : "text-[var(--negative)]"
                  }`}
                >
                  {formatPct(thesisSummary.weightedIrrPct, true)}/yr
                </strong>
              </div>
              {thesisSummary.weightedUpsidePct !== null && (
                <div>
                  <span className="text-[var(--text-muted)]">Weighted Upside: </span>
                  <strong className="font-mono-num text-[var(--text-primary)]">
                    {formatPct(thesisSummary.weightedUpsidePct, true)}
                  </strong>
                </div>
              )}
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">
              Based on {thesisSummary.coveredCount} of {thesisSummary.totalAllocatedCount} holdings ({thesisSummary.coveredWeightPct}% of weight)
            </span>
          </section>
        )}

        {/* Reality Check Flags + Sector Exposure */}
        {hasAllocation && <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
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
        </div>}

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
                  <th scope="col">Saved Thesis</th>
                  {!usingStarter && (
                    <th scope="col" className="w-10">
                      <span className="sr-only">Remove</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {holdings.length === 0 && (
                  <tr>
                    <td colSpan={8}>Add a ticker or paste holdings to analyze a portfolio.</td>
                  </tr>
                )}
                {holdings.map((h) => {
                  const pct = (normalizedWeights.get(h.ticker) ?? 0) * 100;
                  const thesis = thesisSummary.byTicker[h.ticker];
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
                                    Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0
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
                              min={0}
                              max={Math.max(100, weights[h.ticker] ?? 10)}
                              step="any"
                              value={weights[h.ticker] ?? 10}
                              onChange={(e) =>
                                setWeights((prev) => ({
                                  ...prev,
                                  [h.ticker]: e.target.valueAsNumber,
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
                      <td data-label="Saved Thesis" className="font-mono-num">
                        {thesis ? (
                          <Link
                            href={`/t/${h.ticker}?tab=dcf&model=scenario`}
                            title={thesis.thesisNote ?? `${thesis.lens.toUpperCase()} thesis — Fair value $${thesis.fairValueToday.toFixed(2)}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] font-semibold hover:border-[var(--amber-border)]"
                          >
                            <span
                              className={
                                thesis.irrPct >= 12
                                  ? "text-[var(--positive)]"
                                  : thesis.irrPct >= 8
                                    ? "text-[var(--amber)]"
                                    : "text-[var(--negative)]"
                              }
                            >
                              {formatPct(thesis.irrPct, true)}/yr
                            </span>
                            <span className="text-[10px] uppercase text-[var(--text-muted)]">
                              {thesis.lens}
                            </span>
                          </Link>
                        ) : (
                          <Link
                            href={`/t/${h.ticker}?tab=dcf&model=scenario`}
                            className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--amber)]"
                          >
                            + Thesis
                          </Link>
                        )}
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
        {/* Holdings Radar: Live SEC Filing Diffs, 8-Ks & Insider Buys for Portfolio Positions */}
        {(holdingSignals.diffs.length > 0 || holdingSignals.insiderBuys.length > 0) && (
          <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Holdings Radar
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Recent SEC 10-K/10-Q prose diffs, Form 8-K events, and Form 4 insider buys across your portfolio.
                </p>
              </div>
              <Link
                href="/feed"
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--amber)] hover:underline"
              >
                Full Signal Feed
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {holdingSignals.diffs.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    <FileDiff className="h-3.5 w-3.5 text-[var(--amber)]" />
                    Filing Diffs & 8-K Events
                  </div>
                  <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--bg)]">
                    {holdingSignals.diffs.slice(0, 5).map((d) => (
                      <Link
                        key={d.id}
                        href={`/t/${d.ticker}?tab=diffs`}
                        className="block px-3.5 py-2.5 transition-colors hover:bg-[var(--surface-subtle)]"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono-num font-semibold text-[var(--amber)]">
                            {d.ticker} · {d.filingType}
                          </span>
                          <span className="font-mono-num text-[var(--text-muted)]">
                            {d.filingDate}
                          </span>
                        </div>
                        <div className="mt-1 text-xs font-medium text-[var(--text-primary)] line-clamp-1">
                          {d.headline}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--text-secondary)] line-clamp-2">
                          {d.summary}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {holdingSignals.insiderBuys.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    <UserCheck className="h-3.5 w-3.5 text-[var(--positive)]" />
                    Open-Market Insider Buys (Form 4)
                  </div>
                  <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--bg)]">
                    {holdingSignals.insiderBuys.slice(0, 5).map((b) => (
                      <Link
                        key={b.id}
                        href={`/t/${b.ticker}?tab=insiders`}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-[var(--surface-subtle)]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono-num font-semibold text-[var(--amber)]">
                              {b.ticker}
                            </span>
                            <span className="truncate font-medium text-[var(--text-primary)]">
                              {b.insiderName}
                            </span>
                          </div>
                          <div className="truncate text-[11px] text-[var(--text-muted)]">
                            {b.insiderTitle} · {b.filingDate}
                          </div>
                        </div>
                        <span className="font-mono-num shrink-0 text-xs font-semibold text-[var(--positive)]">
                          {b.totalValue >= 1
                            ? `$${b.totalValue.toFixed(2)}M`
                            : `$${Math.round(b.totalValue * 1000)}K`}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
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
