"use client";

import { Download } from "lucide-react";
import type { ArenaPortfolioView, EquityCurvePoint } from "@/data/arena-repository";
import { formatPct } from "@/lib/finance";

interface ArenaScorecardActionsProps {
  portfolio: ArenaPortfolioView;
  spyReturnPct?: number;
}

export function ArenaScorecardExport({
  portfolio,
  spyReturnPct,
}: ArenaScorecardActionsProps) {
  function handleExport() {
    const width = 1200;
    const height = 630;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isDark =
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const bg = isDark ? "#0b0c0e" : "#fafaf9";
    const surface = isDark ? "#111317" : "#ffffff";
    const border = isDark ? "#23262e" : "#e6e4e0";
    const textPrimary = isDark ? "#f2f2f3" : "#151517";
    const textSecondary = isDark ? "#9ca0ab" : "#52525b";
    const amber = isDark ? "#e5a03c" : "#b45309";
    const pos = isDark ? "#4ade80" : "#15803d";
    const neg = isDark ? "#f87171" : "#b91c1c";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Outer card
    ctx.fillStyle = surface;
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(36, 36, width - 72, height - 72, 16);
    ctx.fill();
    ctx.stroke();

    // Header eyebrow
    ctx.fillStyle = amber;
    ctx.font = '700 14px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(
      `AMBER PORTFOLIO ARENA / ${portfolio.handle.toUpperCase()}`,
      72,
      86
    );

    // Title
    ctx.fillStyle = textPrimary;
    ctx.font = '700 36px "Inter", system-ui, -apple-system, sans-serif';
    ctx.fillText(portfolio.title, 72, 134);

    // Return big KPI
    const retColor =
      portfolio.totalReturnPct > 0
        ? pos
        : portfolio.totalReturnPct < 0
          ? neg
          : textPrimary;
    ctx.fillStyle = retColor;
    ctx.font = '700 64px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "right";
    ctx.fillText(formatPct(portfolio.totalReturnPct, true), width - 72, 136);

    if (typeof spyReturnPct === "number") {
      const alpha = portfolio.totalReturnPct - spyReturnPct;
      ctx.fillStyle = alpha >= 0 ? pos : textSecondary;
      ctx.font = '600 16px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(
        `${formatPct(alpha, true)} vs S&P 500 (${formatPct(spyReturnPct, true)})`,
        width - 72,
        166
      );
    }
    ctx.textAlign = "left";

    // Thesis
    ctx.fillStyle = textSecondary;
    ctx.font = '400 17px "Inter", system-ui, sans-serif';
    ctx.fillText(portfolio.thesis.slice(0, 92), 72, 174);

    // Holdings grid
    ctx.fillStyle = textSecondary;
    ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText("HOLDINGS & PERFORMANCE", 72, 224);

    const rows = portfolio.positions.slice(0, 6);
    rows.forEach((p, idx) => {
      const y = 242 + idx * 50;
      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(72, y, width - 144, 40, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = amber;
      ctx.font = '700 15px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(p.ticker, 92, y + 25);

      ctx.fillStyle = textPrimary;
      ctx.font = '500 14px "Inter", system-ui, sans-serif';
      ctx.fillText(p.companyName.slice(0, 34), 190, y + 25);

      ctx.fillStyle = textSecondary;
      ctx.font = '500 14px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(`${p.weightPct.toFixed(1)}% weight`, 680, y + 25);

      ctx.textAlign = "right";
      ctx.fillStyle = p.returnPct > 0 ? pos : p.returnPct < 0 ? neg : textSecondary;
      ctx.font = '700 15px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(formatPct(p.returnPct, true), width - 92, y + 25);
      ctx.textAlign = "left";
    });

    // Footer
    ctx.fillStyle = textSecondary;
    ctx.font = '500 13px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(
      `Started ${portfolio.lockedAt.slice(0, 10)} | amber-theta-three.vercel.app`,
      72,
      height - 60
    );

    const link = document.createElement("a");
    link.download = `amber-arena-${portfolio.handle.toLowerCase()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      Export PNG
    </button>
  );
}

export function ArenaBenchmarkCard({
  portfolioReturnPct,
  spyReturnPct,
  periodLabel,
  curvePoints = [],
}: {
  portfolioReturnPct: number;
  spyReturnPct: number;
  periodLabel: string;
  curvePoints?: EquityCurvePoint[];
}) {
  const alpha = portfolioReturnPct - spyReturnPct;
  const maxAbs = Math.max(5, Math.abs(portfolioReturnPct), Math.abs(spyReturnPct));
  const portWidth = Math.min(100, Math.max(4, (Math.abs(portfolioReturnPct) / maxAbs) * 100));
  const spyWidth = Math.min(100, Math.max(4, (Math.abs(spyReturnPct) / maxAbs) * 100));

  const hasCurve = curvePoints.length >= 2;
  const curveEnd = curvePoints.at(-1);
  const W = 740;
  const H = 180;
  const pad = { top: 18, right: 54, bottom: 26, left: 46 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  let portPath = "";
  let spyPath = "";
  let zeroY = pad.top + plotH / 2;
  let minVal = 0;
  let maxVal = 0;

  if (hasCurve) {
    const vals = curvePoints.flatMap((p) => [p.portfolioPct, p.spyPct, 0]);
    minVal = Math.min(...vals);
    maxVal = Math.max(...vals);
    const span = Math.max(2, maxVal - minVal);
    minVal -= span * 0.1;
    maxVal += span * 0.1;
    const adjSpan = maxVal - minVal;

    const xFor = (i: number) =>
      pad.left + (i / (curvePoints.length - 1)) * plotW;
    const yFor = (v: number) =>
      pad.top + plotH - ((v - minVal) / adjSpan) * plotH;

    zeroY = yFor(0);
    portPath = curvePoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.portfolioPct).toFixed(1)}`)
      .join(" ");
    spyPath = curvePoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.spyPct).toFixed(1)}`)
      .join(" ");
  }

  return (
    <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Performance vs. S&amp;P 500 ({periodLabel})
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {alpha >= 0
              ? `Outperforming the S&P 500 by ${formatPct(alpha, true)} over this period.`
              : `Trailing the S&P 500 by ${formatPct(Math.abs(alpha))} over this period.`}
          </p>
        </div>
        {alpha > 0 && (
          <span className="inline-flex rounded-md bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--positive)] ring-1 ring-inset ring-[var(--border-strong)]">
            Beat S&amp;P 500 ({formatPct(alpha, true)})
          </span>
        )}
      </div>

      {hasCurve ? (
        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[440px]"
            role="img"
            aria-label="Portfolio cumulative return curve vs S&P 500"
          >
            <line
              x1={pad.left}
              y1={zeroY}
              x2={pad.left + plotW}
              y2={zeroY}
              stroke="var(--border-strong)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text
              x={pad.left - 8}
              y={zeroY + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-muted)"
              className="font-mono-num"
            >
              0%
            </text>
            <text
              x={pad.left - 8}
              y={pad.top + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-muted)"
              className="font-mono-num"
            >
              {formatPct(maxVal, true, 0)}
            </text>
            <text
              x={pad.left - 8}
              y={pad.top + plotH}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-muted)"
              className="font-mono-num"
            >
              {formatPct(minVal, true, 0)}
            </text>

            {/* S&P 500 dashed benchmark line */}
            <path
              d={spyPath}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.6"
              strokeDasharray="4 4"
              opacity="0.75"
            />

            {/* Portfolio cumulative return line */}
            <path
              d={portPath}
              fill="none"
              stroke="var(--amber)"
              strokeWidth="2.4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Start and end date labels */}
            <text
              x={pad.left}
              y={H - 6}
              fontSize="10"
              fill="var(--text-muted)"
              className="font-mono-num"
            >
              {curvePoints[0].date}
            </text>
            <text
              x={pad.left + plotW}
              y={H - 6}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-muted)"
              className="font-mono-num"
            >
              {curvePoints[curvePoints.length - 1].date}
            </text>
          </svg>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 bg-[var(--amber)]" />
              Portfolio ({formatPct(curveEnd?.portfolioPct ?? portfolioReturnPct, true)})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 border-t border-dashed border-[var(--text-muted)]" />
              S&amp;P 500 ({formatPct(curveEnd?.spyPct ?? spyReturnPct, true)})
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--text-primary)]">This Portfolio</span>
              <span
                className={`font-mono-num font-semibold ${
                  portfolioReturnPct >= 0 ? "text-[var(--positive)]" : "text-[var(--negative)]"
                }`}
              >
                {formatPct(portfolioReturnPct, true)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${portWidth}%`,
                  backgroundColor:
                    portfolioReturnPct >= 0 ? "var(--amber)" : "var(--negative)",
                }}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">S&amp;P 500 (SPY)</span>
              <span className="font-mono-num font-medium text-[var(--text-secondary)]">
                {formatPct(spyReturnPct, true)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
              <div
                className="h-full rounded-full bg-[var(--text-muted)] opacity-55 transition-all"
                style={{ width: `${spyWidth}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
