"use client";

import { useMemo, useState } from "react";
import {
  type CompanySnapshot,
  type ComputedAnnual,
  formatPct,
} from "@/lib/finance";
import { indexPriceAndFundamentals } from "@/lib/price-fundamentals";

interface PriceVsFundamentalsChartProps {
  company: CompanySnapshot;
  series: ComputedAnnual[];
}

export function PriceVsFundamentalsChart({
  company,
  series,
}: PriceVsFundamentalsChartProps) {
  const chart = useMemo(() => indexPriceAndFundamentals(company, series), [company, series]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (!chart) return null;

  const { indexed, fundLabel } = chart;
  const activeIndex = hoveredIdx !== null && indexed[hoveredIdx] ? hoveredIdx : indexed.length - 1;
  const active = indexed[activeIndex];
  const last = indexed[indexed.length - 1];
  const priceChangePct = last.priceIdx - 100;
  const fundChangePct = last.fundIdx - 100;
  const spread = priceChangePct - fundChangePct;

  const verdict =
    spread > 25
      ? {
          badge: "Multiple Expanded",
          detail: `Share price (${formatPct(priceChangePct, true, 0)}) outran ${fundLabel} (${formatPct(fundChangePct, true, 0)}). Investors are paying a richer multiple than in ${indexed[0].fiscalYear}.`,
          tone: "text-[var(--amber)] bg-[var(--amber-soft)] ring-[var(--amber-border)]",
        }
      : spread < -20
        ? {
            badge: "Multiple Compressed",
            detail: `${fundLabel} (${formatPct(fundChangePct, true, 0)}) grew faster than the stock (${formatPct(priceChangePct, true, 0)}). Valuation has gotten cheaper relative to fundamentals.`,
            tone: "text-[var(--positive)] bg-[var(--surface-subtle)] ring-[var(--border-strong)]",
          }
        : {
            badge: "Tracking Fundamentals",
            detail: `Share price (${formatPct(priceChangePct, true, 0)}) has largely tracked ${fundLabel} (${formatPct(fundChangePct, true, 0)}) since ${indexed[0].fiscalYear}.`,
            tone: "text-[var(--text-primary)] bg-[var(--surface-subtle)] ring-[var(--border)]",
          };

  // Precision SVG coordinates
  const W = 760;
  const H = 230;
  const padL = 52;
  const padR = 24;
  const padT = 20;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allVals = indexed.flatMap((d) => [d.priceIdx, d.fundIdx]);
  const maxVal = Math.max(...allVals) * 1.1;
  const lowest = Math.min(...allVals);
  const minVal = lowest - Math.abs(lowest) * 0.1;
  const range = Math.max(1, maxVal - minVal);

  const xFor = (i: number) =>
    padL + (i / Math.max(1, indexed.length - 1)) * plotW;
  const yFor = (v: number) => padT + ((maxVal - v) / range) * plotH;

  const pricePath = indexed
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(d.priceIdx).toFixed(1)}`)
    .join(" ");
  const fundPath = indexed
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(d.fundIdx).toFixed(1)}`)
    .join(" ");

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            Price vs. {fundLabel} (Indexed to 100 in {indexed[0].fiscalYear})
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            See whether the stock rose on fundamental growth or multiple expansion.
          </p>
        </div>

        <span
          className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${verdict.tone}`}
        >
          {verdict.badge}
        </span>
      </div>

      {/* Live Hover Readout */}
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-2.5 text-xs">
        <div>
          <div className="text-[10px] text-[var(--text-muted)]">Period</div>
          <div className="font-mono-num font-semibold text-[var(--text-primary)]">
            {active.fiscalYear}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="h-0.5 w-2.5 bg-[var(--amber)]" />
            Share Price
          </div>
          <div className="font-mono-num font-semibold text-[var(--amber)]">
            ${active.price.toFixed(2)}{" "}
            <span className="text-[10px] font-normal text-[var(--text-muted)]">
              ({formatPct(active.priceIdx - 100, true, 0)})
            </span>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="h-0.5 w-2.5 bg-[var(--text-primary)]" />
            {fundLabel}
          </div>
          <div className="font-mono-num font-semibold text-[var(--text-primary)]">
            ${active.fundVal.toFixed(2)}{" "}
            <span className="text-[10px] font-normal text-[var(--text-muted)]">
              ({formatPct(active.fundIdx - 100, true, 0)})
            </span>
          </div>
        </div>
      </div>

      {/* Dual-Line SVG */}
      <div className="mt-3 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full select-none"
          role="img"
          aria-label={`${company.ticker} Share Price vs ${fundLabel} indexed chart`}
        >
          {/* Baseline 100 line */}
          <line
            x1={padL}
            y1={yFor(100)}
            x2={W - padR}
            y2={yFor(100)}
            stroke="var(--border-strong)"
            strokeDasharray="3 3"
          />
          <text
            x={padL - 8}
            y={yFor(100) + 3.5}
            textAnchor="end"
            className="font-mono-num fill-[var(--text-muted)] text-[10px]"
          >
            100
          </text>
          <text
            x={padL - 8}
            y={padT + 6}
            textAnchor="end"
            className="font-mono-num fill-[var(--text-muted)] text-[10px]"
          >
            {Math.round(maxVal)}
          </text>

          {/* Lines */}
          <path
            d={fundPath}
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth={2}
            strokeOpacity={0.7}
          />
          <path
            d={pricePath}
            fill="none"
            stroke="var(--amber)"
            strokeWidth={2.25}
          />

          {/* Interactive points */}
          {indexed.map((d, i) => {
            const cx = xFor(i);
            const isActive = i === activeIndex;
            return (
              <g
                key={d.fiscalYear}
                onMouseEnter={() => setHoveredIdx(i)}
                onFocus={() => setHoveredIdx(i)}
                tabIndex={0}
                className="cursor-pointer outline-none"
              >
                <rect
                  x={cx - 28}
                  y={padT}
                  width={56}
                  height={plotH}
                  fill="transparent"
                />
                {isActive && (
                  <line
                    x1={cx}
                    y1={padT}
                    x2={cx}
                    y2={padT + plotH}
                    stroke="var(--border-strong)"
                    strokeWidth={1}
                  />
                )}
                <circle
                  cx={cx}
                  cy={yFor(d.fundIdx)}
                  r={isActive ? 4.5 : 3}
                  fill="var(--surface)"
                  stroke="var(--text-primary)"
                  strokeWidth={1.75}
                />
                <circle
                  cx={cx}
                  cy={yFor(d.priceIdx)}
                  r={isActive ? 4.5 : 3}
                  fill="var(--amber)"
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                />
                <text
                  x={cx}
                  y={H - 8}
                  textAnchor="middle"
                  className={`font-mono-num text-[10px] ${
                    isActive
                      ? "fill-[var(--text-primary)] font-semibold"
                      : "fill-[var(--text-muted)]"
                  }`}
                >
                  {d.fiscalYear}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="mt-2 text-xs text-[var(--text-secondary)]">
        {verdict.detail}
      </p>
    </section>
  );
}
