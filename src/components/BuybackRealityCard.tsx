import {
  type ComputedAnnual,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";

interface BuybackRealityCardProps {
  series: ComputedAnnual[];
  marketCap: number;
}

export function BuybackRealityCard({
  series,
  marketCap,
}: BuybackRealityCardProps) {
  // Exclude TTM when summing multi-year cumulative FY totals so we don't double-count
  const fyOnly = series.filter((r) => r.fiscalYear !== "TTM");
  const latest = series[series.length - 1];

  const cumBuybacks = fyOnly.reduce((sum, r) => sum + r.buybacks, 0);
  const cumSbc = fyOnly.reduce((sum, r) => sum + r.sbc, 0);
  const cumNetSpread = cumBuybacks - cumSbc;

  const latestNetSpread = latest.buybacks - latest.sbc;
  const netYieldPct = marketCap > 0 ? (latestNetSpread / marketCap) * 100 : 0;

  const verdict: {
    label: string;
    tone: string;
    detail: string;
  } =
    latest.buybacks === 0 && latest.sbc === 0
      ? {
          label: "Minimal Equity Activity",
          tone: "text-[var(--text-secondary)] bg-[var(--surface-subtle)] ring-[var(--border)]",
          detail: `No material share repurchases or stock-based compensation were recorded in ${latest.fiscalYear}.`,
        }
      : latestNetSpread > latest.sbc * 0.25 && latest.buybacks > 0
      ? {
          label: "Net Share Reducer",
          tone: "text-[var(--positive)] bg-[var(--surface-subtle)] ring-[var(--border-strong)]",
          detail: `Buybacks exceeded SBC by ${formatCurrencyCompact(latestNetSpread)} in ${latest.fiscalYear}, genuinely shrinking the share base.`,
        }
      : latestNetSpread < -latest.sbc * 0.25
        ? {
            label: "Net Equity Diluter",
            tone: "text-[var(--sbc)] bg-[var(--amber-soft)] ring-[var(--amber-border)]",
            detail: `SBC outpaced buybacks by ${formatCurrencyCompact(Math.abs(latestNetSpread))} in ${latest.fiscalYear}, so repurchases did not fully offset employee grants.`,
          }
        : {
            label: "Neutralized Issuance",
            tone: "text-[var(--text-primary)] bg-[var(--surface-subtle)] ring-[var(--border)]",
            detail: `Share repurchases roughly offset SBC in ${latest.fiscalYear}, keeping dilution flat.`,
          };

  return (
    <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            Buyback Reality Check (Buybacks − SBC)
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Separates genuine capital return from buybacks spent merely mopping up employee stock grants.
          </p>
        </div>

        <span
          className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${verdict.tone}`}
        >
          {verdict.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div className="text-[11px] text-[var(--text-muted)]">
            Buybacks ({latest.fiscalYear})
          </div>
          <div className="font-mono-num mt-1 text-base font-semibold text-[var(--text-primary)]">
            {formatCurrencyCompact(latest.buybacks)}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div className="text-[11px] text-[var(--text-muted)]">
            SBC Issued ({latest.fiscalYear})
          </div>
          <div className="font-mono-num mt-1 text-base font-semibold text-[var(--sbc)]">
            {formatCurrencyCompact(latest.sbc)}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div className="text-[11px] text-[var(--text-muted)]">
            Net Buyback Yield
          </div>
          <div
            className={`font-mono-num mt-1 text-base font-semibold ${
              netYieldPct > 0.25
                ? "text-[var(--positive)]"
                : netYieldPct < -0.25
                  ? "text-[var(--negative)]"
                  : "text-[var(--text-primary)]"
            }`}
          >
            {formatPct(netYieldPct, true, 2)}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div className="text-[11px] text-[var(--text-muted)]">
            {fyOnly.length}Y Cumulative Net
          </div>
          <div
            className={`font-mono-num mt-1 text-base font-semibold ${
              cumNetSpread >= 0
                ? "text-[var(--positive)]"
                : "text-[var(--negative)]"
            }`}
          >
            {cumNetSpread > 0 ? "+" : ""}
            {formatCurrencyCompact(cumNetSpread)}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        {verdict.detail}
      </p>
    </section>
  );
}
