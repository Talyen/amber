"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Bot, Calendar, Trophy } from "lucide-react";
import type { ArenaPortfolioView } from "@/data/arena-repository";
import { TopNav } from "@/components/TopNav";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { formatPct } from "@/lib/finance";

interface ArenaLeaderboardProps {
  portfolios: ArenaPortfolioView[];
  benchmarks?: Record<string, number>;
}

type Timeframe = "monthly" | "yearly" | "all";
type TypeFilter = "all" | "community" | "bots";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatMonthKey(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  return MONTH_NAMES[idx] ? `${MONTH_NAMES[idx]} ${y}` : ym;
}

export function ArenaLeaderboard({
  portfolios,
  benchmarks = {},
}: ArenaLeaderboardProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("monthly");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const p of portfolios) {
      if (/^\d{4}-\d{2}$/.test(p.periodKey)) {
        set.add(p.periodKey);
      }
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [portfolios]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const p of portfolios) {
      if (/^\d{4}$/.test(p.periodKey)) {
        set.add(p.periodKey);
      } else if (/^\d{4}-\d{2}$/.test(p.periodKey)) {
        set.add(p.periodKey.slice(0, 4));
      }
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [portfolios]);

  const [selectedMonth, setSelectedMonth] = useState<string>(
    availableMonths[0] ?? "2026-11"
  );
  const [selectedYear, setSelectedYear] = useState<string>(
    availableYears[0] ?? "2026"
  );

  const topTen = useMemo(() => {
    const byType = portfolios.filter((p) => {
      if (typeFilter === "community" && p.isBot) return false;
      if (typeFilter === "bots" && !p.isBot) return false;
      return true;
    });

    let scoped: ArenaPortfolioView[];
    if (timeframe === "monthly") {
      const isLatestMonth = selectedMonth === availableMonths[0];
      scoped = byType.filter(
        (p) =>
          p.periodKey === selectedMonth ||
          (isLatestMonth && !p.isBot && !p.isFinalized)
      );
    } else if (timeframe === "yearly") {
      const isLatestYear = selectedYear === availableYears[0];
      // Match dedicated yearly entries plus community entries locked that year (or still active in the current year)
      scoped = byType.filter(
        (p) =>
          p.periodKey === selectedYear ||
          (!p.isBot && p.periodKey.startsWith(`${selectedYear}-`)) ||
          (isLatestYear && !p.isBot && !p.isFinalized)
      );
    } else {
      // All-Time: deduplicate by handle so each bot/user appears once (preferring longest-running live entry)
      const liveOnly = byType.filter((p) => !p.isFinalized);
      const byHandle = new Map<string, ArenaPortfolioView>();
      for (const p of liveOnly) {
        const key = p.handle.toLowerCase();
        const existing = byHandle.get(key);
        if (!existing || p.lockedAt < existing.lockedAt) {
          byHandle.set(key, p);
        }
      }
      scoped = [...byHandle.values()];
    }

    return [...scoped]
      .sort((a, b) => b.totalReturnPct - a.totalReturnPct)
      .slice(0, 10);
  }, [portfolios, timeframe, typeFilter, selectedMonth, selectedYear, availableMonths, availableYears]);

  const isViewingArchive =
    (timeframe === "monthly" && selectedMonth !== availableMonths[0]) ||
    (timeframe === "yearly" && selectedYear !== availableYears[0]);

  // Only compare against a single-period SPY benchmark on Monthly/Yearly views (never mismatch All-Time vs 1Y SPY)
  const activeBenchmarkKey =
    timeframe === "monthly"
      ? selectedMonth
      : timeframe === "yearly"
        ? selectedYear
        : null;
  const spyBenchmark = activeBenchmarkKey ? benchmarks[activeBenchmarkKey] : undefined;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="arena" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <section className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
              Portfolio Arena
            </h1>
            <p className="mt-1 max-w-xl text-sm text-[var(--text-secondary)]">
              Strategy bots and community portfolios tracked against the S&amp;P 500.
            </p>
          </div>

          <Link
            href="/portfolio"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--cta-bg)] px-4 text-xs font-semibold text-[var(--cta-fg)] ring-1 ring-inset ring-white/15 transition-colors hover:bg-[var(--cta-bg-hover)]"
          >
            Enter Portfolio
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>

        {/* Primary Timeframe + Type Controls */}
        <section className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
            {(
              [
                { id: "monthly", label: "Monthly" },
                { id: "yearly", label: "Yearly" },
                { id: "all", label: "All-Time" },
              ] as const
            ).map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setTimeframe(tf.id)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                  timeframe === tf.id
                    ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {typeof spyBenchmark === "number" && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs">
                <span className="text-[var(--text-muted)]">S&amp;P 500</span>
                <span
                  className={`font-mono-num font-semibold ${
                    spyBenchmark >= 0
                      ? "text-[var(--positive)]"
                      : "text-[var(--negative)]"
                  }`}
                >
                  {formatPct(spyBenchmark, true)}
                </span>
              </div>
            )}
            {(
              [
                { id: "all", label: "All" },
                { id: "community", label: "Community" },
                { id: "bots", label: "Strategy Bots" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTypeFilter(f.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  typeFilter === f.id
                    ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>

        {/* Past Month / Past Year Selector Bar */}
        {timeframe === "monthly" && availableMonths.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] mr-1">
              <Calendar className="h-3 w-3" />
              Month:
            </span>
            {availableMonths.map((ym, i) => {
              const active = ym === selectedMonth;
              return (
                <button
                  key={ym}
                  type="button"
                  onClick={() => setSelectedMonth(ym)}
                  className={`font-mono-num rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                      : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {formatMonthKey(ym)}
                  {i === 0 ? " (Live)" : ""}
                </button>
              );
            })}
          </div>
        )}

        {timeframe === "yearly" && availableYears.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] mr-1">
              <Calendar className="h-3 w-3" />
              Year:
            </span>
            {availableYears.map((yr, i) => {
              const active = yr === selectedYear;
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setSelectedYear(yr)}
                  className={`font-mono-num rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                      : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {yr}
                  {i === 0 ? " (Live)" : " Winners"}
                </button>
              );
            })}
          </div>
        )}

        {/* Top 10 Ranked Leaderboard */}
        <section className="mt-6 space-y-3">
          {topTen.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                No portfolios in this leaderboard yet
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Be the first to enter a 3–10 stock portfolio from the Portfolio builder.
              </p>
              <Link
                href="/portfolio"
                className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--cta-bg)] px-3.5 text-xs font-semibold text-[var(--cta-fg)] ring-1 ring-inset ring-white/15 transition-colors hover:bg-[var(--cta-bg-hover)]"
              >
                Go to Portfolio Builder
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            topTen.map((p, idx) => (
              <Link
                key={p.id}
                href={`/arena/${p.id}`}
                className="group flex flex-col justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--amber-border)] sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="flex shrink-0 items-center gap-2.5">
                    <div
                      title={
                        idx === 0
                          ? "1st Place (Gold)"
                          : idx === 1
                            ? "2nd Place (Silver)"
                            : idx === 2
                              ? "3rd Place (Bronze)"
                              : `Rank #${idx + 1}`
                      }
                      className={`font-mono-num w-7 text-center text-sm font-bold ${
                        idx === 0
                          ? "text-yellow-600 dark:text-yellow-400"
                          : idx === 1
                            ? "text-slate-500 dark:text-slate-300"
                            : idx === 2
                              ? "text-orange-700 dark:text-orange-400"
                              : "text-[var(--text-muted)]"
                      }`}
                    >
                      #{idx + 1}
                    </div>
                    <ProfileAvatar icon={p.avatarIcon} size="md" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                        {p.title}
                      </span>
                      {idx === 0 && isViewingArchive && (
                        <span className="inline-flex items-center gap-1 rounded bg-[var(--amber-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]">
                          <Trophy className="h-3 w-3" />
                          Period Winner
                        </span>
                      )}
                      {typeof spyBenchmark === "number" &&
                        p.totalReturnPct > spyBenchmark && (
                          <span className="inline-flex rounded bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--positive)] ring-1 ring-inset ring-[var(--border)]">
                            Beat SPY
                          </span>
                        )}
                      {p.isBot ? (
                        <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]">
                          <Bot className="h-3 w-3 text-[var(--amber)]" />
                          Strategy Bot ({p.botTheme})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-[var(--amber-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]">
                          Community
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
                      <span className="font-mono-num">{p.handle}</span>
                      <span className="font-mono-num">
                        {p.isFinalized ? "Finalized" : `Started ${p.lockedAt.slice(0, 10)}`}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {p.positions.map((pos) => (
                        <span
                          key={pos.ticker}
                          className="font-mono-num rounded bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                        >
                          <strong className="text-[var(--text-primary)]">
                            {pos.ticker}
                          </strong>{" "}
                          {Math.round(pos.weightPct)}%
                        </span>
                      ))}
                    </div>

                    {typeof p.weightedTrueFcfMargin === "number" && (
                      <div className="font-mono-num mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
                        <span>
                          True FCF Margin{" "}
                          <strong className="text-[var(--text-secondary)]">
                            {formatPct(p.weightedTrueFcfMargin)}
                          </strong>
                        </span>
                        {typeof p.weightedSbcPct === "number" && (
                          <span>
                            SBC{" "}
                            <strong className="text-[var(--text-secondary)]">
                              {formatPct(p.weightedSbcPct)}
                            </strong>
                          </span>
                        )}
                        {typeof p.weightedImpliedCagr === "number" && (
                          <span>
                            Implied 10Y{" "}
                            <strong className="text-[var(--amber)]">
                              {formatPct(p.weightedImpliedCagr)}
                            </strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[var(--border)] pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {p.isFinalized ? "Period Return" : "Total Return"}
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-mono-num text-2xl font-semibold tracking-[-0.02em] ${
                        p.totalReturnPct > 0
                          ? "text-[var(--positive)]"
                          : p.totalReturnPct < 0
                            ? "text-[var(--negative)]"
                            : "text-[var(--text-primary)]"
                      }`}
                    >
                      {formatPct(p.totalReturnPct, true)}
                    </div>
                    {typeof spyBenchmark === "number" && (
                      <div className="font-mono-num mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {formatPct(p.totalReturnPct - spyBenchmark, true)} vs SPY
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </section>
        <footer className="mt-14 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)]">
          <p>© {new Date().getFullYear()} Amber. Not investment advice.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-[var(--text-primary)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--text-primary)]">
              Terms
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
