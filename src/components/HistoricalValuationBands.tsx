"use client";

import { useMemo } from "react";
import { computeEnterpriseValue, type CompanySnapshot, type ComputedAnnual } from "@/lib/finance";

interface HistoricalValuationBandsProps {
  company: CompanySnapshot;
  series: ComputedAnnual[];
}

interface BandPoint {
  label: string;
  multiple: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function HistoricalValuationBands({
  company,
  series,
}: HistoricalValuationBandsProps) {
  const result = useMemo(() => {
    const history = company.priceHistory ?? [];
    if (history.length < 3 || series.length < 3) return null;

    const priceByFy = new Map<string, number>();
    for (const pt of history) {
      if (pt.price > 0) {
        priceByFy.set(pt.fiscalYear.toUpperCase(), pt.price);
      }
    }

    const fallbackNetDebt = company.totalDebt - company.cashAndEquiv;
    const positiveFcfCount = series.filter((s) => s.trueFcf > 0).length;
    const useFcf = positiveFcfCount >= Math.max(3, Math.ceil(series.length * 0.6));
    const metricLabel = useFcf ? "EV / True FCF" : "EV / Revenue";

    const points: BandPoint[] = [];

    for (const row of series) {
      const fyKey = row.fiscalYear.toUpperCase();
      if (fyKey === "TTM") continue;
      const price = priceByFy.get(fyKey);
      if (!price || price <= 0) continue;

      const rowNetDebt =
        typeof row.totalDebt === "number" && typeof row.cashAndEquiv === "number"
          ? row.totalDebt - row.cashAndEquiv
          : fallbackNetDebt;
      const ev = Math.max(1, price * row.dilutedShares + rowNetDebt);
      const denom = useFcf ? row.trueFcf : row.revenue;
      if (denom <= 0) continue;

      const mult = ev / denom;
      if (!Number.isFinite(mult) || mult <= 0 || mult > 150) continue;
      points.push({ label: row.fiscalYear, multiple: Number(mult.toFixed(1)) });
    }

    if (points.length < 3) return null;

    const current = series[series.length - 1];
    const currentDenominator = useFcf ? current.trueFcf : current.revenue;
    const currentMultiple = computeEnterpriseValue(company) / currentDenominator;
    if (currentDenominator <= 0 || !Number.isFinite(currentMultiple) || currentMultiple <= 0 || currentMultiple > 150) return null;

    const med = Number(median(points.map((p) => p.multiple)).toFixed(1));
    const latest = { label: "Now", multiple: Number(currentMultiple.toFixed(1)) };
    const diffPct = med > 0 ? ((latest.multiple - med) / med) * 100 : 0;

    return { points: [...points, latest], historicalCount: points.length, med, latest, diffPct, metricLabel };
  }, [company, series]);

  if (!result) return null;

  const { points, historicalCount, med, latest, diffPct, metricLabel } = result;
  const width = 760;
  const height = 220;
  const pad = { top: 24, right: 56, bottom: 32, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const allVals = [...points.map((p) => p.multiple), med * 1.25, med * 0.75];
  const minVal = Math.max(0, Math.floor(Math.min(...allVals) * 0.85));
  const maxVal = Math.ceil(Math.max(...allVals) * 1.12);
  const span = Math.max(1, maxVal - minVal);

  const xFor = (i: number) =>
    pad.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yFor = (v: number) =>
    pad.top + plotH - ((v - minVal) / span) * plotH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.multiple).toFixed(1)}`)
    .join(" ");

  const medY = yFor(med);
  const bandTopY = yFor(Math.min(maxVal, med * 1.2));
  const bandBotY = yFor(Math.max(minVal, med * 0.8));

  const badge =
    diffPct <= -15
      ? {
          text: `${Math.abs(Math.round(diffPct))}% Below Median`,
          cls: "bg-[var(--surface-subtle)] text-[var(--positive)] ring-1 ring-inset ring-[var(--border-strong)]",
        }
      : diffPct >= 15
        ? {
            text: `${Math.round(diffPct)}% Above Median`,
            cls: "bg-[var(--amber-soft)] text-[var(--sbc)] ring-1 ring-inset ring-[var(--amber-border)]",
          }
        : {
            text: "Near Historical Median",
            cls: "bg-[var(--surface-subtle)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]",
          };

  return (
    <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            Historical Valuation Bands ({metricLabel})
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Current multiple ({latest.multiple.toFixed(1)}x) vs. {historicalCount}-period median ({med.toFixed(1)}x) with a ±20% fair band.
          </p>
        </div>
        <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${badge.cls}`}>
          {badge.text}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[460px]"
          role="img"
          aria-label={`${company.ticker} historical ${metricLabel} valuation bands`}
        >
          {/* Shaded ±20% median fair band */}
          <rect
            x={pad.left}
            y={bandTopY}
            width={plotW}
            height={Math.max(2, bandBotY - bandTopY)}
            fill="var(--amber)"
            fillOpacity="0.09"
          />

          {/* Horizontal grid lines */}
          {[0, 0.5, 1].map((t) => {
            const v = minVal + span * t;
            const y = yFor(v);
            return (
              <g key={t}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={pad.left + plotW}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth="1"
                />
                <text
                  x={pad.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--text-muted)"
                  className="font-mono-num"
                >
                  {v.toFixed(0)}x
                </text>
              </g>
            );
          })}

          {/* Median dashed line */}
          <line
            x1={pad.left}
            y1={medY}
            x2={pad.left + plotW}
            y2={medY}
            stroke="var(--amber)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <text
            x={pad.left + plotW + 6}
            y={medY + 3.5}
            fontSize="10"
            fontWeight="600"
            fill="var(--amber)"
            className="font-mono-num"
          >
            Med {med.toFixed(1)}x
          </text>

          {/* Historical multiple line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Data points & X labels */}
          {points.map((p, i) => {
            const cx = xFor(i);
            const cy = yFor(p.multiple);
            const isLast = i === points.length - 1;
            return (
              <g key={p.label}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isLast ? 5 : 3.5}
                  fill={isLast ? "var(--amber)" : "var(--surface)"}
                  stroke={isLast ? "var(--surface)" : "var(--text-primary)"}
                  strokeWidth="2"
                />
                <text
                  x={cx}
                  y={cy - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isLast ? "700" : "500"}
                  fill={isLast ? "var(--amber)" : "var(--text-secondary)"}
                  className="font-mono-num"
                >
                  {p.multiple.toFixed(1)}x
                </text>
                <text
                  x={cx}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--text-muted)"
                  className="font-mono-num"
                >
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
