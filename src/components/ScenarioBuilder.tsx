"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Link2 } from "lucide-react";
import {
  type CompanySnapshot,
  type ComputedAnnual,
  computeFiveYearScenario,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";
import { computeRevenueCagr } from "@/lib/insights";
import { REVERSE_DCF_PARAMS } from "@/lib/valuation-link";

interface ScenarioBuilderProps {
  company: CompanySnapshot;
  latest: ComputedAnnual;
}

function progressPct(value: number, min: number, max: number): string {
  return `${(((value - min) / (max - min)) * 100).toFixed(1)}%`;
}

type ValuationLens = "fcf" | "ebit" | "pe";

const GROWTH_RANGE = { min: -5, max: 45 };
const MARGIN_RANGE = { min: 1, max: 55 };
const MULTIPLE_RANGE = { min: 8, max: 45 };

function readScenarioInput(
  params: URLSearchParams,
  key: string,
  { min, max }: { min: number; max: number }
): number | undefined {
  const raw = params.get(key)?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : undefined;
}

export function ScenarioBuilder({ company, latest }: ScenarioBuilderProps) {
  const fyOnly = company.annuals.filter((a) => a.fiscalYear !== "TTM");
  const latestFy = fyOnly[fyOnly.length - 1] ?? latest;

  const histGrowth = Math.max(
    1,
    Math.min(24, Math.round(computeRevenueCagr(company.annuals)))
  );

  const capexPctRev =
    latest.revenue > 0 ? (latest.capex / latest.revenue) * 100 : 0;
  const currentOpMargin =
    typeof latestFy.operatingIncome === "number" && latestFy.revenue > 0
      ? (latestFy.operatingIncome / latestFy.revenue) * 100
      : null;
  const currentNetMargin =
    typeof latestFy.netIncome === "number" && latestFy.revenue > 0
      ? (latestFy.netIncome / latestFy.revenue) * 100
      : null;

  const hasEbit = currentOpMargin !== null && currentOpMargin > 2;
  const hasPe = currentNetMargin !== null && currentNetMargin > 2;

  // Auto-select Earnings (P/E) for Financials/Banks where EV & FCF are structurally distorted
  const isFinancials = /financial|bank|insur/i.test(company.sector);

  // Auto-select Operating Income (EBIT) lens for heavy growth-CapEx compounders (e.g. AMZN)
  // where massive reinvestment temporarily depresses near-term Free Cash Flow
  const isHeavyCapexCycle =
    !isFinancials &&
    hasEbit &&
    capexPctRev >= 10 &&
    currentOpMargin! > Math.max(2, latest.trueFcfMargin * 1.6);

  const defaultLens: ValuationLens =
    isFinancials && hasPe ? "pe" : isHeavyCapexCycle ? "ebit" : "fcf";

  function defaultsForLens(lens: ValuationLens) {
    if (lens === "ebit" && hasEbit) {
      const m = Number(
        Math.max(3, Math.min(55, Math.round(currentOpMargin! * 1.05 * 2) / 2)).toFixed(1)
      );
      const mult = histGrowth >= 12 ? 20 : histGrowth >= 7 ? 16 : 13;
      return { margin: m, multiple: mult, currentMargin: currentOpMargin! };
    }
    if (lens === "pe" && hasPe) {
      const m = Number(
        Math.max(2, Math.min(50, Math.round(currentNetMargin! * 1.05 * 2) / 2)).toFixed(1)
      );
      const mult = histGrowth >= 12 ? 24 : histGrowth >= 7 ? 20 : 15;
      return { margin: m, multiple: mult, currentMargin: currentNetMargin! };
    }
    const rawBaseMargin = Math.max(
      1,
      company.defaultDcf.targetFcfMargin - company.defaultDcf.sbcDragPct
    );
    const m = Number(
      Math.max(1, Math.min(55, Math.round(rawBaseMargin * 2) / 2)).toFixed(1)
    );
    return {
      margin: m,
      multiple: company.defaultDcf.terminalMultiple,
      currentMargin: latest.trueFcfMargin,
    };
  }

  const [lens, setLens] = useState<ValuationLens>(defaultLens);
  const lensDefaults = defaultsForLens(lens);
  const baseMargin = lensDefaults.margin;
  const baseMultiple = lensDefaults.multiple;

  const [revGrowth, setRevGrowth] = useState(histGrowth);
  const [targetMargin, setTargetMargin] = useState(baseMargin);
  const [exitMultiple, setExitMultiple] = useState(baseMultiple);
  const [activePreset, setActivePreset] = useState<"bear" | "base" | "bull" | "custom">("base");
  const [fromSharedLink, setFromSharedLink] = useState(false);
  const [copiedThesis, setCopiedThesis] = useState(false);

  // Hydrate shared thesis query params (?tab=dcf&lens=fcf&rev=15&m=28&exit=22)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lensParam = params.get("lens");
    const revParam = readScenarioInput(params, "rev", GROWTH_RANGE);
    const mParam = readScenarioInput(params, "m", MARGIN_RANGE);
    const exitParam = readScenarioInput(params, "exit", MULTIPLE_RANGE);
    let loaded = false;

    if (
      (lensParam === "fcf" ||
        (lensParam === "ebit" && hasEbit) ||
        (lensParam === "pe" && hasPe))
    ) {
      setLens(lensParam);
      loaded = true;
    }
    if (revParam !== undefined) {
      setRevGrowth(revParam);
      loaded = true;
    }
    if (mParam !== undefined) {
      setTargetMargin(mParam);
      loaded = true;
    }
    if (exitParam !== undefined) {
      setExitMultiple(exitParam);
      loaded = true;
    }
    if (loaded) {
      setActivePreset("custom");
      setFromSharedLink(true);
    }
  }, [hasEbit, hasPe]);

  async function handleCopyThesisLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "dcf");
    url.searchParams.set("model", "scenario");
    for (const key of REVERSE_DCF_PARAMS) url.searchParams.delete(key);
    url.searchParams.set("lens", lens);
    url.searchParams.set("rev", String(revGrowth));
    url.searchParams.set("m", String(targetMargin));
    url.searchParams.set("exit", String(exitMultiple));
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopiedThesis(true);
      window.setTimeout(() => setCopiedThesis(false), 1800);
    } catch {
      // Ignore clipboard errors
    }
  }

  function switchLens(nextLens: ValuationLens) {
    setLens(nextLens);
    const d = defaultsForLens(nextLens);
    setRevGrowth(histGrowth);
    setTargetMargin(d.margin);
    setExitMultiple(d.multiple);
    setActivePreset("base");
  }

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
        currentTrueFcfMarginPct: lensDefaults.currentMargin,
        netCash: lens === "pe" ? 0 : company.cashAndEquiv - company.totalDebt,
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
      lensDefaults.currentMargin,
      lens,
      revGrowth,
      targetMargin,
      exitMultiple,
    ]
  );

  // Baseline 3-model Fair Value comparison strip (so users see all lenses at a glance)
  const modelStrip = useMemo(() => {
    const lenses: Array<{ id: ValuationLens; label: string; enabled: boolean }> = [
      { id: "fcf", label: "True FCF", enabled: true },
      { id: "ebit", label: "EBIT", enabled: hasEbit },
      { id: "pe", label: "P/E", enabled: hasPe },
    ];
    return lenses
      .filter((m) => m.enabled)
      .map((m) => {
        const d = defaultsForLens(m.id);
        const res = computeFiveYearScenario({
          currentPrice: company.price,
          dilutedShares: latest.dilutedShares,
          baseRevenue: latest.revenue,
          currentTrueFcfMarginPct: d.currentMargin,
          netCash: m.id === "pe" ? 0 : company.cashAndEquiv - company.totalDebt,
          revGrowthPct: histGrowth,
          targetTrueFcfMarginPct: d.margin,
          exitMultiple: d.multiple,
          hurdleRatePct: 10,
        });
        return {
          id: m.id,
          label: m.label,
          fairValue: res.fairValueToday,
          upsidePct: res.upsidePct,
        };
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, latest, hasEbit, hasPe, histGrowth]);

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
    <div className="space-y-4">
      {fromSharedLink && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-2 text-xs text-[var(--text-primary)]">
          <span>
            <strong className="font-semibold text-[var(--amber)]">
              Shared 5-Year Thesis:
            </strong>{" "}
            Loaded custom assumptions ({revGrowth}% rev growth, {targetMargin}% margin, {exitMultiple}x exit). Drag any slider to stress-test your own view.
          </span>
          <button
            type="button"
            onClick={() => {
              applyPreset("base");
              setFromSharedLink(false);
            }}
            className="font-medium text-[var(--amber)] hover:underline cursor-pointer"
          >
            Reset to Base
          </button>
        </div>
      )}
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Left: Simple 3-Slider Controls */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              Your 5-Year Thesis
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Pick a preset or drag 3 simple sliders to see your expected annual return.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyThesisLink}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 text-[11px] font-semibold text-[var(--amber)] transition-opacity hover:opacity-90 cursor-pointer"
          >
            {copiedThesis ? (
              <>
                <Check className="h-3 w-3 text-[var(--positive)]" />
                Copied Link
              </>
            ) : (
              <>
                <Link2 className="h-3 w-3" />
                Share Thesis
              </>
            )}
          </button>
        </div>

        {/* Valuation Methodology Selector */}
        {(hasEbit || hasPe) && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>Valuation Model</span>
              {isFinancials && lens === "pe" && (
                <span className="text-[var(--amber)]">
                  Auto-selected (Financials)
                </span>
              )}
              {isHeavyCapexCycle && lens === "ebit" && (
                <span className="text-[var(--amber)]">
                  Auto-selected (heavy growth CapEx)
                </span>
              )}
            </div>
            <div className="inline-flex w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5 text-xs">
              {(
                [
                  { id: "fcf" as const, label: "True FCF", enabled: true },
                  { id: "ebit" as const, label: "Operating (EBIT)", enabled: hasEbit },
                  { id: "pe" as const, label: "Earnings (P/E)", enabled: hasPe },
                ]
              )
                .filter((m) => m.enabled)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => switchLens(m.id)}
                    className={`flex-1 rounded-md px-2 py-1.5 font-medium transition-colors cursor-pointer ${
                      lens === m.id
                        ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
            </div>
          </div>
        )}

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
              {...GROWTH_RANGE}
              step={1}
              value={revGrowth}
              onChange={(e) => {
                setRevGrowth(parseInt(e.target.value, 10));
                setActivePreset("custom");
              }}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(revGrowth, GROWTH_RANGE.min, GROWTH_RANGE.max),
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
                {lens === "ebit"
                  ? "Year-5 Operating Margin (EBIT)"
                  : lens === "pe"
                    ? "Year-5 Net Profit Margin"
                    : "Year-5 Real Cash Margin (True FCF)"}
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {formatPct(targetMargin, false, 1)}
              </span>
            </div>
            <input
              id="sc-margin"
              type="range"
              {...MARGIN_RANGE}
              step={0.5}
              value={targetMargin}
              onChange={(e) => {
                setTargetMargin(parseFloat(e.target.value));
                setActivePreset("custom");
              }}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(targetMargin, MARGIN_RANGE.min, MARGIN_RANGE.max),
                } as React.CSSProperties
              }
            />
            <div className="font-mono-num mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>1%</span>
              <span>Now: {formatPct(lensDefaults.currentMargin, false, 1)}</span>
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
                {lens === "ebit"
                  ? "Year-5 Valuation Multiple (EV / EBIT)"
                  : lens === "pe"
                    ? "Year-5 Valuation Multiple (P/E)"
                    : "Year-5 Valuation Multiple (EV / True FCF)"}
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {exitMultiple}x
              </span>
            </div>
            <input
              id="sc-mult"
              type="range"
              {...MULTIPLE_RANGE}
              step={1}
              value={exitMultiple}
              onChange={(e) => {
                setExitMultiple(parseInt(e.target.value, 10));
                setActivePreset("custom");
              }}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(exitMultiple, MULTIPLE_RANGE.min, MULTIPLE_RANGE.max),
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
            <span>/</span>
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
            <strong className="font-mono-num text-[var(--text-primary)]">{targetMargin}%</strong>{" "}
            {lens === "ebit" ? "operating" : lens === "pe" ? "net profit" : "real cash"} margin and trades at{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{exitMultiple}x</strong> in 5 years, shares reach{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">${projection.yr5TargetPrice.toFixed(2)}</strong>, worth{" "}
            <strong className={`font-mono-num ${verdict.color}`}>${projection.fairValueToday.toFixed(2)}</strong> today if you require a 10%/yr return.
          </p>

          {modelStrip.length >= 2 && (
            <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
              <span className="text-[11px] text-[var(--text-muted)]">
                Base Case across models:
              </span>
              {modelStrip.map((m) => {
                const isSelected = lens === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => switchLens(m.id)}
                    className={`font-mono-num inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[var(--amber-soft)] font-semibold text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                        : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span>{m.label}:</span>
                    <strong>${m.fairValue.toFixed(0)}</strong>
                  </button>
                );
              })}
            </div>
          )}
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
    </div>
  );
}
