import {
  type CompanySnapshot,
  type ComputedAnnual,
  computeBalanceSheetHealth,
  formatCurrencyCompact,
  formatPct,
  isFinancialInstitution,
} from "@/lib/finance";

interface MoatQualityCardProps {
  company: CompanySnapshot;
  series: ComputedAnnual[];
}

interface MoatTrendPoint {
  fiscalYear: string;
  grossMargin: number | null;
  opMargin: number | null;
  roic: number | null;
}

export function MoatQualityCard({ company, series }: MoatQualityCardProps) {
  const fyOnly = series.filter((s) => s.fiscalYear !== "TTM");
  const netDebt = company.totalDebt - company.cashAndEquiv;

  const trendPoints: MoatTrendPoint[] = fyOnly.map((s) => {
    const grossMargin =
      typeof s.grossProfit === "number" && s.grossProfit > 0 && s.revenue > 0
        ? (s.grossProfit / s.revenue) * 100
        : null;
    const opMargin =
      typeof s.operatingIncome === "number" && s.revenue > 0
        ? (s.operatingIncome / s.revenue) * 100
        : null;
    let roic: number | null = null;
    if (
      typeof s.operatingIncome === "number" &&
      typeof s.stockholdersEquity === "number"
    ) {
      const rowNetDebt =
        typeof s.totalDebt === "number" && typeof s.cashAndEquiv === "number"
          ? s.totalDebt - s.cashAndEquiv
          : netDebt;
      const investedCapital = s.stockholdersEquity + rowNetDebt;
      if (investedCapital > 50) {
        const calc = ((s.operatingIncome * 0.79) / investedCapital) * 100;
        if (calc <= 150 && calc >= -60) roic = calc;
      }
    }
    return { fiscalYear: s.fiscalYear, grossMargin, opMargin, roic };
  });

  const gpSeries = trendPoints.filter((p) => p.grossMargin !== null);
  const opSeries = trendPoints.filter((p) => p.opMargin !== null);
  const roicSeries = trendPoints.filter((p) => p.roic !== null);

  if (gpSeries.length === 0 && opSeries.length === 0 && roicSeries.length === 0) {
    return null;
  }

  const latestGm =
    gpSeries.length > 0 ? gpSeries[gpSeries.length - 1].grossMargin! : null;
  const firstGm = gpSeries.length >= 2 ? gpSeries[0].grossMargin! : null;
  const gmBpsChange =
    latestGm !== null && firstGm !== null
      ? Math.round((latestGm - firstGm) * 100)
      : null;

  const latestOp =
    opSeries.length > 0 ? opSeries[opSeries.length - 1].opMargin! : null;
  const firstOp = opSeries.length >= 2 ? opSeries[0].opMargin! : null;
  const opBpsChange =
    latestOp !== null && firstOp !== null
      ? Math.round((latestOp - firstOp) * 100)
      : null;

  const latestRoic =
    roicSeries.length > 0 ? roicSeries[roicSeries.length - 1].roic! : null;

  const moatVerdict =
    (latestRoic !== null && latestRoic >= 20) ||
    (latestGm !== null && latestGm >= 65)
      ? {
          label: "Wide Moat Profile",
          tone: "text-[var(--positive)] bg-[var(--surface-subtle)] ring-[var(--border-strong)]",
        }
      : (latestRoic !== null && latestRoic >= 12) ||
          (latestGm !== null && latestGm >= 40)
        ? {
            label: "Solid Quality",
            tone: "text-[var(--amber)] bg-[var(--amber-soft)] ring-[var(--amber-border)]",
          }
        : {
            label: "Capital Intensive / Competitive",
            tone: "text-[var(--text-secondary)] bg-[var(--surface-subtle)] ring-[var(--border)]",
          };

  // Build 5-year visual trend SVG when >= 2 fiscal years have metrics
  const hasTrendChart = trendPoints.length >= 2;
  const W = 740;
  const H = 165;
  const pad = { top: 18, right: 32, bottom: 26, left: 42 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const allVals = trendPoints.flatMap((p) =>
    [p.grossMargin, p.opMargin, p.roic].filter(
      (v): v is number => typeof v === "number"
    )
  );
  const minVal = Math.min(0, Math.floor(Math.min(...allVals) / 10) * 10);
  const maxVal = Math.max(20, Math.ceil((Math.max(...allVals) + 5) / 10) * 10);
  const span = Math.max(10, maxVal - minVal);

  const xFor = (i: number) =>
    pad.left +
    (trendPoints.length === 1
      ? plotW / 2
      : (i / (trendPoints.length - 1)) * plotW);
  const yFor = (v: number) => pad.top + plotH - ((v - minVal) / span) * plotH;

  const buildPath = (getter: (p: MoatTrendPoint) => number | null) => {
    let d = "";
    trendPoints.forEach((p, i) => {
      const val = getter(p);
      if (val === null) return;
      d += `${d === "" ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(val).toFixed(1)} `;
    });
    return d.trim();
  };

  const gmPath = buildPath((p) => p.grossMargin);
  const opPath = buildPath((p) => p.opMargin);
  const roicPath = buildPath((p) => p.roic);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            Moat &amp; Capital Efficiency
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Multi-year pricing power, operating leverage, and return on invested capital.
          </p>
        </div>
        <span
          className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${moatVerdict.tone}`}
        >
          {moatVerdict.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {latestGm !== null && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--amber)]" />
              Gross Margin ({gpSeries[gpSeries.length - 1].fiscalYear})
            </div>
            <div className="font-mono-num mt-1 text-xl font-semibold text-[var(--text-primary)]">
              {formatPct(latestGm)}
            </div>
            {gmBpsChange !== null && (
              <div
                className={`font-mono-num mt-1 text-[11px] ${
                  gmBpsChange >= 100
                    ? "text-[var(--positive)]"
                    : gmBpsChange <= -100
                      ? "text-[var(--negative)]"
                      : "text-[var(--text-muted)]"
                }`}
              >
                {gmBpsChange > 0 ? "+" : ""}
                {gmBpsChange} bps vs. {gpSeries[0].fiscalYear}
              </div>
            )}
          </div>
        )}

        {latestOp !== null && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--text-primary)]" />
              Operating Margin ({opSeries[opSeries.length - 1].fiscalYear})
            </div>
            <div className="font-mono-num mt-1 text-xl font-semibold text-[var(--text-primary)]">
              {formatPct(latestOp)}
            </div>
            {opBpsChange !== null ? (
              <div
                className={`font-mono-num mt-1 text-[11px] ${
                  opBpsChange >= 100
                    ? "text-[var(--positive)]"
                    : opBpsChange <= -100
                      ? "text-[var(--negative)]"
                      : "text-[var(--text-muted)]"
                }`}
              >
                {opBpsChange > 0 ? "+" : ""}
                {opBpsChange} bps vs. {opSeries[0].fiscalYear}
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                Core business profitability
              </div>
            )}
          </div>
        )}

        {latestRoic !== null && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--positive)]" />
              ROIC ({roicSeries[roicSeries.length - 1].fiscalYear})
            </div>
            <div
              className={`font-mono-num mt-1 text-xl font-semibold ${
                latestRoic >= 18
                  ? "text-[var(--positive)]"
                  : latestRoic >= 10
                    ? "text-[var(--amber)]"
                    : "text-[var(--text-primary)]"
              }`}
            >
              {formatPct(latestRoic)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              NOPAT / Invested Capital
            </div>
          </div>
        )}
      </div>

      {hasTrendChart && (
        <div className="mt-4 overflow-x-auto border-t border-[var(--border)] pt-4">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[420px]"
            role="img"
            aria-label={`${company.ticker} multi-year Gross Margin, Operating Margin, and ROIC trend`}
          >
            {[0, 0.5, 1].map((t) => {
              const val = minVal + span * t;
              const y = yFor(val);
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
                    {Math.round(val)}%
                  </text>
                </g>
              );
            })}

            {gmPath && (
              <path
                d={gmPath}
                fill="none"
                stroke="var(--amber)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {opPath && (
              <path
                d={opPath}
                fill="none"
                stroke="var(--text-primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {roicPath && (
              <path
                d={roicPath}
                fill="none"
                stroke="var(--positive)"
                strokeWidth="2"
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {trendPoints.map((p, i) => {
              const cx = xFor(i);
              return (
                <g key={p.fiscalYear}>
                  {p.grossMargin !== null && (
                    <circle
                      cx={cx}
                      cy={yFor(p.grossMargin)}
                      r="3"
                      fill="var(--amber)"
                    />
                  )}
                  {p.opMargin !== null && (
                    <circle
                      cx={cx}
                      cy={yFor(p.opMargin)}
                      r="3"
                      fill="var(--text-primary)"
                    />
                  )}
                  {p.roic !== null && (
                    <circle
                      cx={cx}
                      cy={yFor(p.roic)}
                      r="3"
                      fill="var(--positive)"
                    />
                  )}
                  <text
                    x={cx}
                    y={H - 6}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--text-muted)"
                    className="font-mono-num"
                  >
                    {p.fiscalYear}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {!isFinancialInstitution(company) && (() => {
        const latest = series[series.length - 1];
        if (!latest) return null;
        const health = computeBalanceSheetHealth(company, latest, latestRoic);
        return (
          <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-[var(--border)] pt-3.5 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
              <div className="text-[11px] text-[var(--text-muted)]">Balance Sheet</div>
              <div className="font-mono-num mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                {health.isNetCash ? (
                  <span className="text-[var(--positive)]">
                    Net Cash {formatCurrencyCompact(Math.abs(health.netDebt))}
                  </span>
                ) : health.netDebtToEbitda !== null ? (
                  <span
                    className={
                      health.netDebtToEbitda > 3.5
                        ? "text-[var(--negative)]"
                        : "text-[var(--text-primary)]"
                    }
                  >
                    {health.netDebtToEbitda.toFixed(1)}× Net Debt/EBITDA
                  </span>
                ) : (
                  <span>Net Debt {formatCurrencyCompact(health.netDebt)}</span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
              <div className="text-[11px] text-[var(--text-muted)]">
                ROIC − WACC Spread ({company.defaultDcf.wacc}% WACC)
              </div>
              <div
                className={`font-mono-num mt-0.5 text-sm font-semibold ${
                  health.roicSpreadPct === null
                    ? "text-[var(--text-muted)]"
                    : health.roicSpreadPct >= 5
                      ? "text-[var(--positive)]"
                      : health.roicSpreadPct < 0
                        ? "text-[var(--negative)]"
                        : "text-[var(--amber)]"
                }`}
              >
                {health.roicSpreadPct !== null
                  ? formatPct(health.roicSpreadPct, true)
                  : "—"}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
              <div className="text-[11px] text-[var(--text-muted)]">
                Cash Conversion (True FCF / EBIT)
              </div>
              <div className="font-mono-num mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                {health.cashConversionPct !== null
                  ? formatPct(health.cashConversionPct)
                  : "—"}
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
