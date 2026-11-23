"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import {
  type CompanySnapshot,
  type ComputedAnnual,
  computeEnterpriseValue,
  formatCurrencyCompact,
  formatPct,
  solveReverseDcf,
} from "@/lib/finance";
import { exportReverseDcfCard } from "@/lib/export-card";

interface ReverseDcfStudioProps {
  company: CompanySnapshot;
  latest: ComputedAnnual;
}

function progressPct(value: number, min: number, max: number): string {
  return `${(((value - min) / (max - min)) * 100).toFixed(1)}%`;
}

export function ReverseDcfStudio({ company, latest }: ReverseDcfStudioProps) {
  const [wacc, setWacc] = useState(company.defaultDcf.wacc);
  const [terminalMultiple, setTerminalMultiple] = useState(
    company.defaultDcf.terminalMultiple
  );
  const [targetFcfMargin, setTargetFcfMargin] = useState(
    company.defaultDcf.targetFcfMargin
  );
  const [sbcDrag, setSbcDrag] = useState(company.defaultDcf.sbcDragPct);
  const hydratedFromUrl = useRef(false);

  // Hydrate custom Reverse DCF assumptions from shareable URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pWacc = parseFloat(params.get("wacc") ?? "");
    const pMult = parseInt(params.get("mult") ?? "", 10);
    const pMargin = parseFloat(params.get("margin") ?? "");
    const pSbc = parseFloat(params.get("sbc") ?? "");

    if (Number.isFinite(pWacc) && pWacc >= 6.5 && pWacc <= 15) setWacc(pWacc);
    if (Number.isFinite(pMult) && pMult >= 12 && pMult <= 40)
      setTerminalMultiple(pMult);
    if (Number.isFinite(pMargin) && pMargin >= 2 && pMargin <= 55)
      setTargetFcfMargin(pMargin);
    if (Number.isFinite(pSbc) && pSbc >= 0 && pSbc <= 25) setSbcDrag(pSbc);
    hydratedFromUrl.current = true;
  }, []);

  // Keep URL query params cleanly synced so "Share" captures exact assumptions
  useEffect(() => {
    if (!hydratedFromUrl.current) return;
    const isDefault =
      wacc === company.defaultDcf.wacc &&
      terminalMultiple === company.defaultDcf.terminalMultiple &&
      targetFcfMargin === company.defaultDcf.targetFcfMargin &&
      sbcDrag === company.defaultDcf.sbcDragPct;

    const url = new URL(window.location.href);
    if (isDefault) {
      url.searchParams.delete("wacc");
      url.searchParams.delete("mult");
      url.searchParams.delete("margin");
      url.searchParams.delete("sbc");
    } else {
      url.searchParams.set("tab", "dcf");
      url.searchParams.set("wacc", String(wacc));
      url.searchParams.set("mult", String(terminalMultiple));
      url.searchParams.set("margin", String(targetFcfMargin));
      url.searchParams.set("sbc", String(sbcDrag));
    }
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [wacc, terminalMultiple, targetFcfMargin, sbcDrag, company.defaultDcf]);

  const enterpriseValue = useMemo(
    () => computeEnterpriseValue(company),
    [company]
  );

  // Net True FCF Margin at Year 10 = Target Reported FCF Margin - Ongoing SBC Drag
  const effectiveTargetTrueMargin = Math.max(1.5, targetFcfMargin - sbcDrag);

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

  // 5x5 Sensitivity Matrix centered around current sliders
  const waccSteps = [-1.5, -0.75, 0, 0.75, 1.5].map((d) =>
    Number(Math.max(6, Math.min(16, wacc + d)).toFixed(2))
  );
  const multSteps = [-6, -3, 0, 3, 6].map((d) =>
    Math.max(10, Math.min(45, Math.round(terminalMultiple + d)))
  );

  const matrix = useMemo(() => {
    return waccSteps.map((w) =>
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
  }, [
    enterpriseValue,
    latest.revenue,
    latest.trueFcfMargin,
    effectiveTargetTrueMargin,
    waccSteps,
    multSteps,
  ]);

  function resetDefaults() {
    setWacc(company.defaultDcf.wacc);
    setTerminalMultiple(company.defaultDcf.terminalMultiple);
    setTargetFcfMargin(company.defaultDcf.targetFcfMargin);
    setSbcDrag(company.defaultDcf.sbcDragPct);
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
              min={6.5}
              max={15}
              step={0.25}
              value={wacc}
              onChange={(e) => setWacc(parseFloat(e.target.value))}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(wacc, 6.5, 15),
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
              min={12}
              max={40}
              step={1}
              value={terminalMultiple}
              onChange={(e) => setTerminalMultiple(parseInt(e.target.value, 10))}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(terminalMultiple, 12, 40),
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
              min={1}
              max={55}
              step={0.5}
              value={targetFcfMargin}
              onChange={(e) => setTargetFcfMargin(parseFloat(e.target.value))}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(targetFcfMargin, 1, 55),
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
              max={25}
              step={0.5}
              value={sbcDrag}
              onChange={(e) => setSbcDrag(parseFloat(e.target.value))}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(sbcDrag, 0, 25),
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
              <div className="text-xs font-medium text-[var(--text-secondary)]">
                Market-Implied 10Y Revenue CAGR
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="font-mono-num text-4xl font-semibold tracking-[-0.03em] text-[var(--amber)] sm:text-5xl">
                  {formatPct(result.impliedRevenueCagrPct)}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  / yr through Year 10
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                exportReverseDcfCard(
                  company,
                  {
                    waccPct: wacc,
                    terminalMultiple,
                    targetTrueFcfMarginPct: effectiveTargetTrueMargin,
                    enterpriseValue,
                  },
                  result
                )
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:bg-[var(--amber-soft)] hover:text-[var(--amber)] cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Export PNG
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
                      const isCenter = rIdx === 2 && cIdx === 2;
                      return (
                        <td key={`c-${rIdx}-${cIdx}`} className="p-0">
                          <button
                            type="button"
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
