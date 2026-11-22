"use client";

import { useRef } from "react";
import { Download } from "lucide-react";
import {
  type ComputedAnnual,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";

interface RevenueSankeyProps {
  ticker: string;
  companyName: string;
  period: ComputedAnnual;
}

function ribbonPath(
  x0: number,
  y0Top: number,
  y0Bot: number,
  x1: number,
  y1Top: number,
  y1Bot: number
): string {
  const mx = (x0 + x1) / 2;
  return [
    `M ${x0} ${y0Top}`,
    `C ${mx} ${y0Top}, ${mx} ${y1Top}, ${x1} ${y1Top}`,
    `L ${x1} ${y1Bot}`,
    `C ${mx} ${y1Bot}, ${mx} ${y0Bot}, ${x0} ${y0Bot}`,
    "Z",
  ].join(" ");
}

export function RevenueSankey({
  ticker,
  companyName,
  period,
}: RevenueSankeyProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const rev = Math.max(1, period.revenue);
  const hasIncomeBreakdown =
    typeof period.grossProfit === "number" &&
    period.grossProfit > 0 &&
    period.grossProfit <= rev * 1.05 &&
    typeof period.operatingIncome === "number";

  const grossProfit = hasIncomeBreakdown
    ? Math.min(rev, Math.max(0, period.grossProfit!))
    : Math.max(0, period.operatingCashFlow);
  const costOfRev = Math.max(0, rev - grossProfit);

  const opInc = hasIncomeBreakdown
    ? Math.max(0, period.operatingIncome!)
    : Math.max(0, period.reportedFcf);
  const rd = hasIncomeBreakdown ? Math.max(0, period.rdExpense ?? 0) : 0;
  const sga = hasIncomeBreakdown ? Math.max(0, period.sgaExpense ?? 0) : 0;
  const otherOpex = hasIncomeBreakdown
    ? Math.max(0, grossProfit - opInc - rd - sga)
    : Math.max(0, grossProfit - opInc);

  const trueFcf = Math.max(0, period.trueFcf);
  const sbc = Math.max(0, period.sbc);
  const netInc = hasIncomeBreakdown
    ? Math.max(0, period.netIncome ?? opInc * 0.8)
    : trueFcf;
  const taxAndOther = hasIncomeBreakdown
    ? Math.max(0, opInc - netInc)
    : Math.max(0, opInc - trueFcf);

  // SVG layout coordinates
  const W = 760;
  const H = 290;
  const barW = 14;
  const topPad = 36;
  const usableH = 216;
  const scale = usableH / rev;

  // Column X positions
  const x0 = 115; // Revenue
  const x1 = 315; // Gross Profit / Cost of Rev (or OCF / Operating Costs)
  const x2 = 525; // Operating Income / OpEx (or Reported FCF / CapEx)
  const x3 = 690; // Net Income / Taxes (or True FCF / SBC)

  const revH = rev * scale;
  const revY0 = topPad;

  const gpH = Math.max(6, grossProfit * scale);
  const corH = Math.max(4, costOfRev * scale);
  const gap1 = 16;
  const gpY0 = topPad;
  const corY0 = gpY0 + gpH + gap1;

  // Split Gross Profit into OpInc, R&D, SG&A, Other
  const col2Items = hasIncomeBreakdown
    ? [
        { label: "Operating Profit", val: opInc, color: "var(--amber)" },
        ...(rd > 0 ? [{ label: "R&D", val: rd, color: "var(--reported)" }] : []),
        ...(sga > 0 ? [{ label: "SG&A", val: sga, color: "var(--border-strong)" }] : []),
        ...(otherOpex > rev * 0.015
          ? [{ label: "Other OpEx", val: otherOpex, color: "var(--border-strong)" }]
          : []),
      ]
    : [
        { label: "Reported FCF", val: Math.max(0, period.reportedFcf), color: "var(--amber)" },
        { label: "CapEx", val: Math.max(0, period.capex), color: "var(--border-strong)" },
      ];

  const col2Total = Math.max(1, col2Items.reduce((s, i) => s + i.val, 0));
  const col2Scale = gpH / col2Total;
  const gap2 = 10;

  let curY2 = gpY0;
  let srcY2 = gpY0;
  const col2Nodes = col2Items.map((item) => {
    const h = Math.max(4, item.val * col2Scale);
    const node = {
      ...item,
      y0: curY2,
      y1: curY2 + h,
      srcY0: srcY2,
      srcY1: srcY2 + h,
    };
    curY2 += h + gap2;
    srcY2 += h;
    return node;
  });

  // Column 3: Split Operating Profit (or Reported FCF) into final bottom line
  const opNode = col2Nodes[0];
  const col3Items = hasIncomeBreakdown
    ? [
        { label: "Net Income", val: netInc, color: "var(--positive)" },
        ...(taxAndOther > rev * 0.005
          ? [{ label: "Tax & Other", val: taxAndOther, color: "var(--border-strong)" }]
          : []),
      ]
    : [
        { label: "True FCF", val: trueFcf, color: "var(--positive)" },
        ...(sbc > 0 ? [{ label: "Stock Comp", val: sbc, color: "var(--sbc)" }] : []),
      ];

  const col3Total = Math.max(1, col3Items.reduce((s, i) => s + i.val, 0));
  const opNodeH = Math.max(6, opNode.y1 - opNode.y0);
  const col3Scale = opNodeH / col3Total;
  const gap3 = 10;

  let curY3 = opNode.y0;
  let srcY3 = opNode.y0;
  const col3Nodes = col3Items.map((item) => {
    const h = Math.max(4, item.val * col3Scale);
    const node = {
      ...item,
      y0: curY3,
      y1: curY3 + h,
      srcY0: srcY3,
      srcY1: srcY3 + h,
    };
    curY3 += h + gap3;
    srcY3 += h;
    return node;
  });

  function exportSvgAsPng() {
    const svg = svgRef.current;
    if (!svg) return;
    const isDark =
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const bg = isDark ? "#111317" : "#FFFFFF";
    const textPrimary = isDark ? "#F2F2F3" : "#151517";
    const textMuted = isDark ? "#9CA0AB" : "#52525B";
    const amber = isDark ? "#E5A03C" : "#B45309";

    const clone = svg.cloneNode(true) as SVGSVGElement;
    // Inline computed CSS variables for crisp standalone Canvas render
    const styles = getComputedStyle(document.documentElement);
    const rawSvg = new XMLSerializer()
      .serializeToString(clone)
      .replace(/var\((--[a-z-]+)\)/g, (_, v) => styles.getPropertyValue(v).trim() || amber);

    const img = new Image();
    const blob = new Blob([rawSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 820;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = amber;
      ctx.font = '600 22px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(`${ticker} · ${period.fiscalYear} BUSINESS ANATOMY`, 64, 72);

      ctx.fillStyle = textPrimary;
      ctx.font = '600 36px "Inter", system-ui, sans-serif';
      ctx.fillText(`${companyName} — Where Every $1 of Revenue Goes`, 64, 118);

      ctx.drawImage(img, 40, 150, 1520, 580);

      ctx.fillStyle = textMuted;
      ctx.font = '500 20px "Inter", system-ui, sans-serif';
      ctx.fillText("Source: SEC EDGAR XBRL · Generated by Amber", 64, 774);
      ctx.textAlign = "right";
      ctx.fillStyle = amber;
      ctx.font = '700 22px "Inter", system-ui, sans-serif';
      ctx.fillText("AMBER", 1536, 774);

      const link = document.createElement("a");
      link.download = `amber-${ticker.toLowerCase()}-revenue-flow.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            Where Every $1 of Revenue Goes ({period.fiscalYear})
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {hasIncomeBreakdown
              ? "Automated SEC income statement flow from top-line Revenue to Net Income."
              : "Automated SEC cash flow breakdown from Revenue to Operating Cash Flow and True FCF."}
          </p>
        </div>

        <button
          type="button"
          onClick={exportSvgAsPng}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:bg-[var(--amber-soft)] hover:text-[var(--amber)] cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          Export PNG
        </button>
      </div>

      <div className="mt-4 w-full overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto min-w-[620px] w-full select-none"
          role="img"
          aria-label={`${ticker} proportional revenue flow diagram`}
        >
          {/* Ribbons: Col 0 -> Col 1 */}
          <path
            d={ribbonPath(x0 + barW, revY0, revY0 + gpH, x1, gpY0, gpY0 + gpH)}
            fill="var(--amber)"
            fillOpacity="0.22"
          />
          <path
            d={ribbonPath(
              x0 + barW,
              revY0 + gpH,
              revY0 + revH,
              x1,
              corY0,
              corY0 + corH
            )}
            fill="var(--reported)"
            fillOpacity="0.20"
          />

          {/* Ribbons: Col 1 (Gross Profit) -> Col 2 */}
          {col2Nodes.map((n) => (
            <path
              key={`r2-${n.label}`}
              d={ribbonPath(x1 + barW, n.srcY0, n.srcY1, x2, n.y0, n.y1)}
              fill={n.color}
              fillOpacity="0.22"
            />
          ))}

          {/* Ribbons: Col 2 (OpInc) -> Col 3 */}
          {col3Nodes.map((n) => (
            <path
              key={`r3-${n.label}`}
              d={ribbonPath(x2 + barW, n.srcY0, n.srcY1, x3, n.y0, n.y1)}
              fill={n.color}
              fillOpacity="0.24"
            />
          ))}

          {/* Node 0: Revenue */}
          <rect
            x={x0}
            y={revY0}
            width={barW}
            height={revH}
            rx={3}
            fill="var(--text-primary)"
          />
          <text
            x={x0 - 10}
            y={revY0 + revH / 2 - 6}
            textAnchor="end"
            className="fill-[var(--text-secondary)] text-[11px] font-medium"
          >
            Revenue
          </text>
          <text
            x={x0 - 10}
            y={revY0 + revH / 2 + 10}
            textAnchor="end"
            className="font-mono-num fill-[var(--text-primary)] text-[12px] font-semibold"
          >
            {formatCurrencyCompact(rev)}
          </text>

          {/* Node 1A: Gross Profit / OCF */}
          <rect
            x={x1}
            y={gpY0}
            width={barW}
            height={gpH}
            rx={3}
            fill="var(--amber)"
          />
          <text
            x={x1 + barW / 2}
            y={gpY0 - 16}
            textAnchor="middle"
            className="fill-[var(--text-secondary)] text-[10px] font-medium"
          >
            {hasIncomeBreakdown ? "Gross Profit" : "Op. Cash Flow"}
          </text>
          <text
            x={x1 + barW / 2}
            y={gpY0 - 4}
            textAnchor="middle"
            className="font-mono-num fill-[var(--amber)] text-[11px] font-semibold"
          >
            {formatCurrencyCompact(grossProfit)} ({formatPct((grossProfit / rev) * 100, false, 0)})
          </text>

          {/* Node 1B: Cost of Revenue */}
          <rect
            x={x1}
            y={corY0}
            width={barW}
            height={corH}
            rx={3}
            fill="var(--reported)"
          />
          <text
            x={x1 + barW + 8}
            y={corY0 + corH / 2 + 4}
            textAnchor="start"
            className="fill-[var(--text-muted)] text-[10px]"
          >
            {hasIncomeBreakdown ? "Cost of Rev" : "Op. Costs"}{" "}
            <tspan className="font-mono-num fill-[var(--text-secondary)] font-medium">
              {formatCurrencyCompact(costOfRev)} ({formatPct((costOfRev / rev) * 100, false, 0)})
            </tspan>
          </text>

          {/* Column 2 Nodes */}
          {col2Nodes.map((n, idx) => (
            <g key={`n2-${n.label}`}>
              <rect
                x={x2}
                y={n.y0}
                width={barW}
                height={Math.max(4, n.y1 - n.y0)}
                rx={3}
                fill={n.color}
              />
              {idx === 0 ? (
                <>
                  <text
                    x={x2 + barW / 2}
                    y={n.y0 - 16}
                    textAnchor="middle"
                    className="fill-[var(--text-secondary)] text-[10px] font-medium"
                  >
                    {n.label}
                  </text>
                  <text
                    x={x2 + barW / 2}
                    y={n.y0 - 4}
                    textAnchor="middle"
                    className="font-mono-num fill-[var(--amber)] text-[11px] font-semibold"
                  >
                    {formatCurrencyCompact(n.val)} ({formatPct((n.val / rev) * 100, false, 0)})
                  </text>
                </>
              ) : (
                <text
                  x={x2 + barW + 8}
                  y={(n.y0 + n.y1) / 2 + 3.5}
                  textAnchor="start"
                  className="fill-[var(--text-muted)] text-[10px]"
                >
                  {n.label}{" "}
                  <tspan className="font-mono-num fill-[var(--text-secondary)] font-medium">
                    {formatCurrencyCompact(n.val)}
                  </tspan>
                </text>
              )}
            </g>
          ))}

          {/* Column 3 Nodes */}
          {col3Nodes.map((n) => (
            <g key={`n3-${n.label}`}>
              <rect
                x={x3}
                y={n.y0}
                width={barW}
                height={Math.max(4, n.y1 - n.y0)}
                rx={3}
                fill={n.color}
              />
              <text
                x={x3 + barW + 8}
                y={(n.y0 + n.y1) / 2 - 2}
                textAnchor="start"
                className="fill-[var(--text-secondary)] text-[10px] font-medium"
              >
                {n.label}
              </text>
              <text
                x={x3 + barW + 8}
                y={(n.y0 + n.y1) / 2 + 10}
                textAnchor="start"
                className="font-mono-num fill-[var(--text-primary)] text-[10px] font-semibold"
              >
                {formatCurrencyCompact(n.val)} ({formatPct((n.val / rev) * 100, false, 0)})
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
