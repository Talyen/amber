import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import type { SearchIndexEntry } from "@/data/universe";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

interface NotableSignalsFeedProps {
  entries: SearchIndexEntry[];
}

export function NotableSignalsFeed({ entries }: NotableSignalsFeedProps) {
  const eligible = entries.filter(
    (c) =>
      c.revenue >= 500 &&
      c.trueFcfMargin <= 75 &&
      c.trueFcfMargin >= -120 &&
      c.sbcPctRevenue <= 85
  );

  if (eligible.length === 0) return null;

  const topBuyback = [...eligible]
    .filter((c) => c.trueFcf > 0 && c.netDilutionCagr < -1)
    .sort((a, b) => a.netDilutionCagr - b.netDilutionCagr)[0];

  const topSbcTrap = [...eligible]
    .filter((c) => c.reportedFcf > 0 && c.trueFcf < 0)
    .sort((a, b) => b.sbcPctRevenue - a.sbcPctRevenue)[0];

  const topCashMachine = [...eligible]
    .filter((c) => c.sbcPctRevenue <= 5)
    .sort((a, b) => b.trueFcfMargin - a.trueFcfMargin)[0];

  const topPricedForPerfection = [...eligible]
    .filter((c) => c.impliedCagr > 0 && c.impliedCagr < 60)
    .sort((a, b) => b.impliedCagr - a.impliedCagr)[0];

  const stories = [
    topCashMachine && {
      tag: "Cash Machine",
      ticker: topCashMachine.ticker,
      name: topCashMachine.name,
      headline: `Converts ${formatPct(topCashMachine.trueFcfMargin)} of revenue into real cash`,
      sub: `${formatCurrencyCompact(topCashMachine.trueFcf)} True FCF with only ${formatPct(topCashMachine.sbcPctRevenue)} SBC drag.`,
    },
    topSbcTrap && {
      tag: "Hidden Dilution",
      ticker: topSbcTrap.ticker,
      name: topSbcTrap.name,
      headline: `Positive headline FCF flips negative after stock comp`,
      sub: `Reported ${formatCurrencyCompact(topSbcTrap.reportedFcf)} FCF vs. ${formatCurrencyCompact(topSbcTrap.sbc)} SBC → ${formatCurrencyCompact(topSbcTrap.trueFcf)} True FCF.`,
    },
    topBuyback && {
      tag: "Share Cannibal",
      ticker: topBuyback.ticker,
      name: topBuyback.name,
      headline: `Shrinking share count by ${Math.abs(topBuyback.netDilutionCagr).toFixed(1)}%/yr`,
      sub: `Consistent net buybacks compounding per-share cash flow automatically.`,
    },
    topPricedForPerfection && {
      tag: "High Expectations",
      ticker: topPricedForPerfection.ticker,
      name: topPricedForPerfection.name,
      headline: `Market prices in ${formatPct(topPricedForPerfection.impliedCagr)}/yr growth for 10 years`,
      sub: `Stress-test whether ${topPricedForPerfection.ticker} can clear that bar in the Valuation studio.`,
    },
  ].filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (stories.length === 0) return null;

  return (
    <section aria-label="Notable market signals" className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <Flame className="h-4 w-4 text-[var(--amber)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Notable Signals Across the Market
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {stories.map((story) => (
          <Link
            key={`${story.tag}-${story.ticker}`}
            href={`/t/${story.ticker}`}
            className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--amber-border)]"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded bg-[var(--amber-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--amber)]">
                  {story.tag}
                </span>
                <span className="font-mono-num text-xs font-semibold text-[var(--text-primary)]">
                  {story.ticker}
                </span>
              </div>
              <h3 className="mt-2.5 text-sm font-semibold leading-snug text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                {story.headline}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                {story.sub}
              </p>
            </div>
            <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] group-hover:text-[var(--amber)]">
              Inspect {story.name}
              <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
