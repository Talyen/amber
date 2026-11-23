import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Bot, Trophy } from "lucide-react";
import {
  getArenaPortfoliosByHandle,
  getSpyBenchmarks,
} from "@/data/arena-repository";
import { TopNav } from "@/components/TopNav";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { formatPct } from "@/lib/finance";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);
  return {
    title: `@${decoded} | Investor Profile`,
    description: `Active portfolio and Arena track record for @${decoded} on Amber.`,
  };
}

export default async function InvestorProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);
  const [entries, benchmarks] = await Promise.all([
    getArenaPortfoliosByHandle(decoded),
    getSpyBenchmarks(),
  ]);

  if (entries.length === 0) notFound();

  const liveEntries = entries
    .filter((e) => !e.isFinalized)
    .sort((a, b) => a.lockedAt.localeCompare(b.lockedAt));
  const archivedEntries = entries
    .filter((e) => e.isFinalized)
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey));

  const primary = liveEntries[0] ?? entries[0];
  const spyForPrimary = benchmarks[primary.periodKey];
  const beatCount = entries.filter(
    (e) =>
      typeof benchmarks[e.periodKey] === "number" &&
      e.totalReturnPct > benchmarks[e.periodKey]
  ).length;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="arena" />

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        <Link
          href="/arena"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--amber)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Arena
        </Link>

        {/* Profile Header */}
        <section className="mt-4 flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <ProfileAvatar icon={primary.avatarIcon} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono-num text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
                  @{primary.handle}
                </h1>
                {primary.isBot ? (
                  <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]">
                    <Bot className="h-3.5 w-3.5 text-[var(--amber)]" />
                    Strategy Bot ({primary.botTheme})
                  </span>
                ) : (
                  <span className="inline-flex rounded bg-[var(--amber-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]">
                    Community Investor
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {primary.title}, {primary.positions.length} active holdings
                {beatCount > 0 && `, beat S&P 500 in ${beatCount} period${beatCount > 1 ? "s" : ""}`}
              </p>
            </div>
          </div>

          <Link
            href={`/arena/${primary.id}`}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--cta-bg)] px-4 text-xs font-semibold text-[var(--cta-fg)] ring-1 ring-inset ring-white/15 transition-colors hover:bg-[var(--cta-bg-hover)]"
          >
            View Active Portfolio
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>

        {/* Active Portfolio Summary */}
        <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Active Portfolio ({primary.periodKey})
              </div>
              <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                {primary.title}
              </h2>
              <p className="mt-1 max-w-2xl text-xs text-[var(--text-secondary)]">
                {primary.thesis}
              </p>
            </div>
            <div className="text-right">
              <div
                className={`font-mono-num text-3xl font-semibold ${
                  primary.totalReturnPct >= 0
                    ? "text-[var(--positive)]"
                    : "text-[var(--negative)]"
                }`}
              >
                {formatPct(primary.totalReturnPct, true)}
              </div>
              {typeof spyForPrimary === "number" && (
                <div className="font-mono-num text-[11px] text-[var(--text-muted)]">
                  {formatPct(primary.totalReturnPct - spyForPrimary, true)} vs SPY
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {primary.positions.map((pos) => (
              <Link
                key={pos.ticker}
                href={`/t/${pos.ticker}`}
                className="font-mono-num rounded bg-[var(--surface-subtle)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--amber)]"
              >
                <strong className="text-[var(--text-primary)]">
                  {pos.ticker}
                </strong>{" "}
                {Math.round(pos.weightPct)}%
              </Link>
            ))}
          </div>
        </section>

        {/* Track Record / Past Periods */}
        {archivedEntries.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
              <Trophy className="h-4 w-4 text-[var(--amber)]" />
              Past Period Finishes
            </h2>
            <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {archivedEntries.map((item) => {
                const spy = benchmarks[item.periodKey];
                const beat = typeof spy === "number" && item.totalReturnPct > spy;
                return (
                  <Link
                    key={item.id}
                    href={`/arena/${item.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-xs transition-colors hover:bg-[var(--surface-subtle)]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                        {item.periodKey}
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        {item.title}
                      </span>
                      {beat && (
                        <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--positive)] ring-1 ring-inset ring-[var(--border)]">
                          Beat SPY
                        </span>
                      )}
                    </div>
                    <span
                      className={`font-mono-num font-semibold ${
                        item.totalReturnPct >= 0
                          ? "text-[var(--positive)]"
                          : "text-[var(--negative)]"
                      }`}
                    >
                      {formatPct(item.totalReturnPct, true)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
