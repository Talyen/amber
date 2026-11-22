import {
  type CompanySnapshot,
  type ComputedAnnual,
  formatPct,
} from "@/lib/finance";

interface MoatQualityCardProps {
  company: CompanySnapshot;
  series: ComputedAnnual[];
}

export function MoatQualityCard({ company, series }: MoatQualityCardProps) {
  const fyOnly = series.filter((s) => s.fiscalYear !== "TTM");
  const gpSeries = fyOnly
    .filter((s) => typeof s.grossProfit === "number" && s.grossProfit! > 0 && s.revenue > 0)
    .map((s) => ({
      fiscalYear: s.fiscalYear,
      grossMargin: (s.grossProfit! / s.revenue) * 100,
    }));

  const latestFy = fyOnly[fyOnly.length - 1] ?? series[series.length - 1];
  const latestOpMargin =
    typeof latestFy.operatingIncome === "number" && latestFy.revenue > 0
      ? (latestFy.operatingIncome / latestFy.revenue) * 100
      : null;

  // Approximate ROIC = NOPAT (OpInc * 0.79) / Invested Capital (Equity + Debt - Cash)
  let roic: number | null = null;
  if (
    typeof latestFy.operatingIncome === "number" &&
    typeof latestFy.stockholdersEquity === "number"
  ) {
    const investedCapital =
      latestFy.stockholdersEquity + company.totalDebt - company.cashAndEquiv;
    if (investedCapital > 50) {
      roic = ((latestFy.operatingIncome * 0.79) / investedCapital) * 100;
      if (roic > 180 || roic < -80) roic = null;
    }
  }

  if (gpSeries.length === 0 && latestOpMargin === null && roic === null) {
    return null;
  }

  const latestGm = gpSeries.length > 0 ? gpSeries[gpSeries.length - 1].grossMargin : null;
  const firstGm = gpSeries.length >= 2 ? gpSeries[0].grossMargin : null;
  const gmBpsChange =
    latestGm !== null && firstGm !== null ? Math.round((latestGm - firstGm) * 100) : null;

  const moatVerdict =
    (roic !== null && roic >= 20) || (latestGm !== null && latestGm >= 65)
      ? {
          label: "Wide Moat Profile",
          tone: "text-[var(--positive)] bg-[var(--surface-subtle)] ring-[var(--border-strong)]",
        }
      : (roic !== null && roic >= 12) || (latestGm !== null && latestGm >= 40)
        ? {
            label: "Solid Quality",
            tone: "text-[var(--amber)] bg-[var(--amber-soft)] ring-[var(--amber-border)]",
          }
        : {
            label: "Capital Intensive / Competitive",
            tone: "text-[var(--text-secondary)] bg-[var(--surface-subtle)] ring-[var(--border)]",
          };

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            Moat &amp; Capital Efficiency
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Pricing power (Gross Margin trend) and how efficiently {company.ticker} turns invested capital into profit.
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
            <div className="text-[11px] text-[var(--text-muted)]">
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

        {latestOpMargin !== null && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5">
            <div className="text-[11px] text-[var(--text-muted)]">
              Operating Margin ({latestFy.fiscalYear})
            </div>
            <div className="font-mono-num mt-1 text-xl font-semibold text-[var(--text-primary)]">
              {formatPct(latestOpMargin)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              Core business profitability
            </div>
          </div>
        )}

        {roic !== null && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5">
            <div className="text-[11px] text-[var(--text-muted)]">
              Return on Invested Capital (ROIC)
            </div>
            <div
              className={`font-mono-num mt-1 text-xl font-semibold ${
                roic >= 18
                  ? "text-[var(--positive)]"
                  : roic >= 10
                    ? "text-[var(--amber)]"
                    : "text-[var(--text-primary)]"
              }`}
            >
              {formatPct(roic)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              NOPAT / (Equity + Debt − Cash)
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
