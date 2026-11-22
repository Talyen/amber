"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GitCompareArrows, Star } from "lucide-react";
import {
  type CompanySnapshot,
  computeAnnualMetrics,
  computeEnterpriseValue,
  computeNetDilutionCagr,
  formatCurrencyCompact,
  formatPct,
  solveReverseDcf,
} from "@/lib/finance";
import { useWatchlist } from "@/lib/watchlist";
import type { SectorBenchmark } from "@/data/repository";
import { TopNav } from "@/components/TopNav";
import { TrueFcfChart } from "@/components/TrueFcfChart";
import { TrueFcfWaterfall } from "@/components/TrueFcfWaterfall";
import { BuybackRealityCard } from "@/components/BuybackRealityCard";
import { FinancialLedgerTable } from "@/components/FinancialLedgerTable";
import { ReverseDcfStudio } from "@/components/ReverseDcfStudio";
import { FilingDiffRadar } from "@/components/FilingDiffRadar";
import { InsiderRadar, type InsiderTradeItem } from "@/components/InsiderRadar";
import { MethodologyModal } from "@/components/MethodologyModal";

type ActiveTab = "fcf" | "dcf" | "diffs" | "insiders";

interface CompanyWorkspaceProps {
  company: CompanySnapshot;
  insiderTrades?: InsiderTradeItem[];
  sectorBenchmark?: SectorBenchmark | null;
}

export function CompanyWorkspace({
  company,
  insiderTrades = [],
  sectorBenchmark = null,
}: CompanyWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("fcf");
  const watchlist = useWatchlist();
  const isStarred = watchlist.has(company.ticker);

  // Restore shared tab from URL query string (e.g. ?tab=dcf&wacc=10&mult=25)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam === "dcf" || tabParam === "diffs" || tabParam === "fcf") {
      setActiveTab(tabParam);
    } else if (
      params.has("wacc") ||
      params.has("mult") ||
      params.has("margin") ||
      params.has("sbc")
    ) {
      setActiveTab("dcf");
    }
  }, []);

  // Keyboard shortcuts: 1 / 2 / 3 switch analysis tabs when not focused in an input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "1") setActiveTab("fcf");
      else if (e.key === "2") setActiveTab("dcf");
      else if (e.key === "3") setActiveTab("diffs");
      else if (e.key === "4") setActiveTab("insiders");
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

  const series = useMemo(
    () => computeAnnualMetrics(company.annuals),
    [company.annuals]
  );
  const latest = series[series.length - 1];
  const enterpriseValue = useMemo(
    () => computeEnterpriseValue(company),
    [company]
  );
  const netDilutionCagr = useMemo(
    () => computeNetDilutionCagr(company.annuals),
    [company.annuals]
  );

  const baselineDcf = useMemo(
    () =>
      solveReverseDcf({
        enterpriseValue,
        baseRevenue: latest.revenue,
        waccPct: company.defaultDcf.wacc,
        terminalMultiple: company.defaultDcf.terminalMultiple,
        targetTrueFcfMarginPct: Math.max(
          1.5,
          company.defaultDcf.targetFcfMargin - company.defaultDcf.sbcDragPct
        ),
        currentTrueFcfMarginPct: latest.trueFcfMargin,
      }),
    [company.defaultDcf, enterpriseValue, latest.revenue, latest.trueFcfMargin]
  );

  const tabs: Array<{ id: ActiveTab; label: string; badge?: string }> = [
    { id: "fcf", label: "True FCF & Dilution" },
    { id: "dcf", label: "Reverse DCF Studio" },
    {
      id: "diffs",
      label: "Filing Diff Radar",
      badge: String(company.filingDiffs.length),
    },
    {
      id: "insiders",
      label: "Insider Form 4",
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
              <span>·</span>
              <span>{company.exchange}</span>
              <span>·</span>
              <span>{company.sector}</span>
              <span>·</span>
              <span className="font-mono-num">
                SEC {company.lastFiling.type} ({company.lastFiling.date})
              </span>
              <span>·</span>
              <Link
                href={`/compare?t=${company.ticker},${company.ticker === "PLTR" ? "SNOW,NVDA,COST" : "PLTR,NVDA,COST"}`}
                className="inline-flex items-center gap-1 font-medium text-[var(--amber)] hover:underline"
              >
                <GitCompareArrows className="h-3 w-3" />
                Compare
              </Link>
              <span>·</span>
              <button
                type="button"
                onClick={() => watchlist.toggle(company.ticker)}
                className={`inline-flex items-center gap-1 font-medium transition-colors cursor-pointer ${
                  isStarred
                    ? "text-[var(--amber)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Star
                  className="h-3 w-3"
                  fill={isStarred ? "currentColor" : "none"}
                />
                {isStarred ? "Watchlisted" : "Watchlist"}
              </button>
            </div>

            <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
              {company.name}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {company.tagline}
            </p>
          </div>

          <div className="flex flex-wrap items-baseline gap-6 sm:text-right">
            <div>
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Share Price
              </div>
              <div className="font-mono-num text-xl font-semibold text-[var(--text-primary)]">
                ${company.price.toFixed(2)}
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

        {/* 4-Card High-Signal KPI Strip */}
        <section
          aria-label="Key fundamental signals"
          className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* Card 1: True FCF */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>True FCF ({latest.fiscalYear})</span>
              <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                FCF − SBC
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
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>
                Reported:{" "}
                <strong className="font-mono-num font-medium text-[var(--text-secondary)]">
                  {formatCurrencyCompact(latest.reportedFcf)}
                </strong>
              </span>
              <span className="font-mono-num">
                {formatPct(latest.trueFcfMargin)} margin
                {sectorBenchmark && (
                  <span className="ml-1 opacity-75">
                    (med {formatPct(sectorBenchmark.medianTrueFcfMargin)})
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Card 2: SBC Intensity */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>SBC Burden</span>
              <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                % of Rev
              </span>
            </div>
            <div className="font-mono-num mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
              {formatPct(latest.sbcPctRevenue)}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span className="font-mono-num text-[var(--sbc)]">
                {formatCurrencyCompact(latest.sbc)}
              </span>
              <span className="font-mono-num">
                {formatPct(latest.sbcPctReportedFcf, false, 0)} of FCF
                {sectorBenchmark && (
                  <span className="ml-1 opacity-75">
                    (med {formatPct(sectorBenchmark.medianSbcPctRevenue)})
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Card 3: Net Share Dilution */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Net Share Dilution</span>
              <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                4Y CAGR
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
          </div>

          {/* Card 4: Implied Growth */}
          <button
            type="button"
            onClick={() => setActiveTab("dcf")}
            className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--amber-border)] cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Implied 10Y Rev CAGR</span>
              <span className="text-[11px] text-[var(--amber)] opacity-80 group-hover:opacity-100">
                Stress-test →
              </span>
            </div>
            <div className="font-mono-num mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
              {formatPct(baselineDcf.impliedRevenueCagrPct)}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span className="font-mono-num">
                {formatPct(company.defaultDcf.wacc)} WACC
              </span>
              <span className="font-mono-num">
                {company.defaultDcf.terminalMultiple}x exit
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
                  className="amber-tab inline-flex items-center gap-2"
                >
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
              aria-labelledby="tab-fcf"
              hidden={activeTab !== "fcf"}
            >
              {activeTab === "fcf" && (
                <div>
                  <TrueFcfChart company={company} series={series} />
                  <TrueFcfWaterfall period={latest} />
                  <BuybackRealityCard
                    series={series}
                    marketCap={company.marketCap}
                  />
                  <FinancialLedgerTable
                    ticker={company.ticker}
                    series={series}
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
                <ReverseDcfStudio company={company} latest={latest} />
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
          <p>
            Amber · Deterministic fundamental analysis from SEC EDGAR filings. Not investment advice.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <MethodologyModal />
            <span className="font-mono-num">
              CIK {company.cik} · Press 1/2/3 for tabs
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
