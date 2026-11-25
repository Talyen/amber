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

  const latestDividends = Math.max(0, latest.dividendsPaid ?? 0);
  const cumBuybacks = fyOnly.reduce((sum, r) => sum + r.buybacks, 0);
  const cumDividends = fyOnly.reduce((sum, r) => sum + Math.max(0, r.dividendsPaid ?? 0), 0);
  const cumSbc = fyOnly.reduce((sum, r) => sum + r.sbc, 0);
  const cumNetReturn = cumBuybacks + cumDividends - cumSbc;

  const latestNetReturn = latest.buybacks + latestDividends - latest.sbc;
  const dividendYieldPct = marketCap > 0 ? (latestDividends / marketCap) * 100 : 0;
  const totalShareholderYieldPct =
    marketCap > 0 ? (latestNetReturn / marketCap) * 100 : 0;
  const payoutVsTrueFcf =
    latestDividends > 0 && latest.trueFcf > 0
      ? (latestDividends / latest.trueFcf) * 100
      : null;

  const hasDividends = latestDividends > 0 || cumDividends > 0;

  const verdict: {
    label: string;
    tone: string;
    detail: string;
  } =
    latest.buybacks === 0 && latestDividends === 0 && latest.sbc === 0
      ? {
          label: "Minimal Equity Activity",
          tone: "text-[var(--text-secondary)] bg-[var(--surface-subtle)] ring-[var(--border)]",
          detail: `No material share repurchases, cash dividends, or stock-based compensation were recorded in ${latest.fiscalYear}.`,
        }
      : latestNetReturn > latest.sbc * 0.25 && latest.buybacks + latestDividends > 0
        ? {
            label:
              latestDividends > 0 && latest.buybacks === 0
                ? "Dividend Capital Return"
                : latestDividends > 0
                  ? "Dividends + Buybacks Exceed SBC"
                  : "Buybacks Exceed SBC",
            tone: "text-[var(--positive)] bg-[var(--surface-subtle)] ring-[var(--border-strong)]",
            detail:
              latestDividends > 0
                ? `Cash dividends (${formatCurrencyCompact(latestDividends)}) and buybacks (${formatCurrencyCompact(latest.buybacks)}) exceeded SBC by ${formatCurrencyCompact(latestNetReturn)} in ${latest.fiscalYear}${payoutVsTrueFcf !== null ? ` (${payoutVsTrueFcf.toFixed(0)}% of True FCF paid as dividends)` : ""}.`
                : `Buyback spending exceeded reported SBC expense by ${formatCurrencyCompact(latestNetReturn)} in ${latest.fiscalYear}.`,
          }
        : latestNetReturn < -latest.sbc * 0.25
          ? {
              label: "SBC Exceeds Capital Return",
              tone: "text-[var(--sbc)] bg-[var(--amber-soft)] ring-[var(--amber-border)]",
              detail: `Reported SBC expense exceeded buybacks and dividends by ${formatCurrencyCompact(Math.abs(latestNetReturn))} in ${latest.fiscalYear}.`,
            }
          : {
              label: "Capital Return Close to SBC",
              tone: "text-[var(--text-primary)] bg-[var(--surface-subtle)] ring-[var(--border)]",
              detail: `Buybacks and cash dividends were roughly offset by reported SBC expense in ${latest.fiscalYear}.`,
            };

  return (
    <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            {hasDividends
              ? "Shareholder Return & Buyback Reality (Buybacks + Dividends − SBC)"
              : "Buyback Reality Check (Buybacks − SBC)"}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {hasDividends
              ? "Combines cash dividends and share repurchases, net of stock-based compensation dilution."
              : "Compares share repurchase spending with reported stock-based compensation expense."}
          </p>
        </div>

        <span
          className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${verdict.tone}`}
        >
          {verdict.label}
        </span>
      </div>

      <div
        className={`mt-4 grid grid-cols-2 gap-3 ${
          hasDividends ? "sm:grid-cols-5" : "sm:grid-cols-4"
        }`}
      >
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div className="text-[11px] text-[var(--text-muted)]">
            Buybacks ({latest.fiscalYear})
          </div>
          <div className="font-mono-num mt-1 text-base font-semibold text-[var(--text-primary)]">
            {formatCurrencyCompact(latest.buybacks)}
          </div>
        </div>

        {hasDividends && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
            <div className="text-[11px] text-[var(--text-muted)]">
              Dividends ({latest.fiscalYear})
            </div>
            <div className="font-mono-num mt-1 text-base font-semibold text-[var(--positive)]">
              {formatCurrencyCompact(latestDividends)}
            </div>
            <div className="font-mono-num mt-0.5 text-[10px] text-[var(--text-muted)]">
              {dividendYieldPct.toFixed(2)}% yield
            </div>
          </div>
        )}

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
            {hasDividends ? "Total Shareholder Yield" : "Net Buyback Yield"}
          </div>
          <div
            className={`font-mono-num mt-1 text-base font-semibold ${
              totalShareholderYieldPct > 0.25
                ? "text-[var(--positive)]"
                : totalShareholderYieldPct < -0.25
                  ? "text-[var(--negative)]"
                  : "text-[var(--text-primary)]"
            }`}
          >
            {formatPct(totalShareholderYieldPct, true, 2)}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div className="text-[11px] text-[var(--text-muted)]">
            {fyOnly.length}Y Cumulative Net
          </div>
          <div
            className={`font-mono-num mt-1 text-base font-semibold ${
              cumNetReturn >= 0
                ? "text-[var(--positive)]"
                : "text-[var(--negative)]"
            }`}
          >
            {cumNetReturn > 0 ? "+" : ""}
            {formatCurrencyCompact(cumNetReturn)}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        {verdict.detail}
      </p>
    </section>
  );
}
