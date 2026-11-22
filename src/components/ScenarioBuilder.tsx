"use client";

import { useMemo, useState } from "react";
import {
  type CompanySnapshot,
  type ComputedAnnual,
  computeNetDilutionCagr,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";
import { computeRevenueCagr } from "@/lib/insights";

interface ScenarioBuilderProps {
  company: CompanySnapshot;
  latest: ComputedAnnual;
}

function progressPct(value: number, min: number, max: number): string {
  return `${(((value - min) / (max - min)) * 100).toFixed(1)}%`;
}

export function ScenarioBuilder({ company, latest }: ScenarioBuilderProps) {
  const histGrowth = Math.max(
    2,
    Math.min(40, Math.round(computeRevenueCagr(company.annuals)))
  );
  const baseMargin = Math.max(
    5,
    Math.min(50, Math.round(company.defaultDcf.targetFcfMargin - company.defaultDcf.sbcDragPct))
  );
  const baseMultiple = company.defaultDcf.terminalMultiple;

  const [revGrowth, setRevGrowth] = useState(histGrowth);
  const [targetMargin, setTargetMargin] = useState(baseMargin);
  const [exitMultiple, setExitMultiple] = useState(baseMultiple);
  const [activePreset, setActivePreset] = useState<"bear" | "base" | "bull" | "custom">("base");

  const dilutionCagr = useMemo(
    () => computeNetDilutionCagr(company.annuals),
    [company.annuals]
  );

  function applyPreset(kind: "bear" | "base" | "bull") {
    setActivePreset(kind);
    if (kind === "bear") {
      setRevGrowth(Math.max(0, Math.round(histGrowth * 0.55)));
      setTargetMargin(Math.max(4, Math.round(baseMargin * 0.78)));
      setExitMultiple(Math.max(10, Math.round(baseMultiple * 0.7)));
    } else if (kind === "base") {
      setRevGrowth(histGrowth);
      setTargetMargin(baseMargin);
      setExitMultiple(baseMultiple);
    } else {
      setRevGrowth(Math.min(45, Math.round(histGrowth * 1.3 + 3)));
      setTargetMargin(Math.min(55, Math.round(baseMargin * 1.18 + 2)));
      setExitMultiple(Math.min(42, Math.round(baseMultiple * 1.25)));
    }
  }

  const projection = useMemo(() => {
    const years = 5;
    const yr5Rev = latest.revenue * Math.pow(1 + revGrowth / 100, years);
    const yr5TrueFcf = yr5Rev * (targetMargin / 100);
    const yr5Ev = yr5TrueFcf * exitMultiple;
    // Approximate net cash accumulation over 5 years + current net cash
    const currentNetCash = company.cashAndEquiv - company.totalDebt;
    const avgFcf = (Math.max(0, latest.trueFcf) + yr5TrueFcf) / 2;
    const yr5MarketCap = Math.max(1, yr5Ev + currentNetCash + avgFcf * 3.5);

    // Adjust share count modestly by historical net dilution (clamped to [-4%, +4%]/yr)
    const clampedDilution = Math.max(-4, Math.min(4, dilutionCagr));
    const yr5Shares =
      latest.dilutedShares * Math.pow(1 + clampedDilution / 100, years);

    const targetPrice = yr5MarketCap / Math.max(1, yr5Shares);
    const totalMultiple = targetPrice / Math.max(0.01, company.price);
    const irrPct = (Math.pow(Math.max(0.05, totalMultiple), 1 / years) - 1) * 100;

    return {
      yr5Rev,
      yr5TrueFcf,
      yr5MarketCap,
      targetPrice,
      totalMultiple,
      irrPct,
    };
  }, [
    latest.revenue,
    latest.trueFcf,
    latest.dilutedShares,
    revGrowth,
    targetMargin,
    exitMultiple,
    company.cashAndEquiv,
    company.totalDebt,
    company.price,
    dilutionCagr,
  ]);

  const irrColor =
    projection.irrPct >= 14
      ? "text-[var(--positive)]"
      : projection.irrPct >= 7
        ? "text-[var(--amber)]"
        : "text-[var(--negative)]";

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Left: Simple 3-Slider Controls */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              Your 5-Year Thesis
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Pick a preset or drag 3 simple sliders to see your expected annual return.
            </p>
          </div>
        </div>

        {/* Bear / Base / Bull Presets */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(["bear", "base", "bull"] as const).map((kind) => {
            const active = activePreset === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => applyPreset(kind)}
                className={`rounded-lg border py-2 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  active
                    ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {kind} Case
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-5">
          {/* Revenue Growth */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label
                htmlFor="sc-growth"
                className="font-medium text-[var(--text-primary)]"
              >
                Annual Revenue Growth (Next 5Y)
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {formatPct(revGrowth, true, 0)}
              </span>
            </div>
            <input
              id="sc-growth"
              type="range"
              min={-5}
              max={45}
              step={1}
              value={revGrowth}
              onChange={(e) => {
                setRevGrowth(parseInt(e.target.value, 10));
                setActivePreset("custom");
              }}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(revGrowth, -5, 45),
                } as React.CSSProperties
              }
            />
            <div className="font-mono-num mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>-5%</span>
              <span>Hist: {formatPct(histGrowth, true, 0)}</span>
              <span>+45%</span>
            </div>
          </div>

          {/* Year-5 True FCF Margin */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label
                htmlFor="sc-margin"
                className="font-medium text-[var(--text-primary)]"
              >
                Year-5 Real Cash Margin (True FCF)
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {formatPct(targetMargin, false, 0)}
              </span>
            </div>
            <input
              id="sc-margin"
              type="range"
              min={2}
              max={55}
              step={1}
              value={targetMargin}
              onChange={(e) => {
                setTargetMargin(parseInt(e.target.value, 10));
                setActivePreset("custom");
              }}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(targetMargin, 2, 55),
                } as React.CSSProperties
              }
            />
            <div className="font-mono-num mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>2%</span>
              <span>Now: {formatPct(latest.trueFcfMargin, false, 0)}</span>
              <span>55%</span>
            </div>
          </div>

          {/* Exit Multiple */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label
                htmlFor="sc-mult"
                className="font-medium text-[var(--text-primary)]"
              >
                Year-5 Valuation Multiple (EV / True FCF)
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {exitMultiple}x
              </span>
            </div>
            <input
              id="sc-mult"
              type="range"
              min={8}
              max={45}
              step={1}
              value={exitMultiple}
              onChange={(e) => {
                setExitMultiple(parseInt(e.target.value, 10));
                setActivePreset("custom");
              }}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(exitMultiple, 8, 45),
                } as React.CSSProperties
              }
            />
            <div className="font-mono-num mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>8x (Value)</span>
              <span>22x (Quality)</span>
              <span>45x (Premium)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Right: Plain-English Return Output */}
      <section className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-7">
        <div>
          <div className="text-xs font-medium text-[var(--text-secondary)]">
            Projected 5-Year Annual Return (IRR)
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-4">
            <span
              className={`font-mono-num text-5xl font-semibold tracking-[-0.03em] ${irrColor}`}
            >
              {formatPct(projection.irrPct, true)}
            </span>
            <span className="font-mono-num text-sm text-[var(--text-secondary)]">
              / yr ·{" "}
              <strong className="text-[var(--text-primary)]">
                {projection.totalMultiple.toFixed(2)}x
              </strong>{" "}
              money in 5 years
            </span>
          </div>

          <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-xs leading-relaxed text-[var(--text-secondary)]">
            If <strong className="text-[var(--text-primary)]">{company.name}</strong> grows revenue{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{formatPct(revGrowth, true, 0)}/yr</strong> to{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{formatCurrencyCompact(projection.yr5Rev)}</strong>, achieves a{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{targetMargin}%</strong> True FCF margin, and trades at{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{exitMultiple}x</strong> in Year 5, the stock reaches{" "}
            <strong className="font-mono-num text-[var(--amber)]">${projection.targetPrice.toFixed(2)}</strong> vs.{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">${company.price.toFixed(2)}</strong> today.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-5 sm:grid-cols-4">
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Today&apos;s Price</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
              ${company.price.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Year-5 Target</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--amber)]">
              ${projection.targetPrice.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Year-5 Revenue</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
              {formatCurrencyCompact(projection.yr5Rev)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Year-5 True FCF</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
              {formatCurrencyCompact(projection.yr5TrueFcf)}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
