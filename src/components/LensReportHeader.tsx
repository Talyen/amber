"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import type { ExploreEntry } from "@/data/search-index";
import { deliverCanvasCard, type CardDeliveryMode } from "@/lib/export-card";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";
import { SITE_HOST } from "@/lib/site";
import { trackDistribution } from "@/lib/distribution";

interface LensReportHeaderProps {
  lensId: string;
  title: string;
  subtitle: string;
  whyItMatters: string;
  totalUniverse: number;
  matches: ExploreEntry[];
}

export function LensReportHeader({
  lensId,
  title,
  subtitle,
  whyItMatters,
  totalUniverse,
  matches,
}: LensReportHeaderProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "csv">("idle");
  const top10 = matches.slice(0, 10);
  const top3 = matches.slice(0, 3);
  const year = new Date().getFullYear();

  function handleDownloadCsv() {
    const headers = [
      "Ticker",
      "Company",
      "Sector",
      "Market Cap ($M)",
      "True FCF ($M)",
      "True FCF Margin (%)",
      "SBC % Revenue",
      "4Y Share Chg (%)",
      "Implied 10Y Growth (%)",
    ];
    const rows = matches.map((c) => [
      c.ticker,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.sector.replace(/"/g, '""')}"`,
      Math.round(c.marketCap),
      Math.round(c.trueFcf),
      c.scenarioBasis.equityLensOnly ? "" : c.trueFcfMargin.toFixed(2),
      c.sbcPctRevenue.toFixed(2),
      c.netDilutionCagr.toFixed(2),
      c.impliedCagr !== null ? c.impliedCagr.toFixed(2) : "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `amber-${lensId}-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("csv");
    window.setTimeout(() => setStatus("idle"), 1800);
  }

  async function handleExportTop10(mode: CardDeliveryMode) {
    const width = 1200;
    const height = 740;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(scale, scale);
    const isDark =
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const bg = isDark ? "#0B0C0E" : "#FAFAF9";
    const surface = isDark ? "#111317" : "#FFFFFF";
    const border = isDark ? "#23262E" : "#E6E4E0";
    const textPrimary = isDark ? "#F2F2F3" : "#151517";
    const textSecondary = isDark ? "#9CA0AB" : "#52525B";
    const amber = isDark ? "#E5A03C" : "#B45309";
    const sbcColor = isDark ? "#D97745" : "#C2410C";
    const posColor = isDark ? "#4ADE80" : "#15803D";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = surface;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(24, 24, width - 48, height - 48, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = amber;
    ctx.font = '700 13px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(`AMBER ${year} RANKING  /  ${matches.length} OF ${totalUniverse} ISSUERS`, 56, 68);

    ctx.fillStyle = textPrimary;
    ctx.font = '700 32px "Inter", system-ui, sans-serif';
    ctx.fillText(`Top 10 ${title}`, 56, 110);

    ctx.fillStyle = textSecondary;
    ctx.font = '400 15px "Inter", system-ui, sans-serif';
    ctx.fillText(subtitle, 56, 138);

    // Column headers
    const headY = 178;
    ctx.fillStyle = textSecondary;
    ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText("#", 56, headY);
    ctx.fillText("COMPANY", 92, headY);
    ctx.textAlign = "right";
    ctx.fillText("MKT CAP", 640, headY);
    ctx.fillText("TRUE FCF %", 785, headY);
    ctx.fillText("SBC % REV", 925, headY);
    ctx.fillText("4Y SHARE CHG", 1075, headY);
    ctx.textAlign = "left";

    top10.forEach((c, idx) => {
      const y = 198 + idx * 44;
      ctx.fillStyle = idx % 2 === 0 ? bg : surface;
      ctx.beginPath();
      ctx.roundRect(48, y, width - 96, 36, 8);
      ctx.fill();

      ctx.fillStyle = textSecondary;
      ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(String(idx + 1).padStart(2, "0"), 60, y + 23);

      ctx.fillStyle = amber;
      ctx.font = '700 14px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(c.ticker, 96, y + 23);

      ctx.fillStyle = textPrimary;
      ctx.font = '500 14px "Inter", system-ui, sans-serif';
      ctx.fillText(c.name.slice(0, 32), 182, y + 23);

      ctx.textAlign = "right";
      ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = textSecondary;
      ctx.fillText(formatCurrencyCompact(c.marketCap), 640, y + 23);

      ctx.fillStyle = amber;
      ctx.fillText(
        formatPct(c.scenarioBasis.equityLensOnly ? null : c.trueFcfMargin),
        785,
        y + 23
      );

      ctx.fillStyle = sbcColor;
      ctx.fillText(formatPct(c.sbcPctRevenue), 925, y + 23);

      ctx.fillStyle = c.netDilutionCagr < -0.5 ? posColor : textPrimary;
      ctx.fillText(formatPct(c.netDilutionCagr, true), 1075, y + 23);
      ctx.textAlign = "left";
    });

    ctx.fillStyle = textSecondary;
    ctx.font = '500 13px "Inter", system-ui, sans-serif';
    ctx.fillText("Source: SEC EDGAR XBRL (updated nightly)", 56, height - 44);
    ctx.textAlign = "right";
    ctx.fillStyle = amber;
    ctx.font = '700 13px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(`${SITE_HOST}/lenses/${lensId}`, width - 56, height - 44);

    const res = await deliverCanvasCard(
      canvas,
      `amber-top-10-${lensId}-${year}.png`,
      mode
    );
    if (res !== "failed") trackDistribution(res === "copied" ? "chart_copy" : "chart_download");
    setStatus(res === "copied" ? "copied" : "idle");
    window.setTimeout(() => setStatus("idle"), 1800);
  }

  return (
    <section className="mt-6">
      <div className="rounded-xl border border-[var(--amber-border)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <div className="font-mono-num text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--amber)]">
              Live {year} SEC EDGAR Ranking · {matches.length} of {totalUniverse} Companies
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
              {title}: {subtitle}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              {whyItMatters}
            </p>
            {lensId === "hidden-dilution" && (
              <Link href="/research/hidden-dilution" className="mt-2 inline-block text-sm font-medium text-[var(--amber)] underline-offset-4 hover:underline">
                How stock comp changes cash flow at CrowdStrike, Palo Alto Networks, and Palantir
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleExportTop10("copy")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 text-xs font-semibold text-[var(--amber)] transition-opacity hover:opacity-90 cursor-pointer"
            >
              {status === "copied" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[var(--positive)]" />
                  Copied Top 10 PNG
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Top 10 PNG
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {status === "csv" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[var(--positive)]" />
                  CSV Exported
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Download CSV
                </>
              )}
            </button>
          </div>
        </div>

        {top3.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {top3.map((c, idx) => (
              <Link
                key={c.ticker}
                href={`/t/${c.ticker}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 transition-colors hover:border-[var(--amber-border)]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-mono-num text-[var(--text-muted)]">#{idx + 1}</span>
                    <span className="font-mono-num font-bold text-[var(--amber)]">{c.ticker}</span>
                    <span className="truncate text-[var(--text-primary)]">{c.name}</span>
                  </div>
                  <div className="font-mono-num mt-0.5 text-[11px] text-[var(--text-muted)]">
                    True FCF {formatPct(c.scenarioBasis.equityLensOnly ? null : c.trueFcfMargin)} · SBC {formatPct(c.sbcPctRevenue)}
                  </div>
                </div>
                <span className="font-mono-num shrink-0 text-xs font-semibold text-[var(--text-secondary)]">
                  {formatCurrencyCompact(c.marketCap)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
