"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Download, RotateCcw } from "lucide-react";
import {
  type CompanySnapshot,
  type ComputedAnnual,
  computeEnterpriseValue,
  formatCurrencyCompact,
  formatPct,
  reverseDcfTargetMargin,
  solveReverseDcf,
} from "@/lib/finance";
import { exportReverseDcfCard } from "@/lib/export-card";
import { MetricHint } from "@/components/MetricHint";

interface ReverseDcfStudioProps {
  company: CompanySnapshot;
  latest: ComputedAnnual;
}

function progressPct(value: number, min: number, max: number): string {
  return `${(((value - min) / (max - min)) * 100).toFixed(1)}%`;
}

const WACC_MIN = 6.5;
const WACC_MAX = 15;
const MULTIPLE_MIN = 12;
const MULTIPLE_MAX = 40;
const MARGIN_MIN = 1;
const MARGIN_MAX = 55;

function readSharedValue(
  params: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = params.get(key)?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export function ReverseDcfStudio({ company, latest }: ReverseDcfStudioProps) {
  const defaults = company.defaultDcf;
  const sbcMax = Math.max(25, Math.ceil(defaults.sbcDragPct * 2) / 2);
  const [sharedParams] = useState(
    () => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)
  );
  const [wacc, setWacc] = useState(() =>
    readSharedValue(sharedParams, "wacc", defaults.wacc, WACC_MIN, WACC_MAX)
  );
  const [terminalMultiple, setTerminalMultiple] = useState(() =>
    readSharedValue(sharedParams, "mult", defaults.terminalMultiple, MULTIPLE_MIN, MULTIPLE_MAX)
  );
  const [targetFcfMargin, setTargetFcfMargin] = useState(() =>
    readSharedValue(sharedParams, "margin", defaults.targetFcfMargin, MARGIN_MIN, MARGIN_MAX)
  );
  const [sbcDrag, setSbcDrag] = useState(() =>
    readSharedValue(sharedParams, "sbc", defaults.sbcDragPct, 0, sbcMax)
  );
  const [exported, setExported] = useState(false);

  // Keep URL query params cleanly synced so "Share" captures exact assumptions
  useEffect(() => {
    const isDefault =
      wacc === defaults.wacc &&
      terminalMultiple === defaults.terminalMultiple &&
      targetFcfMargin === defaults.targetFcfMargin &&
      sbcDrag === defaults.sbcDragPct;

    const url = new URL(window.location.href);
    if (isDefault) {
      url.searchParams.delete("wacc");
      url.searchParams.delete("mult");
      url.searchParams.delete("margin");
      url.searchParams.delete("sbc");
    } else {
      url.searchParams.set("wacc", String(wacc));
      url.searchParams.set("mult", String(terminalMultiple));
      url.searchParams.set("margin", String(targetFcfMargin));
      url.searchParams.set("sbc", String(sbcDrag));
    }
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [wacc, terminalMultiple, targetFcfMargin, sbcDrag, defaults]);

  const enterpriseValue = computeEnterpriseValue(company);
  const effectiveTargetTrueMargin = reverseDcfTargetMargin(targetFcfMargin, sbcDrag);

  const result = useMemo(
    () =>
      solveReverseDcf({
        enterpriseValue,
        baseRevenue: latest.revenue,
        waccPct: wacc,
        terminalMultiple,
        targetTrueFcfMarginPct: effectiveTargetTrueMargin,
        currentTrueFcfMarginPct: latest.trueFcfMargin,
      }),
    [
      enterpriseValue,
      latest.revenue,
      latest.trueFcfMargin,
      wacc,
      terminalMultiple,
      effectiveTargetTrueMargin,
    ]
  );

  // 5x5 Sensitivity Matrix centered around current sliders (clamping center so rows/cols never duplicate)
  const waccCenter = Math.max(WACC_MIN + 1.5, Math.min(WACC_MAX - 1.5, wacc));
  const multCenter = Math.max(MULTIPLE_MIN + 6, Math.min(MULTIPLE_MAX - 6, Math.round(terminalMultiple)));

  const { waccSteps, multSteps, matrix } = useMemo(() => {
    const waccSteps = [-1.5, -0.75, 0, 0.75, 1.5].map((d) =>
      Number((waccCenter + d).toFixed(2))
    );
    const multSteps = [-6, -3, 0, 3, 6].map((d) => multCenter + d);
    const matrix = waccSteps.map((w) =>
      multSteps.map((m) =>
        solveReverseDcf({
          enterpriseValue,
          baseRevenue: latest.revenue,
          waccPct: w,
          terminalMultiple: m,
          targetTrueFcfMarginPct: effectiveTargetTrueMargin,
          currentTrueFcfMarginPct: latest.trueFcfMargin,
        })
      )
    );
    return { waccSteps, multSteps, matrix };
  }, [
    enterpriseValue,
    latest.revenue,
    latest.trueFcfMargin,
    effectiveTargetTrueMargin,
    waccCenter,
    multCenter,
  ]);

  function resetDefaults() {
    setWacc(defaults.wacc);
    setTerminalMultiple(defaults.terminalMultiple);
    setTargetFcfMargin(defaults.targetFcfMargin);
    setSbcDrag(defaults.sbcDragPct);
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Left: Interactive Controls */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              Assumptions
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Drag sliders to stress-test what the market prices in.
            </p>
          </div>
          <button
            type="button"
            onClick={resetDefaults}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* WACC */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label
                htmlFor="dcf-wacc"
                className="font-medium text-[var(--text-primary)]"
              >
                Discount Rate (WACC)
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {formatPct(wacc)}
              </span>
            </div>
            <input
              id="dcf-wacc"
              type="range"
              min={WACC_MIN}
              max={WACC_MAX}
              step={0.25}
              value={wacc}
              onChange={(e) => setWacc(parseFloat(e.target.value))}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(wacc, WACC_MIN, WACC_MAX),
                } as React.CSSProperties
              }
            />
            <div className="font-mono-num mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>6.5%</span>
              <span>10.5%</span>
              <span>15.0%</span>
            </div>
          </div>

          {/* Terminal Multiple */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label
                htmlFor="dcf-terminal"
                className="font-medium text-[var(--text-primary)]"
              >
                Terminal Multiple (EV / True FCF)
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {terminalMultiple}x
              </span>
            </div>
            <input
              id="dcf-terminal"
              type="range"
              min={MULTIPLE_MIN}
              max={MULTIPLE_MAX}
              step={1}
              value={terminalMultiple}
              onChange={(e) => setTerminalMultiple(parseInt(e.target.value, 10))}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(terminalMultiple, MULTIPLE_MIN, MULTIPLE_MAX),
                } as React.CSSProperties
              }
            />
            <div className="font-mono-num mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>12x</span>
              <span>25x</span>
              <span>40x</span>
            </div>
          </div>

          {/* Target Reported FCF Margin */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label
                htmlFor="dcf-margin"
                className="font-medium text-[var(--text-primary)]"
              >
                Year-10 Reported FCF Margin
              </label>
              <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                {formatPct(targetFcfMargin)}
              </span>
            </div>
            <input
              id="dcf-margin"
              type="range"
              min={MARGIN_MIN}
              max={MARGIN_MAX}
              step={0.5}
              value={targetFcfMargin}
              onChange={(e) => setTargetFcfMargin(parseFloat(e.target.value))}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(targetFcfMargin, MARGIN_MIN, MARGIN_MAX),
                } as React.CSSProperties
              }
            />
            <div className="font-mono-num mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>1%</span>
              <span>28%</span>
              <span>55%</span>
            </div>
          </div>

          {/* Ongoing SBC Drag */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label
                htmlFor="dcf-sbc"
                className="font-medium text-[var(--text-primary)]"
              >
                Long-Term SBC Drag (% Revenue)
              </label>
              <span className="font-mono-num font-semibold text-[var(--sbc)]">
                −{formatPct(sbcDrag)}
              </span>
            </div>
            <input
              id="dcf-sbc"
              type="range"
              min={0}
              max={sbcMax}
              step={0.5}
              value={sbcDrag}
              onChange={(e) => setSbcDrag(parseFloat(e.target.value))}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(sbcDrag, 0, sbcMax),
                } as React.CSSProperties
              }
            />
            <div className="mt-2 flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs">
              <span className="text-[var(--text-secondary)]">
                Net Year-10 True FCF Margin
              </span>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {formatPct(effectiveTargetTrueMargin)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Right: Implied Output + 5x5 Sensitivity Matrix */}
      <section className="flex flex-col gap-5 lg:col-span-7">
        {/* Hero Implied CAGR Card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                <span>Priced-In Growth (10Y Rev CAGR)</span>
                <MetricHint
                  label="Priced-In Growth"
                  description="The annual revenue growth rate required over the next 10 years for discounted True FCF plus Terminal Value to equal today's Enterprise Value."
                  align="left"
                />
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="font-mono-num text-4xl font-semibold tracking-[-0.03em] text-[var(--amber)] sm:text-5xl">
                  {result.clamped === "negative-ev"
                    ? "N/A"
                    : result.clamped === "high"
                      ? `>${formatPct(result.impliedRevenueCagrPct)}`
                      : result.clamped === "low"
                        ? `<${formatPct(result.impliedRevenueCagrPct)}`
                        : formatPct(result.impliedRevenueCagrPct)}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {result.clamped === "negative-ev"
                    ? "Net cash exceeds market cap"
                    : "/ yr through Year 10"}
                </span>
              </div>
              {result.clamped && result.clamped !== "negative-ev" && (
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  Reached solver bound ({result.clamped === "high" ? "+85%" : "-25%"}) under current assumptions.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                exportReverseDcfCard(
                  company,
                  {
                    waccPct: wacc,
                    terminalMultiple,
                    targetTrueFcfMarginPct: effectiveTargetTrueMargin,
                    enterpriseValue,
                  },
                  result
                );
                setExported(true);
                window.setTimeout(() => setExported(false), 1800);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:bg-[var(--amber-soft)] hover:text-[var(--amber)] cursor-pointer"
            >
              {exported ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[var(--positive)]" />
                  Exported
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Export PNG
                </>
              )}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-3">
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Current Enterprise Value
              </div>
              <div className="font-mono-num mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                {formatCurrencyCompact(enterpriseValue)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Implied Year-10 Revenue
              </div>
              <div className="font-mono-num mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                {formatCurrencyCompact(result.year10Revenue)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Implied Year-10 True FCF
              </div>
              <div className="font-mono-num mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                {formatCurrencyCompact(result.year10TrueFcf)}
              </div>
            </div>
          </div>
        </div>

        {/* 5x5 Sensitivity Matrix */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Implied 10Y CAGR Sensitivity Matrix
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Rows: WACC, Columns: Terminal True FCF Multiple. Click any cell to snap sliders.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-center text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1.5 text-left text-[11px] font-medium text-[var(--text-muted)]">
                    WACC \ Mult
                  </th>
                  {multSteps.map((m, mIdx) => (
                    <th
                      key={`m-${mIdx}`}
                      className={`font-mono-num px-2 py-1.5 text-[11px] font-medium ${
                        mIdx === 2
                          ? "text-[var(--amber)]"
                          : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {m}x
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {waccSteps.map((w, rIdx) => (
                  <tr key={`w-${rIdx}`}>
                    <th
                      scope="row"
                      className={`font-mono-num px-2 py-1.5 text-left text-[11px] font-medium ${
                        rIdx === 2
                          ? "text-[var(--amber)]"
                          : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {formatPct(w, false, 2)}
                    </th>
                    {matrix[rIdx].map((cell, cIdx) => {
                      const isCenter =
                        Math.abs(w - wacc) < 0.01 &&
                        multSteps[cIdx] === Math.round(terminalMultiple);
                      return (
                        <td key={`c-${rIdx}-${cIdx}`} className="p-0">
                          <button
                            type="button"
                            aria-label={`Set WACC to ${formatPct(w, false, 2)} and exit multiple to ${multSteps[cIdx]}x: implied growth ${formatPct(cell.impliedRevenueCagrPct)}`}
                            onClick={() => {
                              setWacc(w);
                              setTerminalMultiple(multSteps[cIdx]);
                            }}
                            className={`font-mono-num w-full rounded-md px-2 py-2 text-xs transition-colors cursor-pointer ${
                              isCenter
                                ? "bg-[var(--amber-soft)] font-semibold text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                                : "bg-[var(--surface-subtle)] text-[var(--text-primary)] hover:bg-[var(--border)]"
                            }`}
                          >
                            {formatPct(cell.impliedRevenueCagrPct)}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
