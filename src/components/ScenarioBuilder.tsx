"use client";

import { useMemo, useState } from "react";
import {
  type CompanySnapshot,
  type ComputedAnnual,
  computeFiveYearScenario,
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
    1,
    Math.min(24, Math.round(computeRevenueCagr(company.annuals)))
  );
  const rawBaseMargin = Math.max(
    1,
    company.defaultDcf.targetFcfMargin - company.defaultDcf.sbcDragPct
  );
  const baseMargin = Number(
    Math.max(1, Math.min(55, Math.round(rawBaseMargin * 2) / 2)).toFixed(1)
  );
  const baseMultiple = company.defaultDcf.terminalMultiple;

  const [revGrowth, setRevGrowth] = useState(histGrowth);
  const [targetMargin, setTargetMargin] = useState(baseMargin);
  const [exitMultiple, setExitMultiple] = useState(baseMultiple);
  const [activePreset, setActivePreset] = useState<"bear" | "base" | "bull" | "custom">("base");

  function applyPreset(kind: "bear" | "base" | "bull") {
    setActivePreset(kind);
    if (kind === "bear") {
      setRevGrowth(Math.max(0, Math.round(histGrowth * 0.55)));
      setTargetMargin(
        Number(Math.max(1, Math.round(baseMargin * 0.8 * 2) / 2).toFixed(1))
      );
      setExitMultiple(Math.max(10, Math.round(baseMultiple * 0.72)));
    } else if (kind === "base") {
      setRevGrowth(histGrowth);
      setTargetMargin(baseMargin);
      setExitMultiple(baseMultiple);
    } else {
      setRevGrowth(Math.min(45, Math.round(histGrowth * 1.3 + 2)));
      setTargetMargin(
        Number(Math.min(55, Math.round(baseMargin * 1.2 * 2) / 2).toFixed(1))
      );
      setExitMultiple(Math.min(42, Math.round(baseMultiple * 1.22)));
    }
  }

  const projection = useMemo(
    () =>
      computeFiveYearScenario({
        currentPrice: company.price,
        dilutedShares: latest.dilutedShares,
        baseRevenue: latest.revenue,
        currentTrueFcfMarginPct: latest.trueFcfMargin,
        netCash: company.cashAndEquiv - company.totalDebt,
        revGrowthPct: revGrowth,
        targetTrueFcfMarginPct: targetMargin,
        exitMultiple,
        hurdleRatePct: 10,
      }),
    [
      company.price,
      company.cashAndEquiv,
      company.totalDebt,
      latest.dilutedShares,
      latest.revenue,
      latest.trueFcfMargin,
      revGrowth,
      targetMargin,
      exitMultiple,
    ]
  );

  const verdict =
    projection.upsidePct >= 12
      ? {
          label: `${Math.round(projection.upsidePct)}% Undervalued`,
          badge: "Undervalued",
          color: "text-[var(--positive)]",
          pill: "bg-[var(--surface-subtle)] text-[var(--positive)] ring-1 ring-inset ring-[var(--border-strong)]",
        }
      : projection.upsidePct <= -12
        ? {
            label: `${Math.abs(Math.round(projection.upsidePct))}% Overvalued`,
            badge: "Overvalued",
            color: "text-[var(--negative)]",
            pill: "bg-[var(--surface-subtle)] text-[var(--negative)] ring-1 ring-inset ring-[var(--border-strong)]",
          }
        : {
            label: "Roughly Fairly Valued",
            badge: "Fairly Priced",
            color: "text-[var(--amber)]",
            pill: "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]",
          };

  const barMax = Math.max(company.price, projection.fairValueToday) * 1.15;
  const pricePosPct = Math.min(100, (company.price / barMax) * 100);
  const fairPosPct = Math.min(100, (projection.fairValueToday / barMax) * 100);

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
                {formatPct(targetMargin, false, 1)}
              </span>
            </div>
            <input
              id="sc-margin"
              type="range"
              min={1}
              max={55}
              step={0.5}
              value={targetMargin}
              onChange={(e) => {
                setTargetMargin(parseFloat(e.target.value));
                setActivePreset("custom");
              }}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(targetMargin, 1, 55),
                } as React.CSSProperties
              }
            />
            <div className="font-mono-num mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>1%</span>
              <span>Now: {formatPct(latest.trueFcfMargin, false, 1)}</span>
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

      {/* Right: Clear Fair Value & Undervalued / Overvalued Output */}
      <section className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-7">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Estimated Fair Value Today (at 10%/yr target return)
            </span>
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${verdict.pill}`}
            >
              {verdict.badge}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-4">
            <span
              className={`font-mono-num text-4xl font-semibold tracking-[-0.03em] sm:text-5xl ${verdict.color}`}
            >
              {verdict.label}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-3 text-sm text-[var(--text-secondary)]">
            <span>
              Fair value:{" "}
              <strong className="font-mono-num text-[var(--text-primary)]">
                ${projection.fairValueToday.toFixed(2)}
              </strong>
            </span>
            <span>·</span>
            <span>
              Current price:{" "}
              <strong className="font-mono-num text-[var(--text-primary)]">
                ${company.price.toFixed(2)}
              </strong>
            </span>
          </div>

          {/* Visual Fair Value vs. Current Price Comparison Bars */}
          <div className="mt-5 space-y-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
            <div>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Current Share Price</span>
                <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                  ${company.price.toFixed(2)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full bg-[var(--text-secondary)] transition-all duration-150"
                  style={{ width: `${Math.max(4, pricePosPct)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Your Fair Value Today</span>
                <span className={`font-mono-num font-semibold ${verdict.color}`}>
                  ${projection.fairValueToday.toFixed(2)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${Math.max(4, fairPosPct)}%`,
                    backgroundColor:
                      projection.upsidePct >= 12
                        ? "var(--positive)"
                        : projection.upsidePct <= -12
                          ? "var(--negative)"
                          : "var(--amber)",
                  }}
                />
              </div>
            </div>
          </div>

          <p className="mt-3.5 text-xs leading-relaxed text-[var(--text-secondary)]">
            If <strong className="text-[var(--text-primary)]">{company.name}</strong> grows revenue{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{formatPct(revGrowth, true, 0)}/yr</strong> to{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{formatCurrencyCompact(projection.yr5Rev)}</strong> at a{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{targetMargin}%</strong> real cash margin and trades at{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{exitMultiple}x</strong> in 5 years, shares reach{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">${projection.yr5TargetPrice.toFixed(2)}</strong>, worth{" "}
            <strong className={`font-mono-num ${verdict.color}`}>${projection.fairValueToday.toFixed(2)}</strong> today if you require a 10%/yr return.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Expected Return / yr</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
              {formatPct(projection.irrPct, true)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Year-5 Share Price</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--amber)]">
              ${projection.yr5TargetPrice.toFixed(2)}
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
