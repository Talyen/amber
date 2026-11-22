"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import {
  type CompanyBriefingData,
  type PillarTone,
} from "@/lib/insights";
import {
  type ComputedAnnual,
  formatCurrencyCompact,
} from "@/lib/finance";

interface CompanyBriefingProps {
  ticker: string;
  companyName: string;
  briefing: CompanyBriefingData;
  series: ComputedAnnual[];
  onNavigateTab: (tab: "fcf" | "dcf" | "diffs") => void;
}

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
  ticker,
  companyName,
  briefing,
  series,
  onNavigateTab,
}: CompanyBriefingProps) {
  const maxRev = Math.max(1, ...series.map((s) => s.revenue));

  return (
    <div className="space-y-6">
      {/* 4 Universal Plain-English Pillars */}
      <section aria-label="60-second company briefing">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              60-Second Briefing
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Four core questions every investor should answer before going deeper on {companyName}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {briefing.pillars.map((pillar) => (
            <div
              key={pillar.id}
              className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--text-muted)]">
                    {pillar.question}
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

                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {pillar.explanation}
                </p>
              </div>

              {pillar.actionTab && pillar.actionLabel && (
                <div className="mt-4 border-t border-[var(--border)] pt-3">
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
          ))}
        </div>
      </section>

      {/* Revenue Trajectory Mini Strip + What Stands Out */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: What Stands Out */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-7">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--amber)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              What Stands Out About {ticker}
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Key signals from {ticker}&apos;s multi-year SEC filings.
          </p>

          <div className="mt-4 space-y-3">
            {briefing.standouts.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${badgeClass(item.tone)}`}
                  >
                    {item.tag}
                  </span>
                </div>
                <h4 className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                  {item.title}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Clean Revenue & Cash Flow Trajectory Snapshot */}
        <section className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-5">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Revenue Trajectory
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Annual scale from SEC 10-K{series.some((s) => s.fiscalYear === "TTM") ? " & 10-Q TTM" : ""}.
            </p>

            <div className="mt-5 space-y-3">
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

          <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={() => onNavigateTab("fcf")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
            >
              Deep-dive Cash Flow
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab("dcf")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
            >
              Stress-test Valuation
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
