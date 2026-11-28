import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { ArrowLeft, ArrowRight, Bot, Sparkles, Trophy } from "lucide-react";
import { getDb } from "@/db";
import { user, userValuationPresets } from "@/db/schema";
import {
  getArenaPortfoliosByHandle,
  getArenaEntryBenchmarks,
} from "@/data/arena-repository";
import { getSearchIndex } from "@/data/repository";
import { TopNav } from "@/components/TopNav";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { formatPct, isScenarioLens } from "@/lib/finance";
import {
  computePresetExpectedReturn,
  type SavedScenarioLens,
} from "@/lib/valuation-presets";

// Published notes must reflect current visibility on every request.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `${handle} | Investor Profile`,
    description: `Active portfolio and Arena track record for ${handle} on Amber.`,
  };
}

export default async function InvestorProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const entries = await getArenaPortfoliosByHandle(handle);

  // Fetch user profile + any published Saved Theses for this investor handle
  let profileOwner: { id: string; handle: string; avatarIcon: string } | null = null;
  let publishedTheses: Array<{
    ticker: string;
    name: string;
    lens: SavedScenarioLens;
    revGrowth: number;
    targetMargin: number;
    exitMultiple: number;
    thesisNote: string | null;
    irrPct: number | null;
    fairValueToday: number | null;
  }> = [];
  const db = getDb();
  if (db) {
    try {
      const [owner] = await db
        .select({
          id: user.id,
          handle: user.handle,
          avatarIcon: user.avatarIcon,
        })
        .from(user)
        .where(sql`lower(${user.handle}) = lower(${handle})`)
        .limit(1);
      if (owner && owner.handle) {
        profileOwner = {
          id: owner.id,
          handle: owner.handle,
          avatarIcon: owner.avatarIcon,
        };
        const rows = await db
          .select()
          .from(userValuationPresets)
          .where(
            and(
              eq(userValuationPresets.userId, owner.id),
              eq(userValuationPresets.isPublic, true)
            )
          )
          .orderBy(desc(userValuationPresets.updatedAt))
          .limit(12);
        if (rows.length > 0) {
          const index = await getSearchIndex();
          const byTicker = new Map(index.map((e) => [e.ticker, e]));
          publishedTheses = rows.map((row) => {
            const entry = byTicker.get(row.ticker);
            const lens: SavedScenarioLens =
              isScenarioLens(row.lens) ? row.lens : "fcf";
            const proj = entry
              ? computePresetExpectedReturn(
                  {
                    ticker: row.ticker,
                    lens,
                    revGrowth: row.revGrowth,
                    targetMargin: row.targetMargin,
                    exitMultiple: row.exitMultiple,
                    thesisNote: row.thesisNote,
                    updatedAt: row.updatedAt.toISOString(),
                  },
                  entry
                )
              : null;
            return {
              ticker: row.ticker,
              name: entry?.name ?? row.ticker,
              lens,
              revGrowth: row.revGrowth,
              targetMargin: row.targetMargin,
              exitMultiple: row.exitMultiple,
              thesisNote: row.thesisNote ?? null,
              irrPct: proj?.irrPct ?? null,
              fairValueToday: proj?.fairValueToday ?? null,
            };
          });
        }
      }
    } catch {
      // Public theses are optional
    }
  }

  if (entries.length === 0 && publishedTheses.length === 0) notFound();
  const benchmarks = entries.length > 0 ? await getArenaEntryBenchmarks(entries) : {};

  const liveEntries = entries
    .filter((e) => !e.isFinalized)
    .sort((a, b) => a.lockedAt.localeCompare(b.lockedAt));
  const archivedEntries = entries
    .filter((e) => e.isFinalized)
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey));

  const primary = liveEntries[0] ?? entries[0] ?? null;
  const displayHandle = primary?.handle ?? profileOwner?.handle ?? handle;
  const displayAvatar = primary?.avatarIcon ?? profileOwner?.avatarIcon ?? "compass";
  const spyForPrimary = primary ? benchmarks[primary.id] : undefined;
  const beatCount = entries.filter(
    (e) =>
      typeof benchmarks[e.id] === "number" &&
      e.totalReturnPct > benchmarks[e.id]
  ).length;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="arena" />

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        <Link
          href={primary ? "/arena" : "/"}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--amber)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {primary ? "Back to Arena" : "Back to Explore"}
        </Link>

        {/* Profile Header */}
        <section className="mt-4 flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <ProfileAvatar icon={displayAvatar} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono-num text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
                  {displayHandle}
                </h1>
                {primary?.isBot ? (
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
                {primary
                  ? `${primary.title}, ${primary.positions.length} active holdings${
                      beatCount > 0 ? `, beat S&P 500 in ${beatCount} period${beatCount > 1 ? "s" : ""}` : ""
                    }`
                  : `${publishedTheses.length} published valuation ${publishedTheses.length === 1 ? "thesis" : "theses"}`}
              </p>
            </div>
          </div>

          {primary && (
            <Link
              href={`/arena/${primary.id}`}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--cta-bg)] px-4 text-xs font-semibold text-[var(--cta-fg)] ring-1 ring-inset ring-white/15 transition-colors hover:bg-[var(--cta-bg-hover)]"
            >
              View Active Portfolio
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </section>

        {/* Active Portfolio Summary */}
        {primary && (
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
              {primary.positions.map((pos) =>
                pos.ticker === "SPY" ? (
                  <span
                    key={pos.ticker}
                    className="font-mono-num rounded bg-[var(--surface-subtle)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                  >
                    <strong className="text-[var(--text-primary)]">
                      {pos.ticker}
                    </strong>{" "}
                    {Math.round(pos.weightPct)}%
                  </span>
                ) : (
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
                )
              )}
            </div>
          </section>
        )}

        {/* Published Valuation Theses */}
        {publishedTheses.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
              <Sparkles className="h-4 w-4 text-[var(--amber)]" />
              Published Valuation Theses
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {publishedTheses.map((item) => (
                <Link
                  key={item.ticker}
                  href={`/t/${item.ticker}?tab=dcf&model=scenario&lens=${item.lens}&rev=${item.revGrowth}&m=${item.targetMargin}&exit=${item.exitMultiple}`}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--amber-border)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono-num text-sm font-semibold text-[var(--amber)]">
                        {item.ticker}
                      </span>
                      <span className="ml-2 text-xs text-[var(--text-secondary)]">
                        {item.name}
                      </span>
                    </div>
                    {item.irrPct !== null && (
                      <span
                        className={`font-mono-num text-xs font-semibold ${
                          item.irrPct >= 12
                            ? "text-[var(--positive)]"
                            : item.irrPct >= 8
                              ? "text-[var(--amber)]"
                              : "text-[var(--negative)]"
                        }`}
                      >
                        {formatPct(item.irrPct, true)}/yr
                      </span>
                    )}
                  </div>
                  <div className="font-mono-num mt-1.5 text-[11px] text-[var(--text-muted)]">
                    {item.lens.toUpperCase()} · {item.revGrowth}% rev · {item.targetMargin}% margin · {item.exitMultiple}x exit
                    {item.fairValueToday !== null ? ` · FV $${item.fairValueToday.toFixed(0)}` : ""}
                  </div>
                  {item.thesisNote && (
                    <p className="mt-2 text-xs text-[var(--text-secondary)] line-clamp-2">
                      {item.thesisNote}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Track Record / Past Periods */}
        {archivedEntries.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
              <Trophy className="h-4 w-4 text-[var(--amber)]" />
              Past Period Finishes
            </h2>
            <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {archivedEntries.map((item) => {
                const spy = benchmarks[item.id];
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
