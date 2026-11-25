import {
  type CompanySnapshot,
  type ComputedAnnual,
  type ReverseDcfResult,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";

interface ExportTheme {
  bg: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  amber: string;
  reportedBar: string;
  sbcBar: string;
  trueBar: string;
  negativeBar: string;
}

function getExportTheme(): ExportTheme {
  const isDark =
    typeof window !== "undefined" &&
    (document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches));

  if (isDark) {
    return {
      bg: "#0B0C0E",
      surface: "#121418",
      border: "#22252C",
      textPrimary: "#F4F4F5",
      textSecondary: "#A1A1AA",
      textMuted: "#71717A",
      amber: "#E5A03C",
      reportedBar: "#3F4552",
      sbcBar: "#C26D3A",
      trueBar: "#E5A03C",
      negativeBar: "#E05D5D",
    };
  }

  return {
    bg: "#FAFAF9",
    surface: "#FFFFFF",
    border: "#E7E5E4",
    textPrimary: "#18181B",
    textSecondary: "#52525B",
    textMuted: "#71717A",
    amber: "#B45309",
    reportedBar: "#D6D3D1",
    sbcBar: "#EA580C",
    trueBar: "#B45309",
    negativeBar: "#DC2626",
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawAmberWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: ExportTheme,
  sourceNote: string
) {
  // Subtle bottom divider
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, height - 64);
  ctx.lineTo(width - 48, height - 64);
  ctx.stroke();

  // Source attribution on left
  ctx.fillStyle = theme.textMuted;
  ctx.font = '500 13px "Inter", system-ui, -apple-system, sans-serif';
  ctx.textAlign = "left";
  ctx.fillText(sourceNote, 48, height - 30);

  // Subtle Amber wordmark + gem on right
  const rightX = width - 48;
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '600 14px "Inter", system-ui, -apple-system, sans-serif';
  ctx.textAlign = "right";
  ctx.fillText("AMBER", rightX, height - 30);

  // Small amber diamond mark
  const markX = rightX - 64;
  const markY = height - 35;
  ctx.fillStyle = theme.amber;
  ctx.beginPath();
  ctx.moveTo(markX, markY - 6);
  ctx.lineTo(markX + 6, markY);
  ctx.lineTo(markX, markY + 6);
  ctx.lineTo(markX - 6, markY);
  ctx.closePath();
  ctx.fill();
}

function triggerDownload(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export function exportTrueFcfCard(
  company: CompanySnapshot,
  series: ComputedAnnual[]
) {
  const width = 1200;
  const height = 675;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(scale, scale);
  const theme = getExportTheme();

  // Background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  // Card surface
  drawRoundedRect(ctx, 24, 24, width - 48, height - 48, 16);
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Header
  ctx.fillStyle = theme.amber;
  ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = "left";
  ctx.fillText(`${company.ticker} / ${company.exchange}`, 56, 72);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '600 28px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText(`${company.name}: True Free Cash Flow`, 56, 108);

  const latest = series[series.length - 1];
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '400 15px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `Reported FCF (${formatCurrencyCompact(latest.reportedFcf)}) minus Stock-Based Compensation (${formatCurrencyCompact(latest.sbc)}) = True FCF (${formatCurrencyCompact(latest.trueFcf)})`,
    56,
    136
  );

  // Legend
  const legendItems = [
    { label: "Reported FCF", color: theme.reportedBar },
    { label: "Stock-Based Comp (SBC)", color: theme.sbcBar },
    { label: "True FCF (FCF − SBC)", color: theme.trueBar },
  ];
  let lx = 56;
  ctx.font = '500 13px "Inter", system-ui, -apple-system, sans-serif';
  for (const item of legendItems) {
    ctx.fillStyle = item.color;
    drawRoundedRect(ctx, lx, 162, 12, 12, 3);
    ctx.fill();
    ctx.fillStyle = theme.textSecondary;
    ctx.fillText(item.label, lx + 20, 173);
    lx += ctx.measureText(item.label).width + 44;
  }

  // Chart area
  const chartX = 76;
  const chartY = 205;
  const chartW = width - 132;
  const chartH = 345;

  const allVals = series.flatMap((d) => [d.reportedFcf, d.sbc, d.trueFcf, 0]);
  const maxVal = Math.max(...allVals) * 1.12;
  const minVal = Math.min(...allVals) * 1.12;
  const range = Math.max(1, maxVal - minVal);
  const yFor = (v: number) => chartY + ((maxVal - v) / range) * chartH;
  const zeroY = yFor(0);

  // Horizontal gridlines
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const val = minVal + (range * i) / 4;
    const y = yFor(val);
    ctx.beginPath();
    ctx.moveTo(chartX, y);
    ctx.lineTo(chartX + chartW, y);
    ctx.stroke();

    ctx.fillStyle = theme.textMuted;
    ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "right";
    ctx.fillText(formatCurrencyCompact(val), chartX - 10, y + 4);
  }

  // Bars
  const groupW = chartW / series.length;
  const barW = Math.min(34, (groupW - 44) / 3);
  const gap = 6;

  series.forEach((d, idx) => {
    const centerX = chartX + idx * groupW + groupW / 2;
    const totalBarsW = barW * 3 + gap * 2;
    const startX = centerX - totalBarsW / 2;

    const bars = [
      { val: d.reportedFcf, color: theme.reportedBar },
      { val: d.sbc, color: theme.sbcBar },
      {
        val: d.trueFcf,
        color: d.trueFcf >= 0 ? theme.trueBar : theme.negativeBar,
      },
    ];

    bars.forEach((b, bIdx) => {
      const bx = startX + bIdx * (barW + gap);
      const by = b.val >= 0 ? yFor(b.val) : zeroY;
      const bh = Math.max(2, Math.abs(yFor(b.val) - zeroY));
      ctx.fillStyle = b.color;
      drawRoundedRect(ctx, bx, by, barW, bh, 3);
      ctx.fill();
    });

    // Fiscal year label
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "center";
    ctx.fillText(d.fiscalYear, centerX, chartY + chartH + 26);

    // True FCF value above/below
    ctx.fillStyle = d.trueFcf >= 0 ? theme.amber : theme.negativeBar;
    ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(formatCurrencyCompact(d.trueFcf), centerX, chartY + chartH + 44);
  });

  drawAmberWatermark(
    ctx,
    width,
    height,
    theme,
    `Source: SEC EDGAR ${company.lastFiling.type} (${company.lastFiling.date}) | Accession ${company.lastFiling.accessionNumber}`
  );

  triggerDownload(canvas, `amber-${company.ticker.toLowerCase()}-true-fcf.png`);
}

export function exportReverseDcfCard(
  company: CompanySnapshot,
  params: {
    waccPct: number;
    terminalMultiple: number;
    targetTrueFcfMarginPct: number;
    enterpriseValue: number;
  },
  result: ReverseDcfResult
) {
  const width = 1200;
  const height = 675;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(scale, scale);
  const theme = getExportTheme();

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  drawRoundedRect(ctx, 24, 24, width - 48, height - 48, 16);
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Header
  ctx.fillStyle = theme.amber;
  ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = "left";
  ctx.fillText(`${company.ticker} / REVERSE DCF IMPLIED EXPECTATIONS`, 56, 72);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '600 30px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText(company.name, 56, 112);

  // Big implied CAGR hero box
  drawRoundedRect(ctx, 56, 148, 520, 210, 12);
  ctx.fillStyle = theme.bg;
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.stroke();

  ctx.fillStyle = theme.textSecondary;
  ctx.font = '500 14px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText("Market-Implied 10Y Revenue CAGR", 84, 190);

  ctx.fillStyle = theme.amber;
  ctx.font = '700 72px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(formatPct(result.impliedRevenueCagrPct, false, 1), 84, 276);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '400 14px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `Required annual growth to justify ${formatCurrencyCompact(params.enterpriseValue)} EV`,
    84,
    324
  );

  // Right column: Model Assumptions & Implied Year-10 State
  const stats = [
    { label: "Discount Rate (WACC)", value: formatPct(params.waccPct) },
    { label: "Terminal Multiple (True FCF)", value: `${params.terminalMultiple.toFixed(0)}x` },
    { label: "Target Year-10 True FCF Margin", value: formatPct(params.targetTrueFcfMarginPct) },
    { label: "Implied Year-10 Revenue", value: formatCurrencyCompact(result.year10Revenue) },
    { label: "Implied Year-10 True FCF", value: formatCurrencyCompact(result.year10TrueFcf) },
  ];

  stats.forEach((row, i) => {
    const y = 162 + i * 74;
    drawRoundedRect(ctx, 608, y, 536, 58, 10);
    ctx.fillStyle = theme.bg;
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.stroke();

    ctx.fillStyle = theme.textSecondary;
    ctx.font = '500 15px "Inter", system-ui, -apple-system, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(row.label, 632, y + 35);

    ctx.fillStyle = theme.textPrimary;
    ctx.font = '600 18px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "right";
    ctx.fillText(row.value, 1120, y + 35);
  });

  // Bottom callout strip
  drawRoundedRect(ctx, 56, 392, 520, 140, 12);
  ctx.fillStyle = theme.bg;
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '600 13px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText("MODEL METHODOLOGY", 84, 428);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '400 14px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText("Solves deterministically for the 10-year revenue CAGR whose", 84, 458);
  ctx.fillText("discounted SBC-adjusted True FCF + terminal multiple equals", 84, 480);
  ctx.fillText("current Enterprise Value (Market Cap + Debt − Cash).", 84, 502);

  drawAmberWatermark(
    ctx,
    width,
    height,
    theme,
    `Amber Reverse DCF | Base FY from SEC ${company.lastFiling.type} (${company.lastFiling.date})`
  );

  triggerDownload(
    canvas,
    `amber-${company.ticker.toLowerCase()}-reverse-dcf.png`
  );
}

export interface ComparisonExportItem {
  ticker: string;
  name: string;
  marketCap: number;
  trueFcf: number;
  trueFcfMargin: number;
  sbcPctRevenue: number;
  netDilutionCagr: number;
  impliedCagr: number;
}

export function exportComparisonCard(items: ComparisonExportItem[]) {
  if (items.length === 0) return;

  const width = 1200;
  const height = 675;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(scale, scale);
  const theme = getExportTheme();

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  drawRoundedRect(ctx, 24, 24, width - 48, height - 48, 16);
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  const tickersLabel = items.map((i) => i.ticker).join("  vs.  ");
  ctx.fillStyle = theme.amber;
  ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = "left";
  ctx.fillText(`SIDE-BY-SIDE COMPARISON / ${tickersLabel}`, 56, 72);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '600 28px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText("True Free Cash Flow, SBC Burden & Implied Growth", 56, 108);

  // Table layout
  const startY = 160;
  const colLabelW = 280;
  const colW = (width - 112 - colLabelW) / items.length;

  // Column headers
  items.forEach((item, idx) => {
    const cx = 56 + colLabelW + idx * colW + colW / 2;
    ctx.fillStyle = theme.amber;
    ctx.font = '700 20px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "center";
    ctx.fillText(item.ticker, cx, startY);

    ctx.fillStyle = theme.textMuted;
    ctx.font = '400 12px "Inter", system-ui, -apple-system, sans-serif';
    const shortName =
      item.name.length > 18 ? item.name.slice(0, 17) + "…" : item.name;
    ctx.fillText(shortName, cx, startY + 20);
  });

  const metricRows: Array<{
    label: string;
    format: (item: ComparisonExportItem) => string;
    color?: (item: ComparisonExportItem) => string;
  }> = [
    {
      label: "Market Cap",
      format: (i) => formatCurrencyCompact(i.marketCap),
    },
    {
      label: "True FCF (FCF − SBC)",
      format: (i) => formatCurrencyCompact(i.trueFcf),
      color: (i) => (i.trueFcf >= 0 ? theme.amber : theme.negativeBar),
    },
    {
      label: "True FCF Margin",
      format: (i) => formatPct(i.trueFcfMargin),
      color: (i) => (i.trueFcfMargin >= 0 ? theme.textPrimary : theme.negativeBar),
    },
    {
      label: "SBC Burden (% Revenue)",
      format: (i) => formatPct(i.sbcPctRevenue),
      color: () => theme.sbcBar,
    },
    {
      label: "Net Dilution (4Y CAGR)",
      format: (i) => formatPct(i.netDilutionCagr, true),
      color: (i) =>
        i.netDilutionCagr > 1.5 ? theme.negativeBar : theme.textPrimary,
    },
    {
      label: "Implied 10Y Rev CAGR",
      format: (i) => formatPct(i.impliedCagr),
      color: () => theme.amber,
    },
  ];

  metricRows.forEach((row, rIdx) => {
    const y = startY + 52 + rIdx * 62;
    drawRoundedRect(ctx, 56, y, width - 112, 50, 8);
    ctx.fillStyle = rIdx % 2 === 0 ? theme.bg : theme.surface;
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = theme.textSecondary;
    ctx.font = '500 15px "Inter", system-ui, -apple-system, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(row.label, 76, y + 30);

    items.forEach((item, cIdx) => {
      const cx = 56 + colLabelW + cIdx * colW + colW / 2;
      ctx.fillStyle = row.color ? row.color(item) : theme.textPrimary;
      ctx.font = '600 17px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = "center";
      ctx.fillText(row.format(item), cx, y + 31);
    });
  });

  drawAmberWatermark(
    ctx,
    width,
    height,
    theme,
    `Source: SEC EDGAR 10-K XBRL | Generated by Amber Comparison Studio`
  );

  triggerDownload(
    canvas,
    `amber-compare-${items.map((i) => i.ticker.toLowerCase()).join("-")}.png`
  );
}

export interface PortfolioExportPayload {
  holdings: Array<{ ticker: string; weightPct: number; impliedCagr: number; trueFcfMargin: number }>;
  wImplied: number;
  wTrueMargin: number;
  wSbcPct: number;
  wDilution: number;
  topSector: [string, number] | null;
}

export function exportPortfolioXRayCard(payload: PortfolioExportPayload) {
  const fundedHoldings = payload.holdings.filter(({ weightPct }) => weightPct > 0);
  fundedHoldings.sort((a, b) => b.weightPct - a.weightPct);
  const width = 1200;
  const height = 675;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(scale, scale);
  const theme = getExportTheme();

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  drawRoundedRect(ctx, 24, 24, width - 48, height - 48, 16);
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = theme.amber;
  ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = "left";
  ctx.fillText(
    `PORTFOLIO SNAPSHOT / ${fundedHoldings.length} HOLDINGS`,
    56,
    72
  );

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '600 28px "Inter", system-ui, -apple-system, sans-serif';
  ctx.fillText("What This Portfolio Is Really Betting On", 56, 108);

  // 4 KPI boxes
  const kpis = [
    { label: "WEIGHTED IMPLIED 10Y GROWTH", val: formatPct(payload.wImplied), color: theme.amber },
    { label: "WEIGHTED TRUE FCF MARGIN", val: formatPct(payload.wTrueMargin), color: theme.textPrimary },
    { label: "WEIGHTED SBC BURDEN", val: formatPct(payload.wSbcPct), color: theme.sbcBar },
    {
      label: "WEIGHTED NET DILUTION",
      val: formatPct(payload.wDilution, true),
      color: payload.wDilution > 1 ? theme.negativeBar : theme.textPrimary,
    },
  ];

  kpis.forEach((k, i) => {
    const x = 56 + i * 276;
    drawRoundedRect(ctx, x, 142, 258, 118, 10);
    ctx.fillStyle = theme.bg;
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.stroke();

    ctx.fillStyle = theme.textMuted;
    ctx.font = '600 11px "Inter", system-ui, sans-serif';
    ctx.fillText(k.label, x + 20, 174);

    ctx.fillStyle = k.color;
    ctx.font = '700 34px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(k.val, x + 20, 226);
  });

  // Top holdings bar list
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '600 13px "Inter", system-ui, sans-serif';
  ctx.fillText("TOP HOLDINGS & WEIGHTS", 56, 304);

  fundedHoldings.slice(0, 6).forEach((h, idx) => {
    const y = 324 + idx * 44;
    drawRoundedRect(ctx, 56, y, 1088, 34, 6);
    ctx.fillStyle = idx % 2 === 0 ? theme.bg : theme.surface;
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.stroke();

    ctx.fillStyle = theme.amber;
    ctx.font = '700 14px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "left";
    ctx.fillText(h.ticker, 76, y + 22);

    ctx.fillStyle = theme.textPrimary;
    ctx.font = '500 14px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(`${h.weightPct.toFixed(0)}% weight`, 180, y + 22);

    ctx.fillStyle = theme.textSecondary;
    ctx.fillText(`True FCF Margin ${formatPct(h.trueFcfMargin)}`, 420, y + 22);

    ctx.textAlign = "right";
    ctx.fillStyle = theme.textPrimary;
    ctx.fillText(`Implied 10Y: ${formatPct(h.impliedCagr)}`, 1120, y + 22);
    ctx.textAlign = "left";
  });

  drawAmberWatermark(
    ctx,
    width,
    height,
    theme,
    payload.topSector
      ? `Top Sector: ${payload.topSector[0]} (${payload.topSector[1].toFixed(0)}%) | SEC EDGAR 10-K/10-Q`
      : `Source: SEC EDGAR 10-K/10-Q | Amber Portfolio Analyzer`
  );

  triggerDownload(canvas, "amber-portfolio.png");
}

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.length > 0) {
    const last = lines[maxLines - 1];
    if (last.length > 3 && text.length > lines.join(" ").length + 4) {
      lines[maxLines - 1] = `${last.slice(0, -1)}…`;
    }
  }
  return lines;
}

export function exportFilingDiffCard(payload: {
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string;
  category: string;
  section: string;
  materiality: string;
  headline: string;
  priorExcerpt: string;
  currentExcerpt: string;
  signalNote: string;
  accessionNumber: string;
}) {
  const width = 1200;
  const height = 740;
  const scale = 2;
  const theme = getExportTheme();

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);

  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  // Header
  ctx.fillStyle = theme.amber;
  ctx.font = '700 14px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(
    `${payload.ticker}  /  SEC ${payload.filingType} (${payload.filingDate})  /  ${payload.category.toUpperCase()}`,
    56,
    60
  );

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '600 28px "Inter", system-ui, sans-serif';
  const headlineLines = wrapCanvasLines(ctx, payload.headline, width - 112, 2);
  headlineLines.forEach((line, i) => {
    ctx.fillText(line, 56, 104 + i * 36);
  });

  const boxesTop = 104 + headlineLines.length * 36 + 20;
  const boxW = 528;
  const boxH = 310;

  // Left Box: Prior Filing Language
  drawRoundedRect(ctx, 56, boxesTop, boxW, boxH, 10);
  ctx.fillStyle = theme.bg;
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.stroke();

  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 12px "Inter", system-ui, sans-serif';
  ctx.fillText("PRIOR FILING LANGUAGE", 78, boxesTop + 34);

  ctx.fillStyle = theme.textSecondary;
  ctx.font = '400 16px "Inter", system-ui, sans-serif';
  const priorLines = wrapCanvasLines(
    ctx,
    `"${payload.priorExcerpt}"`,
    boxW - 44,
    10
  );
  priorLines.forEach((line, i) => {
    ctx.fillText(line, 78, boxesTop + 68 + i * 24);
  });

  // Right Box: Latest Filing Language
  const rightX = 56 + boxW + 32;
  drawRoundedRect(ctx, rightX, boxesTop, boxW, boxH, 10);
  ctx.fillStyle =
    theme.bg === "#0B0C0E"
      ? "rgba(229, 160, 60, 0.08)"
      : "rgba(180, 83, 9, 0.06)";
  ctx.fill();
  ctx.strokeStyle = theme.amber;
  ctx.stroke();

  ctx.fillStyle = theme.amber;
  ctx.font = '700 12px "Inter", system-ui, sans-serif';
  ctx.fillText("→  LATEST FILING LANGUAGE", rightX + 22, boxesTop + 34);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '500 16px "Inter", system-ui, sans-serif';
  const currLines = wrapCanvasLines(
    ctx,
    `"${payload.currentExcerpt}"`,
    boxW - 44,
    10
  );
  currLines.forEach((line, i) => {
    ctx.fillText(line, rightX + 22, boxesTop + 68 + i * 24);
  });

  // Amber Take Footer Box
  const takeY = boxesTop + boxH + 24;
  drawRoundedRect(ctx, 56, takeY, width - 112, 86, 10);
  ctx.fillStyle = theme.bg;
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.stroke();

  ctx.fillStyle = theme.amber;
  ctx.font = '700 12px "Inter", system-ui, sans-serif';
  ctx.fillText("WHY IT MATTERS", 78, takeY + 28);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '400 15px "Inter", system-ui, sans-serif';
  const takeLines = wrapCanvasLines(ctx, payload.signalNote, width - 156, 2);
  takeLines.forEach((line, i) => {
    ctx.fillText(line, 78, takeY + 52 + i * 22);
  });

  drawAmberWatermark(
    ctx,
    width,
    height,
    theme,
    `SEC EDGAR ${payload.accessionNumber}  |  ${payload.companyName}`
  );

  triggerDownload(
    canvas,
    `amber-${payload.ticker.toLowerCase()}-filing-diff.png`
  );
}
