"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { SearchIndexEntry } from "@/data/search-index";
import type { SectorBenchmark } from "@/data/repository";
import { ChartShareBar } from "@/components/ChartShareBar";
import { deliverCanvasCard, type CardDeliveryMode, type CardDeliveryResult } from "@/lib/export-card";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";
import { SITE_HOST } from "@/lib/site";

interface SectorQuadrantChartProps {
  sector: string;
  sectorSlug: string;
  entries: SearchIndexEntry[];
  benchmark: SectorBenchmark | null;
}

export function SectorQuadrantChart({
  sector,
  sectorSlug,
  entries,
  benchmark,
}: SectorQuadrantChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // Plot top 28 companies by market cap that have valid True FCF % and Implied 10Y Growth
  const points = useMemo(() => {
    return entries
      .filter(
        (e) =>
          !e.scenarioBasis.equityLensOnly &&
          e.impliedCagr !== null &&
          Number.isFinite(e.impliedCagr) &&
          Number.isFinite(e.trueFcfMargin) &&
          e.impliedCagr >= -15 &&
          e.impliedCagr <= 45 &&
          e.trueFcfMargin >= -25 &&
          e.trueFcfMargin <= 65
      )
      .sort((a, b) => b.marketCap - a.marketCap)
      .slice(0, 28);
  }, [entries]);

  if (points.length < 4) return null;

  const W = 820;
  const H = 400;
  const pad = { top: 28, right: 36, bottom: 44, left: 56 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const xs = points.map((p) => p.impliedCagr!);
  const ys = points.map((p) => p.trueFcfMargin);
  const minX = Math.floor(Math.min(...xs, 0) / 5) * 5 - 3;
  const maxX = Math.ceil(Math.max(...xs, 20) / 5) * 5 + 3;
  const minY = Math.floor(Math.min(...ys, 0) / 5) * 5 - 6;
  const maxY = Math.ceil(Math.max(...ys, 25) / 5) * 5 + 8;

  const spanX = Math.max(10, maxX - minX);
  const spanY = Math.max(10, maxY - minY);

  const xFor = (v: number) => pad.left + ((v - minX) / spanX) * plotW;
  const yFor = (v: number) => pad.top + plotH - ((v - minY) / spanY) * plotH;

  const sortedXs = [...xs].sort((a, b) => a - b);
  const medX = sortedXs[Math.floor(sortedXs.length / 2)] ?? 10;
  const medY = benchmark?.medianTrueFcfMargin ?? 15;
  const crossX = Math.max(pad.left, Math.min(pad.left + plotW, xFor(medX)));
  const crossY = Math.max(pad.top, Math.min(pad.top + plotH, yFor(medY)));

  const maxCap = Math.max(1, ...points.map((p) => p.marketCap));
  const hoveredItem = hovered ? points.find((p) => p.ticker === hovered) ?? null : null;

  function exportQuadrantPng(mode: CardDeliveryMode): Promise<CardDeliveryResult> {
    const svg = svgRef.current;
    if (!svg) return Promise.resolve("failed");
    const isDark =
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const bg = isDark ? "#0B0C0E" : "#FAFAF9";
    const textPrimary = isDark ? "#F2F2F3" : "#151517";
    const textMuted = isDark ? "#9CA0AB" : "#52525B";
    const amber = isDark ? "#E5A03C" : "#B45309";

    const clone = svg.cloneNode(true) as SVGSVGElement;
    const styles = getComputedStyle(document.documentElement);
    const rawSvg = new XMLSerializer()
      .serializeToString(clone)
      .replace(/var\((--[a-z-]+)\)/g, (_, v) => styles.getPropertyValue(v).trim() || amber);

    return new Promise((resolve) => {
      const img = new Image();
      const blob = new Blob([rawSvg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve("failed");
      };
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1600;
        canvas.height = 900;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve("failed");
          return;
        }
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = amber;
        ctx.font = '600 20px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillText(`SECTOR MAP  /  ${sector.toUpperCase()}`, 64, 68);

        ctx.fillStyle = textPrimary;
        ctx.font = '600 36px "Inter", system-ui, sans-serif';
        ctx.fillText(`${sector}: True FCF Margin vs. Priced-In 10Y Growth`, 64, 114);

        ctx.drawImage(img, 40, 140, 1520, 680);

        ctx.fillStyle = textMuted;
        ctx.font = '500 18px "Inter", system-ui, sans-serif';
        ctx.fillText("Source: SEC EDGAR XBRL  ·  Top-left = high True FCF, lower expectations", 64, 858);
        ctx.textAlign = "right";
        ctx.fillStyle = amber;
        ctx.font = '700 19px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillText(`${SITE_HOST}/sectors/${sectorSlug}`, 1536, 858);

        const res = await deliverCanvasCard(
          canvas,
          `amber-sector-${sectorSlug}-quadrant.png`,
          mode
        );
        URL.revokeObjectURL(url);
        resolve(res);
      };
      img.src = url;
    });
  }

  return (
    <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {sector} 2×2 Map: True FCF Margin vs. Priced-In Growth
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Top-left quadrant = high economic cash margins with lower priced-in expectations. Bubble size reflects market cap.
          </p>
        </div>

        <ChartShareBar
          onDeliverCard={(mode) => exportQuadrantPng(mode)}
          pagePath={`/sectors/${sectorSlug}`}
          embedTitle={`${sector} True FCF vs. Priced-In Growth on Amber`}
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[600px]"
          role="img"
          aria-label={`${sector} scatter plot of True FCF Margin versus Priced-In 10-Year Revenue Growth`}
        >
          {/* Plot frame */}
          <rect
            x={pad.left}
            y={pad.top}
            width={plotW}
            height={plotH}
            rx={8}
            fill="var(--bg)"
            stroke="var(--border)"
          />

          {/* Median crosshairs */}
          <line
            x1={crossX}
            y1={pad.top}
            x2={crossX}
            y2={pad.top + plotH}
            stroke="var(--border-strong)"
            strokeDasharray="4 4"
          />
          <line
            x1={pad.left}
            y1={crossY}
            x2={pad.left + plotW}
            y2={crossY}
            stroke="var(--border-strong)"
            strokeDasharray="4 4"
          />

          {/* Quadrant labels */}
          <text x={pad.left + 12} y={pad.top + 18} fontSize="10" fontWeight="600" fill="var(--positive)">
            HIGH TRUE FCF · LOWER EXPECTATIONS
          </text>
          <text x={pad.left + plotW - 12} y={pad.top + 18} textAnchor="end" fontSize="10" fontWeight="600" fill="var(--amber)">
            HIGH TRUE FCF · HIGH GROWTH PRICED IN
          </text>
          <text x={pad.left + plotW - 12} y={pad.top + plotH - 10} textAnchor="end" fontSize="10" fontWeight="600" fill="var(--negative)">
            LOWER FCF · HIGH EXPECTATIONS
          </text>

          {/* Axis labels */}
          <text
            x={pad.left + plotW / 2}
            y={H - 10}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-secondary)"
          >
            Reverse DCF Priced-In 10Y Revenue Growth (%) →
          </text>
          <text
            x={16}
            y={pad.top + plotH / 2}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-secondary)"
            transform={`rotate(-90 16 ${pad.top + plotH / 2})`}
          >
            True FCF Margin (%) →
          </text>

          {/* Points */}
          {points.map((p, idx) => {
            const cx = xFor(p.impliedCagr!);
            const cy = yFor(p.trueFcfMargin);
            const r = 5 + Math.sqrt(p.marketCap / maxCap) * 11;
            const isTopLeft = p.trueFcfMargin >= medY && p.impliedCagr! <= medX;
            const isHovered = hovered === p.ticker;
            const fill = isTopLeft
              ? "var(--positive)"
              : p.trueFcfMargin >= medY
                ? "var(--amber)"
                : "var(--sbc)";
            const showLabel = idx < 12 || isHovered;
            return (
              <g
                key={p.ticker}
                onMouseEnter={() => setHovered(p.ticker)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? r + 2 : r}
                  fill={fill}
                  fillOpacity={isHovered ? 0.95 : 0.72}
                  stroke="var(--surface)"
                  strokeWidth={isHovered ? 2 : 1.2}
                />
                {showLabel && (
                  <text
                    x={cx}
                    y={cy - r - 4}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="var(--text-primary)"
                    className="font-mono-num"
                  >
                    {p.ticker}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {hoveredItem && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3.5 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-mono-num font-bold text-[var(--amber)]">{hoveredItem.ticker}</span>
            <span className="font-medium text-[var(--text-primary)]">{hoveredItem.name}</span>
            <span className="font-mono-num text-[var(--text-secondary)]">
              Mkt Cap {formatCurrencyCompact(hoveredItem.marketCap)}
            </span>
            <span className="font-mono-num text-[var(--text-secondary)]">
              True FCF {formatPct(hoveredItem.trueFcfMargin)}
            </span>
            <span className="font-mono-num text-[var(--text-secondary)]">
              Priced-In {formatPct(hoveredItem.impliedCagr)}/yr
            </span>
          </div>
          <Link
            href={`/t/${hoveredItem.ticker}`}
            className="inline-flex items-center gap-1 font-semibold text-[var(--amber)] hover:underline"
          >
            Open workspace
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}
