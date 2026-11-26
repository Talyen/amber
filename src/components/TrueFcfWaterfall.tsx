import {
  type ComputedAnnual,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";

interface TrueFcfWaterfallProps {
  period: ComputedAnnual;
}

export function TrueFcfWaterfall({ period }: TrueFcfWaterfallProps) {
  const maxAbs = Math.max(
    1,
    Math.abs(period.operatingCashFlow),
    Math.abs(period.capex),
    Math.abs(period.reportedFcf),
    Math.abs(period.sbc),
    Math.abs(period.trueFcf)
  );

  const steps = [
    {
      label: "Operating Cash",
      sub: `${formatPct((period.operatingCashFlow / period.revenue) * 100)} of rev`,
      value: period.operatingCashFlow,
      sign: "",
      color: "var(--text-primary)",
      barColor: "var(--reported)",
      isSubtotal: false,
    },
    {
      label: "CapEx",
      sub: `${formatPct((period.capex / period.revenue) * 100)} of rev`,
      value: -period.capex,
      sign: "−",
      color: "var(--text-secondary)",
      barColor: "var(--border-strong)",
      isSubtotal: false,
    },
    {
      label: "Reported FCF",
      sub: `${formatPct(period.reportedFcfMargin)} margin`,
      value: period.reportedFcf,
      sign: "=",
      color: "var(--text-primary)",
      barColor: "var(--reported)",
      isSubtotal: true,
    },
    {
      label: "Stock Comp",
      sub: period.sbcPctReportedFcf === null
        ? `${formatPct(period.sbcPctRevenue)} of rev`
        : `${formatPct(period.sbcPctRevenue)} of rev · ${formatPct(period.sbcPctReportedFcf, false, 0)} of FCF`,
      value: -period.sbc,
      sign: "−",
      color: "var(--sbc)",
      barColor: "var(--sbc)",
      isSubtotal: false,
    },
    {
      label: "True FCF",
      sub: `${formatPct(period.trueFcfMargin)} margin`,
      value: period.trueFcf,
      sign: "=",
      color: period.trueFcf >= 0 ? "var(--amber)" : "var(--negative)",
      barColor: period.trueFcf >= 0 ? "var(--amber)" : "var(--negative)",
      isSubtotal: true,
    },
  ];

  return (
    <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
          True FCF Bridge ({period.fiscalYear})
        </h3>
        <span className="font-mono-num rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
          Rev {formatCurrencyCompact(period.revenue)}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {steps.map((step) => {
          const widthPct = Math.max(
            2,
            Math.min(100, (Math.abs(step.value) / maxAbs) * 100)
          );
          return (
            <div
              key={step.label}
              className={`grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center ${
                step.isSubtotal
                  ? "border-t border-[var(--border)] pt-3"
                  : ""
              }`}
            >
              <div className="sm:col-span-4">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono-num inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[var(--surface-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
                    {step.sign || "="}
                  </span>
                  <span
                    className={
                      step.isSubtotal
                        ? "font-semibold text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)]"
                    }
                  >
                    {step.label}
                  </span>
                </div>
                <div className="font-mono-num pl-6 text-[10px] text-[var(--text-muted)]">
                  {step.sub}
                </div>
              </div>

              <div className="sm:col-span-6">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: step.barColor,
                    }}
                  />
                </div>
              </div>

              <div
                className="font-mono-num text-right text-xs font-semibold sm:col-span-2"
                style={{ color: step.color }}
              >
                {formatCurrencyCompact(step.value)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
