"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import {
  type CompanySnapshot,
  type ComputedAnnual,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";
import { exportTrueFcfCard } from "@/lib/export-card";

interface TrueFcfChartProps {
  company: CompanySnapshot;
  series: ComputedAnnual[];
}

export function TrueFcfChart({ company, series }: TrueFcfChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number>(series.length - 1);
  const active = series[hoveredIdx] ?? series[series.length - 1];

  // Precision SVG coordinate space (fixed aspect ratio, zero layout shift)
  const W = 760;
  const H = 300;
  const padL = 64;
  const padR = 54;
  const padT = 22;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allCashValues = series.flatMap((d) => [
    d.reportedFcf,
    d.sbc,
    d.trueFcf,
    0,
  ]);
  const maxCash = Math.max(...allCashValues) * 1.14;
  const minCash = Math.min(...allCashValues) * 1.14;
  const cashRange = Math.max(1, maxCash - minCash);

  const yCash = (val: number) =>
    padT + ((maxCash - val) / cashRange) * plotH;
  const zeroY = yCash(0);

  // Secondary axis for Diluted Shares (line overlay)
  const shareValues = series.map((d) => d.dilutedShares);
  const minShares = Math.min(...shareValues) * 0.92;
  const maxShares = Math.max(...shareValues) * 1.06;
  const shareRange = Math.max(1, maxShares - minShares);
  const yShare = (shares: number) =>
    padT + ((maxShares - shares) / shareRange) * plotH;

  const groupW = plotW / series.length;
  const barW = Math.min(24, (groupW - 36) / 3);
  const barGap = 4;

  const sharePath = series
    .map((d, i) => {
      const cx = padL + i * groupW + groupW / 2;
      const cy = yShare(d.dilutedShares);
      return `${i === 0 ? "M" : "L"} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
    })
    .join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => minCash + cashRange * t);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            Reported FCF vs. Stock-Based Compensation &amp; True FCF
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Hover any fiscal year to inspect the economic cash flow bridge and diluted share trend.
          </p>
        </div>

        <button
          type="button"
          onClick={() => exportTrueFcfCard(company, series)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:bg-[var(--amber-soft)] hover:text-[var(--amber)] cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          Export PNG
        </button>
      </div>

      {/* Zero-CLS live readout bar synced to hovered fiscal year */}
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 sm:grid-cols-5">
        <div>
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            Period
          </div>
          <div className="font-mono-num mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
            {active.fiscalYear}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            <span className="h-2 w-2 rounded-xs bg-[var(--reported)]" />
            Reported FCF
          </div>
          <div className="font-mono-num mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
            {formatCurrencyCompact(active.reportedFcf)}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            <span className="h-2 w-2 rounded-xs bg-[var(--sbc)]" />
            SBC Expense
          </div>
          <div className="font-mono-num mt-0.5 text-sm font-semibold text-[var(--sbc)]">
            {formatCurrencyCompact(active.sbc)}{" "}
            <span className="text-[11px] font-normal text-[var(--text-muted)]">
              ({formatPct(active.sbcPctRevenue)})
            </span>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            <span className="h-2 w-2 rounded-xs bg-[var(--amber)]" />
            True FCF
          </div>
          <div
            className={`font-mono-num mt-0.5 text-sm font-semibold ${
              active.trueFcf >= 0
                ? "text-[var(--amber)]"
                : "text-[var(--negative)]"
            }`}
          >
            {formatCurrencyCompact(active.trueFcf)}{" "}
            <span className="text-[11px] font-normal text-[var(--text-muted)]">
              ({formatPct(active.trueFcfMargin)})
            </span>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            <span className="h-0.5 w-2.5 bg-[var(--text-primary)]" />
            Diluted Shares
          </div>
          <div className="font-mono-num mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
            {active.dilutedShares.toLocaleString()}M
            {active.yoyShareChangePct !== null && (
              <span
                className={`ml-1 text-[11px] font-normal ${
                  active.yoyShareChangePct > 0.5
                    ? "text-[var(--negative)]"
                    : active.yoyShareChangePct < -0.5
                      ? "text-[var(--positive)]"
                      : "text-[var(--text-muted)]"
                }`}
              >
                ({formatPct(active.yoyShareChangePct, true)})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Precision SVG Chart */}
      <div className="mt-4 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full select-none"
          role="img"
          aria-label={`${company.ticker} Reported FCF, SBC, True FCF, and Diluted Shares chart`}
        >
          {/* Horizontal grid lines */}
          {ticks.map((val, i) => {
            const y = yCash(val);
            const isZero = Math.abs(val) < cashRange * 0.04;
            return (
              <g key={i}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke={isZero ? "var(--border-strong)" : "var(--border)"}
                  strokeWidth={isZero ? 1.2 : 1}
                  strokeDasharray={isZero ? undefined : "2 3"}
                />
                <text
                  x={padL - 10}
                  y={y + 3.5}
                  textAnchor="end"
                  className="font-mono-num fill-[var(--text-muted)] text-[10px]"
                >
                  {formatCurrencyCompact(val)}
                </text>
              </g>
            );
          })}

          {/* Explicit zero line if negative values exist */}
          {minCash < 0 && (
            <line
              x1={padL}
              y1={zeroY}
              x2={W - padR}
              y2={zeroY}
              stroke="var(--border-strong)"
              strokeWidth={1.2}
            />
          )}

          {/* Column hover highlight + grouped bars */}
          {series.map((d, idx) => {
            const colX = padL + idx * groupW;
            const centerX = colX + groupW / 2;
            const totalW = barW * 3 + barGap * 2;
            const startX = centerX - totalW / 2;
            const isHovered = idx === hoveredIdx;

            const bars = [
              { key: "rep", val: d.reportedFcf, fill: "var(--reported)" },
              { key: "sbc", val: d.sbc, fill: "var(--sbc)" },
              {
                key: "true",
                val: d.trueFcf,
                fill: d.trueFcf >= 0 ? "var(--amber)" : "var(--negative)",
              },
            ];

            return (
              <g
                key={d.fiscalYear}
                onMouseEnter={() => setHoveredIdx(idx)}
                onFocus={() => setHoveredIdx(idx)}
                className="cursor-pointer outline-none"
                tabIndex={0}
                aria-label={`${d.fiscalYear}: Reported FCF ${formatCurrencyCompact(d.reportedFcf)}, SBC ${formatCurrencyCompact(d.sbc)}, True FCF ${formatCurrencyCompact(d.trueFcf)}`}
              >
                {/* Hover column backdrop */}
                <rect
                  x={colX + 4}
                  y={padT}
                  width={groupW - 8}
                  height={plotH}
                  rx={6}
                  fill="var(--surface-subtle)"
                  opacity={isHovered ? 0.75 : 0}
                  className="transition-opacity duration-100"
                />

                {bars.map((b, bIdx) => {
                  const bx = startX + bIdx * (barW + barGap);
                  const by = b.val >= 0 ? yCash(b.val) : zeroY;
                  const bh = Math.max(2, Math.abs(yCash(b.val) - zeroY));
                  return (
                    <rect
                      key={b.key}
                      x={bx}
                      y={by}
                      width={barW}
                      height={bh}
                      rx={2.5}
                      fill={b.fill}
                      opacity={isHovered ? 1 : 0.84}
                      className="transition-opacity duration-100"
                    />
                  );
                })}

                {/* X-axis fiscal year */}
                <text
                  x={centerX}
                  y={H - 10}
                  textAnchor="middle"
                  className={`font-mono-num text-[11px] ${
                    isHovered
                      ? "fill-[var(--text-primary)] font-semibold"
                      : "fill-[var(--text-muted)]"
                  }`}
                >
                  {d.fiscalYear}
                </text>
              </g>
            );
          })}

          {/* Diluted Shares Line Overlay */}
          <path
            d={sharePath}
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth={1.6}
            strokeOpacity={0.65}
            pointerEvents="none"
          />

          {series.map((d, idx) => {
            const cx = padL + idx * groupW + groupW / 2;
            const cy = yShare(d.dilutedShares);
            const isHovered = idx === hoveredIdx;
            return (
              <circle
                key={`pt-${d.fiscalYear}`}
                cx={cx}
                cy={cy}
                r={isHovered ? 4.5 : 3}
                fill={isHovered ? "var(--amber)" : "var(--surface)"}
                stroke="var(--text-primary)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            );
          })}

          {/* Right axis label for share count */}
          <text
            x={W - 6}
            y={padT + 4}
            textAnchor="end"
            className="font-mono-num fill-[var(--text-muted)] text-[10px]"
          >
            {Math.round(maxShares).toLocaleString()}M sh
          </text>
          <text
            x={W - 6}
            y={padT + plotH}
            textAnchor="end"
            className="font-mono-num fill-[var(--text-muted)] text-[10px]"
          >
            {Math.round(minShares).toLocaleString()}M sh
          </text>
        </svg>
      </div>
    </section>
  );
}
