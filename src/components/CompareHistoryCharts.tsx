"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompareCompanyHistory } from "@/lib/compare-history";

type MetricKey = "trueFcfMargin" | "indexedShares" | "indexedRevenue" | "sbcPctRevenue";

const METRIC_TABS: Array<{
  key: MetricKey;
  label: string;
  subtitle: string;
  unit: "%" | "idx";
}> = [
  {
    key: "trueFcfMargin",
    label: "True FCF Margin",
    subtitle: "5-year SBC-adjusted Free Cash Flow margin (%)",
    unit: "%",
  },
  {
    key: "indexedShares",
    label: "Share Count (Indexed)",
    subtitle: "Diluted shares indexed to 100 at start of period (below 100 = buyback shrinkage)",
    unit: "idx",
  },
  {
    key: "indexedRevenue",
    label: "Revenue Growth (Indexed)",
    subtitle: "Annual revenue indexed to 100 at start of period",
    unit: "idx",
  },
  {
    key: "sbcPctRevenue",
    label: "SBC / Revenue",
    subtitle: "Employee stock-based compensation as % of revenue",
    unit: "%",
  },
];

const SERIES_COLORS = [
  "#d97706", // amber
  "#10b981", // emerald
  "#0ea5e9", // sky
  "#8b5cf6", // violet
];

interface CompareHistoryChartsProps {
  tickers: string[];
  initialHistory?: CompareCompanyHistory[];
}

export function CompareHistoryCharts({
  tickers,
  initialHistory = [],
}: CompareHistoryChartsProps) {
  const [metric, setMetric] = useState<MetricKey>("trueFcfMargin");
  const [historyState, setHistoryState] = useState<{
    key: string;
    series: CompareCompanyHistory[];
  }>(() => ({
    key: initialHistory.map((h) => h.ticker).join(","),
    series: initialHistory,
  }));

  const tickerKey = tickers.join(",");

  useEffect(() => {
    if (!tickerKey) return;
    if (historyState.key === tickerKey && historyState.series.length > 0) return;

    const controller = new AbortController();
    fetch(`/api/compare-history?tickers=${encodeURIComponent(tickerKey)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { series?: CompareCompanyHistory[] } | null) => {
        if (!controller.signal.aborted && Array.isArray(data?.series)) {
          setHistoryState({ key: tickerKey, series: data.series });
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [tickerKey, historyState.key, historyState.series.length]);

  const series = useMemo(() => {
    const byTicker = new Map(historyState.series.map((s) => [s.ticker, s]));
    return tickers
      .map((t) => byTicker.get(t))
      .filter((s): s is CompareCompanyHistory => Boolean(s && s.points.length >= 2));
  }, [historyState.series, tickers]);

  const activeTab = METRIC_TABS.find((t) => t.key === metric) ?? METRIC_TABS[0];

  const chartData = useMemo(() => {
    const allYears = [...new Set(series.flatMap((s) => s.points.map((p) => p.fiscalYear)))].sort();
    const lines = series.map((company, idx) => {
      const firstRev = company.points[0]?.revenue || 1;
      const firstShares = company.points[0]?.dilutedShares || 1;
      const byYear = new Map(company.points.map((p) => [p.fiscalYear, p]));

      const coords = allYears
        .map((fy, xIdx) => {
          const p = byYear.get(fy);
          if (!p) return null;
          let value = 0;
          if (metric === "trueFcfMargin") value = p.trueFcfMargin;
          else if (metric === "sbcPctRevenue") value = p.sbcPctRevenue;
          else if (metric === "indexedShares") value = (p.dilutedShares / firstShares) * 100;
          else value = (p.revenue / firstRev) * 100;
          return { xIdx, fy, value: Number(value.toFixed(1)) };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      return {
        ticker: company.ticker,
        color: SERIES_COLORS[idx % SERIES_COLORS.length],
        coords,
        latestVal: coords[coords.length - 1]?.value ?? null,
      };
    });

    const allVals = lines.flatMap((l) => l.coords.map((c) => c.value));
    const rawMin = allVals.length ? Math.min(...allVals) : 0;
    const rawMax = allVals.length ? Math.max(...allVals) : 100;
    const pad = Math.max(4, (rawMax - rawMin) * 0.14);
    const minY = Math.floor(rawMin - pad);
    const maxY = Math.ceil(rawMax + pad);

    return { allYears, lines, minY, maxY };
  }, [series, metric]);

  if (tickers.length === 0) return null;

  const width = 680;
  const height = 240;
  const padL = 48;
  const padR = 24;
  const padT = 18;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xScale = (xIdx: number) =>
    chartData.allYears.length <= 1
      ? padL + plotW / 2
      : padL + (xIdx / (chartData.allYears.length - 1)) * plotW;

  const yRange = Math.max(1, chartData.maxY - chartData.minY);
  const yScale = (val: number) => padT + plotH - ((val - chartData.minY) / yRange) * plotH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) =>
    Math.round(chartData.minY + yRange * t)
  );

  const fmtVal = (v: number) =>
    activeTab.unit === "%" ? `${v.toFixed(1)}%` : v.toFixed(0);

  return (
    <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            5-Year Historical Trajectory
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {activeTab.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap gap-1">
          {METRIC_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMetric(tab.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                metric === tab.key
                  ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                  : "border border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {series.length === 0 ? (
        <div className="mt-6 flex h-44 items-center justify-center text-xs text-[var(--text-muted)]">
          Loading 5-year historical filings…
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
            {chartData.lines.map((line) => (
              <div key={line.ticker} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: line.color }}
                />
                <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                  {line.ticker}
                </span>
                {line.latestVal !== null && (
                  <span className="font-mono-num text-[var(--text-muted)]">
                    ({fmtVal(line.latestVal)})
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 overflow-x-auto">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`5-year ${activeTab.label} comparison chart`}
              className="h-auto w-full min-w-[460px]"
            >
              {/* Horizontal gridlines */}
              {yTicks.map((tick) => {
                const y = yScale(tick);
                return (
                  <g key={tick}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={width - padR}
                      y2={y}
                      stroke="var(--border)"
                      strokeDasharray={tick === 0 || tick === 100 ? "none" : "3 3"}
                      strokeOpacity={tick === 0 || tick === 100 ? 0.9 : 0.6}
                    />
                    <text
                      x={padL - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-[var(--text-muted)] font-mono-num text-[10px]"
                    >
                      {activeTab.unit === "%" ? `${tick}%` : tick}
                    </text>
                  </g>
                );
              })}

              {/* X-axis fiscal year labels */}
              {chartData.allYears.map((fy, idx) => (
                <text
                  key={fy}
                  x={xScale(idx)}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-[var(--text-muted)] font-mono-num text-[10px]"
                >
                  {fy}
                </text>
              ))}

              {/* Company polylines & dots */}
              {chartData.lines.map((line) => {
                const pathD = line.coords
                  .map((c, i) => `${i === 0 ? "M" : "L"} ${xScale(c.xIdx)} ${yScale(c.value)}`)
                  .join(" ");
                return (
                  <g key={line.ticker}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={line.color}
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {line.coords.map((c) => (
                      <circle
                        key={`${line.ticker}-${c.fy}`}
                        cx={xScale(c.xIdx)}
                        cy={yScale(c.value)}
                        r="3.25"
                        fill={line.color}
                      >
                        <title>{`${line.ticker} ${c.fy}: ${fmtVal(c.value)}`}</title>
                      </circle>
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>
        </>
      )}
    </section>
  );
}
