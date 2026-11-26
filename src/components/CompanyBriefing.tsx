"use client";

import {
  ArrowRight,
  Banknote,
  Gauge,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  type CompanyBriefingData,
  type PillarTone,
} from "@/lib/insights";
import {
  type ComputedAnnual,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";

interface CompanyBriefingProps {
  ticker: string;
  companyName: string;
  briefing: CompanyBriefingData;
  series: ComputedAnnual[];
  cashAndEquiv?: number;
  totalDebt?: number;
  impliedCagr?: number | null;
  onNavigateTab: (tab: "fcf" | "dcf" | "diffs") => void;
}

const PILLAR_META: Record<
  CompanyBriefingData["pillars"][number]["id"],
  { label: string; icon: typeof TrendingUp }
> = {
  growth: { label: "Growth", icon: TrendingUp },
  cash: { label: "Real Cash", icon: Banknote },
  balance: { label: "Balance Sheet", icon: ShieldCheck },
  expectations: { label: "Expectations", icon: Gauge },
};

function badgeClass(tone: PillarTone): string {
  switch (tone) {
    case "positive":
      return "bg-[var(--surface-subtle)] text-[var(--positive)] ring-1 ring-inset ring-[var(--border-strong)]";
    case "amber":
      return "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]";
    case "negative":
      return "bg-[var(--surface-subtle)] text-[var(--negative)] ring-1 ring-inset ring-[var(--border-strong)]";
    default:
      return "bg-[var(--surface-subtle)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]";
  }
}

export function CompanyBriefing({
  briefing,
  series,
  cashAndEquiv,
  totalDebt,
  impliedCagr = null,
  onNavigateTab,
}: CompanyBriefingProps) {
  const maxRev = Math.max(1, ...series.map((s) => s.revenue));
  const latest = series[series.length - 1];
  const first = series[0];

  // Inline sparkline path for Growth pillar
  const sparkPoints = series.map((s, i) => {
    const x = series.length === 1 ? 60 : (i / (series.length - 1)) * 120;
    const y = 26 - Math.max(2, (s.revenue / maxRev) * 22);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  function renderPillarVisual(id: CompanyBriefingData["pillars"][number]["id"]) {
    if (id === "growth" && first && latest) {
      return (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-subtle)] px-3 py-2">
          <div className="font-mono-num text-[11px] text-[var(--text-secondary)]">
            <span>{formatCurrencyCompact(first.revenue)}</span>
            <span className="mx-1.5 text-[var(--text-muted)]">→</span>
            <strong className="text-[var(--text-primary)]">
              {formatCurrencyCompact(latest.revenue)}
            </strong>
          </div>
          <svg
            viewBox="0 0 120 28"
            className="h-6 w-24 shrink-0 overflow-visible"
            aria-hidden="true"
          >
            <polyline
              fill="none"
              stroke="var(--amber)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={sparkPoints.join(" ")}
            />
          </svg>
        </div>
      );
    }

    if (id === "cash" && latest) {
      const base = Math.max(1, Math.abs(latest.reportedFcf), latest.sbc, Math.abs(latest.trueFcf));
      const truePct = Math.max(0, Math.min(100, (Math.max(0, latest.trueFcf) / base) * 100));
      const sbcPct = Math.max(0, Math.min(100, (latest.sbc / base) * 100));
      return (
        <div className="mt-3 space-y-1.5 rounded-lg bg-[var(--surface-subtle)] px-3 py-2">
          <div className="font-mono-num flex items-center justify-between text-[11px]">
            <span className="text-[var(--text-secondary)]">
              True <strong className="text-[var(--amber)]">{formatCurrencyCompact(latest.trueFcf)}</strong>
            </span>
            <span className="text-[var(--text-muted)]">
              SBC <strong className="text-[var(--sbc)]">−{formatCurrencyCompact(latest.sbc)}</strong>
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
            {truePct > 0 && (
              <div
                className="h-full bg-[var(--amber)]"
                style={{ width: `${Math.min(100, truePct)}%` }}
              />
            )}
            {sbcPct > 0 && (
              <div
                className="h-full bg-[var(--sbc)]"
                style={{ width: `${Math.min(100 - truePct, sbcPct)}%` }}
              />
            )}
          </div>
        </div>
      );
    }

    if (id === "balance" && typeof cashAndEquiv === "number" && typeof totalDebt === "number") {
      const total = Math.max(1, cashAndEquiv + totalDebt);
      const cashPct = Math.max(2, (cashAndEquiv / total) * 100);
      const debtPct = Math.max(totalDebt > 0 ? 2 : 0, (totalDebt / total) * 100);
      return (
        <div className="mt-3 space-y-1.5 rounded-lg bg-[var(--surface-subtle)] px-3 py-2">
          <div className="font-mono-num flex items-center justify-between text-[11px]">
            <span className="text-[var(--text-secondary)]">
              Cash <strong className="text-[var(--positive)]">{formatCurrencyCompact(cashAndEquiv)}</strong>
            </span>
            <span className="text-[var(--text-muted)]">
              Debt <strong className="text-[var(--text-primary)]">{formatCurrencyCompact(totalDebt)}</strong>
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full bg-[var(--positive)]" style={{ width: `${cashPct}%` }} />
            <div className="h-full bg-[var(--reported)]" style={{ width: `${debtPct}%` }} />
          </div>
        </div>
      );
    }

    if (id === "expectations" && impliedCagr !== null) {
      const lo = Math.min(0, briefing.revenueCagr, impliedCagr) - 2;
      const hi = Math.max(25, briefing.revenueCagr, impliedCagr) + 2;
      const span = Math.max(10, hi - lo);
      const histPos = Math.max(4, Math.min(96, ((briefing.revenueCagr - lo) / span) * 100));
      const impPos = Math.max(4, Math.min(96, ((impliedCagr - lo) / span) * 100));
      return (
        <div className="mt-3 space-y-1.5 rounded-lg bg-[var(--surface-subtle)] px-3 py-2">
          <div className="font-mono-num flex items-center justify-between text-[11px]">
            <span className="text-[var(--text-muted)]">
              Hist <strong className="text-[var(--text-primary)]">{formatPct(briefing.revenueCagr)}</strong>
            </span>
            <span className="text-[var(--text-muted)]">
              Priced-In <strong className="text-[var(--amber)]">{formatPct(impliedCagr)}</strong>
            </span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-[var(--border)]">
            <div
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--surface)] bg-[var(--text-secondary)]"
              style={{ left: `${histPos}%` }}
              title={`Historical: ${formatPct(briefing.revenueCagr)}/yr`}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--amber)] shadow-xs"
              style={{ left: `${impPos}%` }}
              title={`Priced-In: ${formatPct(impliedCagr)}/yr`}
            />
          </div>
        </div>
      );
    }

    return (
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
        {briefing.pillars.find((p) => p.id === id)?.explanation}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4 Universal Visual Pillars */}
      <section aria-label="60-second company briefing">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            60-Second Briefing
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {briefing.pillars.map((pillar) => {
            const meta = PILLAR_META[pillar.id];
            const Icon = meta.icon;
            return (
              <div
                key={pillar.id}
                className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                      <Icon className="h-3.5 w-3.5 text-[var(--amber)]" aria-hidden="true" />
                      {meta.label}
                    </span>
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${badgeClass(pillar.tone)}`}
                    >
                      {pillar.verdict}
                    </span>
                  </div>

                  <div className="font-mono-num mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                    {pillar.headlineStat}
                  </div>

                  {renderPillarVisual(pillar.id)}
                </div>

                {pillar.actionTab && pillar.actionLabel && (
                  <div className="mt-3.5 border-t border-[var(--border)] pt-2.5">
                    <button
                      type="button"
                      onClick={() => onNavigateTab(pillar.actionTab!)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--amber)] hover:underline cursor-pointer"
                    >
                      {pillar.actionLabel}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Revenue Trajectory Mini Strip + What Stands Out */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: What Stands Out */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-7">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--amber)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Key Signals
            </h3>
          </div>

          <div className="mt-3.5 space-y-2.5">
            {briefing.standouts.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${badgeClass(item.tone)}`}
                  >
                    {item.tag}
                  </span>
                </div>
                <h4 className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">
                  {item.title}
                </h4>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Clean Revenue & Cash Flow Trajectory Snapshot */}
        <section className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Revenue Trajectory
              </h3>
              <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                {series.some((s) => s.fiscalYear === "TTM") ? "10-K + TTM" : "10-K"}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {series.map((row) => {
                const widthPct = Math.max(4, (row.revenue / maxRev) * 100);
                const isLatest = row === series[series.length - 1];
                return (
                  <div key={row.fiscalYear} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`font-mono-num ${
                          isLatest
                            ? "font-semibold text-[var(--amber)]"
                            : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {row.fiscalYear}
                      </span>
                      <span className="font-mono-num font-medium text-[var(--text-primary)]">
                        {formatCurrencyCompact(row.revenue)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: isLatest
                            ? "var(--amber)"
                            : "var(--reported)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={() => onNavigateTab("fcf")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
            >
              Cash Flow
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab("dcf")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
            >
              Valuation
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
