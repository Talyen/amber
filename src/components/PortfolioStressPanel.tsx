"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { SearchIndexEntry } from "@/data/search-index";
import { formatPct } from "@/lib/finance";
import {
  computePortfolioStress,
  computeSbcDilutionAttribution,
  type PortfolioStressInputs,
} from "@/lib/portfolio-stress";
import type { SavedValuationPreset } from "@/lib/valuation-presets";

const STRESS_PRESETS: Array<{ label: string; inputs: PortfolioStressInputs }> = [
  {
    label: "Base",
    inputs: { multipleCompressionPct: 0, growthHaircutPts: 0, topPositionDrawdownPct: 0 },
  },
  {
    label: "Rate Shock",
    inputs: { multipleCompressionPct: -15, growthHaircutPts: 2, topPositionDrawdownPct: 0 },
  },
  {
    label: "Recession",
    inputs: { multipleCompressionPct: -25, growthHaircutPts: 5, topPositionDrawdownPct: -20 },
  },
];

interface PortfolioStressPanelProps {
  holdings: SearchIndexEntry[];
  normalizedWeights: ReadonlyMap<string, number>;
  savedPresets: Readonly<Record<string, SavedValuationPreset>>;
  inputMode: "weight" | "dollars";
  totalDollars: number;
}

export function PortfolioStressPanel({
  holdings,
  normalizedWeights,
  savedPresets,
  inputMode,
  totalDollars,
}: PortfolioStressPanelProps) {
  const [inputs, setInputs] = useState<PortfolioStressInputs>(STRESS_PRESETS[0].inputs);

  const stress = useMemo(
    () => computePortfolioStress(holdings, normalizedWeights, savedPresets, inputs),
    [holdings, normalizedWeights, savedPresets, inputs]
  );

  const attribution = useMemo(
    () => computeSbcDilutionAttribution(holdings, normalizedWeights),
    [holdings, normalizedWeights]
  );

  const isStressed =
    inputs.multipleCompressionPct !== 0 ||
    inputs.growthHaircutPts !== 0 ||
    inputs.topPositionDrawdownPct !== 0;

  const dollarImpact =
    inputMode === "dollars" && totalDollars > 0
      ? Math.round((totalDollars * stress.estimatedDrawdownPct) / 100)
      : null;

  return (
    <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Left: What-If Stress Test */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-4 w-4 text-[var(--amber)]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Portfolio Stress Test
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {STRESS_PRESETS.map((preset) => {
              const active =
                inputs.multipleCompressionPct === preset.inputs.multipleCompressionPct &&
                inputs.growthHaircutPts === preset.inputs.growthHaircutPts &&
                inputs.topPositionDrawdownPct === preset.inputs.topPositionDrawdownPct;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setInputs(preset.inputs)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
            {isStressed && (
              <button
                type="button"
                onClick={() => setInputs(STRESS_PRESETS[0].inputs)}
                aria-label="Reset stress test"
                className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-3.5">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">Exit Multiple Compression</span>
              <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                {inputs.multipleCompressionPct}%
              </span>
            </div>
            <input
              type="range"
              min={-40}
              max={0}
              step={5}
              value={inputs.multipleCompressionPct}
              onChange={(e) =>
                setInputs((prev) => ({
                  ...prev,
                  multipleCompressionPct: Number(e.target.value),
                }))
              }
              aria-label="Exit multiple compression percentage"
              className="amber-range w-full"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">Annual Growth Haircut</span>
              <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                {inputs.growthHaircutPts > 0 ? `-${inputs.growthHaircutPts} pts/yr` : "0 pts/yr"}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={8}
              step={1}
              value={inputs.growthHaircutPts}
              onChange={(e) =>
                setInputs((prev) => ({
                  ...prev,
                  growthHaircutPts: Number(e.target.value),
                }))
              }
              aria-label="Annual revenue growth haircut percentage points"
              className="amber-range w-full"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">
                Top Position Shock{" "}
                {stress.topHoldingTicker && (
                  <span className="font-mono-num text-[var(--text-muted)]">
                    ({stress.topHoldingTicker} · {stress.topHoldingWeightPct.toFixed(0)}%)
                  </span>
                )}
              </span>
              <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                {inputs.topPositionDrawdownPct}%
              </span>
            </div>
            <input
              type="range"
              min={-50}
              max={0}
              step={5}
              value={inputs.topPositionDrawdownPct}
              onChange={(e) =>
                setInputs((prev) => ({
                  ...prev,
                  topPositionDrawdownPct: Number(e.target.value),
                }))
              }
              aria-label="Top holding drawdown shock percentage"
              className="amber-range w-full"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Est. Value Impact</div>
            <div
              className={`font-mono-num mt-0.5 text-lg font-semibold ${
                stress.estimatedDrawdownPct < -15
                  ? "text-[var(--negative)]"
                  : stress.estimatedDrawdownPct < 0
                    ? "text-[var(--amber)]"
                    : "text-[var(--text-primary)]"
              }`}
            >
              {formatPct(stress.estimatedDrawdownPct, true)}
            </div>
            {dollarImpact !== null && (
              <div className="font-mono-num text-[11px] text-[var(--text-secondary)]">
                {dollarImpact < 0 ? `-$${Math.abs(dollarImpact).toLocaleString()}` : "$0"}
              </div>
            )}
          </div>

          <div>
            <div className="text-[11px] text-[var(--text-muted)]">
              Stressed Thesis 5Y CAGR
            </div>
            <div className="font-mono-num mt-0.5 text-lg font-semibold text-[var(--text-primary)]">
              {stress.stressedThesisIrrPct !== null
                ? `${formatPct(stress.stressedThesisIrrPct, true)}/yr`
                : "—"}
            </div>
            <div className="font-mono-num text-[11px] text-[var(--text-secondary)]">
              {stress.thesisIrrDeltaPct !== null && stress.thesisCoveredCount > 0
                ? `${formatPct(stress.thesisIrrDeltaPct, true)} pts vs. base (${stress.thesisCoveredCount} covered)`
                : "Save theses to stress-test IRR"}
            </div>
          </div>
        </div>
      </section>

      {/* Right: SBC & Dilution Attribution */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            SBC &amp; Dilution Attribution
          </h2>
          <span className="text-[11px] text-[var(--text-muted)]">
            Share of weighted SBC drag
          </span>
        </div>

        <div className="mt-3.5 space-y-3">
          {attribution.slice(0, 6).map((row) => (
            <div key={row.ticker}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <Link
                  href={`/t/${row.ticker}?tab=fcf`}
                  className="inline-flex min-w-0 items-center gap-1.5 hover:text-[var(--amber)]"
                >
                  <span className="font-mono-num font-semibold text-[var(--amber)]">
                    {row.ticker}
                  </span>
                  <span className="truncate text-[var(--text-secondary)]">
                    {row.weightPct.toFixed(0)}% wt · {formatPct(row.sbcPctRevenue)} SBC/Rev
                  </span>
                </Link>
                <div className="font-mono-num shrink-0 text-right text-[11px]">
                  <span className="font-semibold text-[var(--sbc)]">
                    {row.shareOfPortfolioSbcPct}% of drag
                  </span>
                  <span className="ml-2 text-[var(--text-muted)]">
                    ({formatPct(row.netDilutionCagr, true)}/yr)
                  </span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                <div
                  className="h-full rounded-full bg-[var(--sbc)]"
                  style={{ width: `${Math.min(100, row.shareOfPortfolioSbcPct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
