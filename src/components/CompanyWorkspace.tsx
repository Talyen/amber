"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Calculator,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileDiff,
  FileText,
  GitCompareArrows,
  LayoutDashboard,
  PieChart,
  Sparkles,
  Star,
  Table2,
  UserCheck,
} from "lucide-react";
import {
  type CompanySnapshot,
  computeCompanyValuation,
  computeFinancialSectorMetrics,
  computeQuarterlyMomentum,
  computeShareholderYieldMetrics,
  formatCurrencyCompact,
  formatPct,
  isFinancialInstitution as checkFinancialInstitution,
  isReit as checkIsReit,
} from "@/lib/finance";
import {
  buildTickerAiContext,
  buildTickerMarkdown,
  buildTickerPlainText,
} from "@/lib/export-markdown";
import { isFreshPriceDate } from "@/lib/market-price";
import { exportTrueFcfCard } from "@/lib/export-card";
import { valuationModelFromUrl } from "@/lib/valuation-link";
import { useWatchlist } from "@/lib/watchlist";
import type { SearchIndexEntry } from "@/data/search-index";
import type { SectorBenchmark } from "@/data/repository";
import { TopNav } from "@/components/TopNav";
import { CompanyBriefing } from "@/components/CompanyBriefing";
import { MoatQualityCard } from "@/components/MoatQualityCard";
import { RevenueSankey } from "@/components/RevenueSankey";
import { TrueFcfChart } from "@/components/TrueFcfChart";
import { TrueFcfWaterfall } from "@/components/TrueFcfWaterfall";
import { BuybackRealityCard } from "@/components/BuybackRealityCard";
import { FinancialLedgerTable } from "@/components/FinancialLedgerTable";
import { ReverseDcfStudio } from "@/components/ReverseDcfStudio";
import { ScenarioBuilder } from "@/components/ScenarioBuilder";
import { PriceVsFundamentalsChart } from "@/components/PriceVsFundamentalsChart";
import { HistoricalValuationBands } from "@/components/HistoricalValuationBands";
import { FilingDiffRadar } from "@/components/FilingDiffRadar";
import { FilingAlertModal } from "@/components/FilingAlertModal";
import { InsiderRadar, type InsiderTradeItem } from "@/components/InsiderRadar";
import { MethodologyModal } from "@/components/MethodologyModal";
import { SectorPeersTable } from "@/components/SectorPeersTable";
import { buildCompanyBriefing } from "@/lib/insights";

type ActiveTab = "overview" | "fcf" | "dcf" | "diffs" | "insiders";

interface CompanyWorkspaceProps {
  company: CompanySnapshot;
  insiderTrades?: InsiderTradeItem[];
  sectorBenchmark?: SectorBenchmark | null;
  sectorPeers?: SearchIndexEntry[];
}

export function CompanyWorkspace({
  company,
  insiderTrades = [],
  sectorBenchmark = null,
  sectorPeers = [],
}: CompanyWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [valuationMode, setValuationMode] = useState<"scenario" | "reverse">("scenario");
  const [fcfCadence, setFcfCadence] = useState<"annual" | "quarterly">("annual");
  const quarterlyMomentum = useMemo(
    () => computeQuarterlyMomentum(company.quarterlyFinancials ?? []),
    [company.quarterlyFinancials]
  );
  const yoyRevByQuarter = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const q of quarterlyMomentum.quarters) {
      map[q.fiscalYear] = q.yoyRevenueGrowthPct;
    }
    return map;
  }, [quarterlyMomentum.quarters]);
  const [restoredLocation, setRestoredLocation] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const watchlist = useWatchlist();
  const isStarred = watchlist.has(company.ticker);

  useEffect(() => {
    if (!copyMenuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setCopyMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setCopyMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [copyMenuOpen]);

  // Restore the tab and valuation model independently for older shared links.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      const model = valuationModelFromUrl(params);
      if (model) setValuationMode(model);
      if (
        tabParam === "overview" ||
        tabParam === "dcf" ||
        tabParam === "diffs" ||
        tabParam === "fcf" ||
        tabParam === "insiders"
      ) {
        setActiveTab(tabParam);
      } else if (model) {
        setActiveTab("dcf");
      }
      setRestoredLocation(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Sync active tab to URL so TopNav Share button always captures the exact tab
  useEffect(() => {
    if (!restoredLocation) return;
    const url = new URL(window.location.href);
    if (activeTab === "overview" && !valuationModelFromUrl(url.searchParams)) {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", activeTab);
    }
    if (activeTab === "dcf") url.searchParams.set("model", valuationMode);
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [activeTab, restoredLocation, valuationMode]);

  // Keyboard shortcuts: 1–5 switch analysis tabs when not focused in an input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "1") setActiveTab("overview");
      else if (e.key === "2") setActiveTab("fcf");
      else if (e.key === "3") setActiveTab("dcf");
      else if (e.key === "4") setActiveTab("diffs");
      else if (e.key === "5") setActiveTab("insiders");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Load @microsoft/focusgroup-polyfill only when native focusgroup is unsupported
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      typeof HTMLElement !== "undefined" &&
      !Object.hasOwn(HTMLElement.prototype, "focusGroup")
    ) {
      import("@microsoft/focusgroup-polyfill")
        .then((mod) => {
          if (typeof mod.polyfill === "function") {
            mod.polyfill(document.body);
          }
        })
        .catch(() => {
          // Graceful fallback: native button click/Tab navigation still works
        });
    }
  }, []);

  const { series, latest, enterpriseValue, netDilutionCagr, reverseDcf } =
    useMemo(() => computeCompanyValuation(company), [company]);
  const impliedGrowth = reverseDcf?.impliedRevenueCagrPct ?? null;
  const latestFy = useMemo(() => {
    const fy = series.filter((s) => s.fiscalYear !== "TTM");
    return fy[fy.length - 1] ?? latest;
  }, [series, latest]);
  const isFinancialInstitution = checkFinancialInstitution(company);
  const isReitCompany = checkIsReit(company);
  const financialMetrics = useMemo(
    () => (isFinancialInstitution ? computeFinancialSectorMetrics(company) : null),
    [company, isFinancialInstitution]
  );
  const shareholderYield = useMemo(
    () => computeShareholderYieldMetrics(company),
    [company]
  );
  const sectorValuationMultiple = isReitCompany ? financialMetrics?.priceToFfo : financialMetrics?.priceToTbv;
  const evToTrueFcf =
    reverseDcf && latest.trueFcf > 0 ? enterpriseValue / latest.trueFcf : null;
  const evToRepFcf =
    reverseDcf && latest.reportedFcf > 0 ? enterpriseValue / latest.reportedFcf : null;
  const openMarketBuys = useMemo(
    () => insiderTrades.filter((t) => t.transactionType === "Buy"),
    [insiderTrades]
  );
  const openMarketBuyTotal = useMemo(
    () => openMarketBuys.reduce((s, t) => s + t.totalValue, 0),
    [openMarketBuys]
  );
  const highSignalDiffCount = useMemo(
    () => company.filingDiffs.filter((d) => d.materiality === "High").length,
    [company.filingDiffs]
  );

  const briefing = useMemo(
    () =>
      buildCompanyBriefing(
        company,
        series,
        impliedGrowth,
        insiderTrades
      ),
    [company, series, impliedGrowth, insiderTrades]
  );

  const tabs: Array<{
    id: ActiveTab;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: string;
  }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "fcf", label: "Cash & Dilution", icon: Banknote },
    { id: "dcf", label: "Valuation", icon: Calculator },
    {
      id: "diffs",
      label: "Filing Diffs",
      icon: FileDiff,
      badge: String(company.filingDiffs.length),
    },
    {
      id: "insiders",
      label: "Insiders",
      icon: UserCheck,
      badge: insiderTrades.length > 0 ? String(insiderTrades.length) : undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeTicker={company.ticker} />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6">
        {/* Executive Header */}
        <section className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {company.ticker}
              </span>
              <span aria-hidden="true">/</span>
              <span>{company.exchange}</span>
              <span aria-hidden="true">/</span>
              <span>{company.sector}</span>
              {(company.lastFiling.type === "20-F" || company.lastFiling.type === "40-F") && (
                <>
                  <span aria-hidden="true">/</span>
                  <span
                    className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]"
                    title={`International ${company.lastFiling.type} filer normalized to USD`}
                  >
                    {company.lastFiling.type} · USD
                  </span>
                </>
              )}
            </div>

            <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
              {company.name}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
              {briefing.realityCheckSummary}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!watchlist.canEdit}
                onClick={() => watchlist.toggle(company.ticker)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors cursor-pointer disabled:cursor-wait ${
                  isStarred
                    ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Star
                  className="h-3.5 w-3.5"
                  fill={isStarred ? "currentColor" : "none"}
                />
                {isStarred ? "Following" : "Follow"}
              </button>

              <FilingAlertModal ticker={company.ticker} companyName={company.name} />

              <Link
                href={`/portfolio?add=${company.ticker}`}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                <PieChart className="h-3.5 w-3.5" />
                Add to Portfolio
              </Link>

              <Link
                href={`/compare?t=${[
                  company.ticker,
                  ...(sectorPeers.length > 0
                    ? sectorPeers.map((p) => p.ticker)
                    : ["NVDA", "MSFT", "AAPL", "COST", "META"]
                  )
                    .filter((t) => t !== company.ticker)
                    .slice(0, 3),
                ].join(",")}`}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                <GitCompareArrows className="h-3.5 w-3.5" />
                Compare
              </Link>

              <div ref={copyMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setCopyMenuOpen((prev) => !prev)}
                  aria-expanded={copyMenuOpen}
                  aria-haspopup="menu"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {copiedLabel ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[var(--positive)]" />
                      {copiedLabel}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                      <ChevronDown className="h-3 w-3 opacity-70" />
                    </>
                  )}
                </button>

                {copyMenuOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 z-40 mt-1.5 w-60 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1.5 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            buildTickerPlainText(
                              company,
                              series,
                              impliedGrowth,
                              window.location.origin
                            )
                          );
                          setCopiedLabel("Copied Text");
                          setCopyMenuOpen(false);
                          window.setTimeout(() => setCopiedLabel(null), 1800);
                        } catch {
                          // Ignore clipboard errors
                        }
                      }}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-subtle)] cursor-pointer"
                    >
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
                      <div>
                        <div className="text-xs font-medium text-[var(--text-primary)]">
                          Plain-text summary
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Messages, email, Slack, notes
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            buildTickerMarkdown(
                              company,
                              series,
                              impliedGrowth,
                              window.location.origin
                            )
                          );
                          setCopiedLabel("Copied Markdown");
                          setCopyMenuOpen(false);
                          window.setTimeout(() => setCopiedLabel(null), 1800);
                        } catch {
                          // Ignore clipboard errors
                        }
                      }}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-subtle)] cursor-pointer"
                    >
                      <Table2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
                      <div>
                        <div className="text-xs font-medium text-[var(--text-primary)]">
                          Markdown table
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Reddit, Notion, Obsidian
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            buildTickerAiContext(
                              company,
                              series,
                              impliedGrowth,
                              window.location.origin
                            )
                          );
                          setCopiedLabel("Copied for AI");
                          setCopyMenuOpen(false);
                          window.setTimeout(() => setCopiedLabel(null), 1800);
                        } catch {
                          // Ignore clipboard errors
                        }
                      }}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-subtle)] cursor-pointer"
                    >
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--amber)]" />
                      <div>
                        <div className="text-xs font-medium text-[var(--text-primary)]">
                          Copy for AI
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Paste into ChatGPT or Claude
                        </div>
                      </div>
                    </button>

                    <div className="my-1 border-t border-[var(--border)]" />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        exportTrueFcfCard(company, series);
                        setCopyMenuOpen(false);
                      }}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-subtle)] cursor-pointer"
                    >
                      <Download className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
                      <div>
                        <div className="text-xs font-medium text-[var(--text-primary)]">
                          Download PNG card
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          2× retina image snapshot
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-baseline gap-6 sm:text-right">
            <div>
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Share Price
              </div>
              <div className="font-mono-num text-xl font-semibold text-[var(--text-primary)]">
                ${company.price.toFixed(2)}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {company.priceAsOf ? `Close ${company.priceAsOf}` : "Close date unavailable"}
                {company.priceAsOf && !isFreshPriceDate(company.priceAsOf) && " · Stale quote"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Market Cap
              </div>
              <div className="font-mono-num text-xl font-semibold text-[var(--text-primary)]">
                {formatCurrencyCompact(company.marketCap)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Enterprise Value
              </div>
              <div className="font-mono-num text-xl font-semibold text-[var(--text-primary)]">
                {formatCurrencyCompact(enterpriseValue)}
              </div>
            </div>
          </div>
        </section>

        {/* Financial Institution / REIT Guardrail & Sector-Specific Metrics */}
        {isFinancialInstitution && (
          <div className="mt-5 space-y-3">
            <div className="rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-2.5 text-xs text-[var(--text-secondary)]">
              <strong className="font-semibold text-[var(--amber)]">
                {isReitCompany ? "REIT Valuation Note:" : "Financial Institution Note:"}
              </strong>{" "}
              {isReitCompany
                ? "For REITs, GAAP Net Income is depressed by real estate depreciation and standard Enterprise Value includes property-level debt. Use Price / FFO, Book Value, and Filing Diffs alongside the "
                : "For banks, insurers, and asset managers, standard Free Cash Flow and Enterprise Value are distorted by deposits and loan books. Use Tangible Book Value, ROTCE / ROE, the "}
              <button
                type="button"
                onClick={() => {
                  setActiveTab("dcf");
                  setValuationMode("scenario");
                }}
                className="font-semibold text-[var(--amber)] underline cursor-pointer"
              >
                Earnings (P/E) Scenario Model
              </button>
              , and Filing Diffs for cleaner analysis.
            </div>
            {financialMetrics &&
              (financialMetrics.priceToBook !== null ||
                financialMetrics.roePct !== null ||
                financialMetrics.peRatio !== null ||
                financialMetrics.priceToFfo !== null) && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {isReitCompany ? (
                    <>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                        <div className="text-[11px] text-[var(--text-muted)]">Price / FFO {financialMetrics.ffoFiscalYear ?? ""}</div>
                        <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
                          {financialMetrics.priceToFfo !== null
                            ? `${financialMetrics.priceToFfo.toFixed(1)}×`
                            : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                        <div className="text-[11px] text-[var(--text-muted)]">FFO / Share {financialMetrics.ffoFiscalYear ?? ""}</div>
                        <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
                          {financialMetrics.ffoPerShare !== null
                            ? `$${financialMetrics.ffoPerShare.toFixed(2)}`
                            : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                        <div className="text-[11px] text-[var(--text-muted)]">Price / Book</div>
                        <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
                          {financialMetrics.priceToBook !== null
                            ? `${financialMetrics.priceToBook.toFixed(2)}×`
                            : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                        <div className="text-[11px] text-[var(--text-muted)]">Book Value / Share</div>
                        <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
                          {financialMetrics.bookValuePerShare !== null
                            ? `$${financialMetrics.bookValuePerShare.toFixed(2)}`
                            : "—"}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {financialMetrics.priceToTbv !== null ? "Price / Tangible Book" : "Price / Book"}
                        </div>
                        <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
                          {financialMetrics.priceToTbv !== null
                            ? `${financialMetrics.priceToTbv.toFixed(2)}×`
                            : financialMetrics.priceToBook !== null
                              ? `${financialMetrics.priceToBook.toFixed(2)}×`
                              : "—"}
                        </div>
                        {financialMetrics.priceToTbv !== null && financialMetrics.priceToBook !== null && (
                          <div className="font-mono-num text-[10px] text-[var(--text-muted)]">
                            P/B {financialMetrics.priceToBook.toFixed(2)}×
                          </div>
                        )}
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {financialMetrics.rotcePct !== null ? "ROTCE" : "Return on Equity (ROE)"}
                        </div>
                        <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
                          {financialMetrics.rotcePct !== null
                            ? formatPct(financialMetrics.rotcePct)
                            : financialMetrics.roePct !== null
                              ? formatPct(financialMetrics.roePct)
                              : "—"}
                        </div>
                        {financialMetrics.rotcePct !== null && financialMetrics.roePct !== null && (
                          <div className="font-mono-num text-[10px] text-[var(--text-muted)]">
                            ROE {formatPct(financialMetrics.roePct)}
                          </div>
                        )}
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                        <div className="text-[11px] text-[var(--text-muted)]">P/E Multiple</div>
                        <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
                          {financialMetrics.peRatio !== null
                            ? `${financialMetrics.peRatio.toFixed(1)}×`
                            : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {financialMetrics.tangibleBookPerShare !== null ? "TBV / Share" : "Book Value / Share"}
                        </div>
                        <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
                          {financialMetrics.tangibleBookPerShare !== null
                            ? `$${financialMetrics.tangibleBookPerShare.toFixed(2)}`
                            : financialMetrics.bookValuePerShare !== null
                              ? `$${financialMetrics.bookValuePerShare.toFixed(2)}`
                              : "—"}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
          </div>
        )}

        {/* 4-Card High-Signal KPI Strip */}
        <section
          aria-label="Key fundamental signals"
          className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* Card 1: What's Priced In (Implied 10Y Growth) */}
          <button
            type="button"
            onClick={() => setActiveTab("dcf")}
            className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--amber-border)] cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>{reverseDcf ? "Implied 10Y Growth" : isReitCompany ? "Price / FFO" : "Price / Tangible Book"}</span>
              <span className="text-[11px] text-[var(--amber)] opacity-80 group-hover:opacity-100">
                Model →
              </span>
            </div>
            <div className="font-mono-num mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
              {reverseDcf ? formatPct(impliedGrowth) : sectorValuationMultiple == null ? "—" : `${sectorValuationMultiple.toFixed(1)}×`}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span className="font-mono-num">
                Hist: {formatPct(briefing.revenueCagr)}/yr
              </span>
              <span className="font-mono-num">
                {reverseDcf ? `${company.defaultDcf.terminalMultiple}x exit` : financialMetrics?.ffoFiscalYear}
              </span>
            </div>
          </button>

          {/* Card 2: Real Cash Flow & Multiple */}
          <button
            type="button"
            onClick={() => setActiveTab("fcf")}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--amber-border)] cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>True FCF ({latest.fiscalYear})</span>
              <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                {evToTrueFcf !== null && evToTrueFcf < 250
                  ? `${evToTrueFcf.toFixed(1)}x EV`
                  : "FCF − SBC"}
              </span>
            </div>
            <div
              className={`font-mono-num mt-2 text-2xl font-semibold tracking-[-0.02em] ${
                latest.trueFcf >= 0
                  ? "text-[var(--amber)]"
                  : "text-[var(--negative)]"
              }`}
            >
              {formatCurrencyCompact(latest.trueFcf)}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
              <span className="whitespace-nowrap">
                Rep:{" "}
                <strong className="font-mono-num font-medium text-[var(--text-secondary)]">
                  {formatCurrencyCompact(latest.reportedFcf)}
                </strong>
                {evToRepFcf !== null && evToRepFcf < 250 && (
                  <span className="font-mono-num ml-1 opacity-75">
                    ({evToRepFcf.toFixed(0)}x)
                  </span>
                )}
              </span>
              <span className="font-mono-num whitespace-nowrap">
                {formatPct(latest.trueFcfMargin)}
                {sectorBenchmark && (
                  <span className="ml-1 opacity-75">
                    (med {formatPct(sectorBenchmark.medianTrueFcfMargin)})
                  </span>
                )}
              </span>
            </div>
          </button>

          {/* Card 3: Net Share Dilution & SBC Context */}
          <button
            type="button"
            onClick={() => setActiveTab("fcf")}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--amber-border)] cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Share Count (4Y CAGR)</span>
              <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                SBC {formatPct(latest.sbcPctRevenue)}
              </span>
            </div>
            <div
              className={`font-mono-num mt-2 text-2xl font-semibold tracking-[-0.02em] ${
                netDilutionCagr > 1.5
                  ? "text-[var(--negative)]"
                  : netDilutionCagr < -0.5
                    ? "text-[var(--positive)]"
                    : "text-[var(--text-primary)]"
              }`}
            >
              {formatPct(netDilutionCagr, true)}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>Diluted shares</span>
              <span className="font-mono-num text-[var(--text-secondary)]">
                {latest.dilutedShares.toLocaleString()}M
              </span>
            </div>
          </button>

          {/* Card 4: Latest SEC Filing & Insider Signal */}
          <button
            type="button"
            onClick={() =>
              setActiveTab(openMarketBuys.length > 0 ? "insiders" : "diffs")
            }
            className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--amber-border)] cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Filings &amp; Insiders</span>
              <span className="text-[11px] text-[var(--amber)] opacity-80 group-hover:opacity-100">
                View →
              </span>
            </div>
            <div className="font-mono-num mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
              {openMarketBuys.length > 0 ? (
                <span className="text-[var(--positive)]">
                  +{formatCurrencyCompact(openMarketBuyTotal)} Buy
                </span>
              ) : (
                <span>
                  {company.filingDiffs.length} Diff{company.filingDiffs.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>
                {highSignalDiffCount > 0
                  ? `${highSignalDiffCount} High-signal change${highSignalDiffCount > 1 ? "s" : ""}`
                  : `${company.lastFiling.type} (${company.lastFiling.date})`}
              </span>
              <span className="font-mono-num">
                {insiderTrades.length} Form 4
              </span>
            </div>
          </button>
        </section>

        {/* Accessible Tabbed Analysis Studio */}
        <section className="mt-8">
          <div
            {...({ focusgroup: "tablist nomemory" } as Record<string, string>)}
            role="tablist"
            aria-label={`${company.ticker} analysis views`}
            className="amber-tablist"
          >
            {tabs.map((tab) => {
              const isSelected = activeTab === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  {...(isSelected
                    ? ({ focusgroupstart: "" } as Record<string, string>)
                    : {})}
                  onClick={() => setActiveTab(tab.id)}
                  className="amber-tab inline-flex items-center gap-1.5"
                >
                  <TabIcon className="h-4 w-4 opacity-85" aria-hidden="true" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="font-mono-num rounded-full bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            <div
              role="tabpanel"
              aria-labelledby="tab-overview"
              hidden={activeTab !== "overview"}
            >
              {activeTab === "overview" && (
                <div className="space-y-6">
                  <CompanyBriefing
                    ticker={company.ticker}
                    companyName={company.name}
                    briefing={briefing}
                    series={series}
                    onNavigateTab={(t) => setActiveTab(t)}
                  />
                  <RevenueSankey
                    ticker={company.ticker}
                    companyName={company.name}
                    period={latest}
                    fyPeriod={latestFy}
                  />
                  <MoatQualityCard company={company} series={series} />

                  <SectorPeersTable
                    current={{
                      ticker: company.ticker,
                      name: company.name,
                      sector: company.sector,
                      marketCap: company.marketCap,
                      revenueCagr: briefing.revenueCagr,
                      trueFcfMargin: isFinancialInstitution ? null : latest.trueFcfMargin,
                      sbcPctRevenue: latest.sbcPctRevenue,
                      netDilutionCagr,
                      impliedCagr: impliedGrowth,
                      priceToTbv: financialMetrics?.priceToTbv ?? null,
                      rotcePct: financialMetrics?.rotcePct ?? null,
                      priceToFfo: financialMetrics?.priceToFfo ?? null,
                      shareholderYieldPct: shareholderYield.totalShareholderYieldPct,
                    }}
                    peers={sectorPeers}
                    sectorBenchmark={sectorBenchmark}
                  />
                </div>
              )}
            </div>

            <div
              role="tabpanel"
              aria-labelledby="tab-fcf"
              hidden={activeTab !== "fcf"}
            >
              {activeTab === "fcf" && (
                <div>
                  <TrueFcfChart
                    company={company}
                    series={series}
                    cadence={fcfCadence}
                    onCadenceChange={setFcfCadence}
                  />
                  <TrueFcfWaterfall period={latest} />
                  <BuybackRealityCard
                    series={series}
                    marketCap={company.marketCap}
                  />
                  <FinancialLedgerTable
                    ticker={company.ticker}
                    series={
                      fcfCadence === "quarterly" && quarterlyMomentum.quarters.length >= 4
                        ? quarterlyMomentum.quarters
                        : series
                    }
                    cadence={
                      fcfCadence === "quarterly" && quarterlyMomentum.quarters.length >= 4
                        ? "quarterly"
                        : "annual"
                    }
                    yoyRevByPeriod={yoyRevByQuarter}
                  />
                </div>
              )}
            </div>

            <div
              role="tabpanel"
              aria-labelledby="tab-dcf"
              hidden={activeTab !== "dcf"}
            >
              {activeTab === "dcf" && (
                <div className="space-y-4">
                  <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
                    <button
                      type="button"
                      onClick={() => setValuationMode("scenario")}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        !reverseDcf || valuationMode === "scenario"
                          ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      5-Year Return Scenario (Bull / Base / Bear)
                    </button>
                    {reverseDcf && <button
                      type="button"
                      onClick={() => setValuationMode("reverse")}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        valuationMode === "reverse"
                          ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      Reverse DCF (What&apos;s Priced In)
                    </button>}
                  </div>

                  {!reverseDcf || valuationMode === "scenario" ? (
                    <ScenarioBuilder company={company} />
                  ) : (
                    <ReverseDcfStudio company={company} latest={latest} />
                  )}

                  <PriceVsFundamentalsChart company={company} series={series} />
                  <HistoricalValuationBands company={company} series={series} />
                </div>
              )}
            </div>

            <div
              role="tabpanel"
              aria-labelledby="tab-diffs"
              hidden={activeTab !== "diffs"}
            >
              {activeTab === "diffs" && <FilingDiffRadar company={company} />}
            </div>

            <div
              role="tabpanel"
              aria-labelledby="tab-insiders"
              hidden={activeTab !== "insiders"}
            >
              {activeTab === "insiders" && (
                <InsiderRadar
                  ticker={company.ticker}
                  trades={insiderTrades}
                />
              )}
            </div>
          </div>
        </section>

        {/* Subtle Institutional Footer */}
        <footer className="mt-14 flex flex-col items-start justify-between gap-2 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-4">
            <p>© {new Date().getFullYear()} Amber. Not investment advice.</p>
            <Link href="/privacy" className="hover:text-[var(--text-primary)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--text-primary)]">
              Terms
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <MethodologyModal />
            <span className="font-mono-num">
              CIK {company.cik}
              <span className="hidden sm:inline"> (Press 1–5 for tabs)</span>
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
