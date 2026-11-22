"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, ShieldCheck, Trophy, ArrowRight } from "lucide-react";
import type { ArenaPortfolioView } from "@/data/repository";
import { TopNav } from "@/components/TopNav";
import { formatPct } from "@/lib/finance";

interface ArenaLeaderboardProps {
  portfolios: ArenaPortfolioView[];
}

type Timeframe = "all" | "ytd" | "month";
type TypeFilter = "all" | "community" | "bots";

export function ArenaLeaderboard({ portfolios }: ArenaLeaderboardProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const filtered = useMemo(() => {
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    ).toISOString();

    return portfolios
      .filter((p) => {
        if (typeFilter === "community" && p.isBot) return false;
        if (typeFilter === "bots" && !p.isBot) return false;
        if (timeframe === "ytd" && p.lockedAt < yearStart) return false;
        if (timeframe === "month" && p.lockedAt < monthStart) return false;
        return true;
      })
      .sort((a, b) => b.totalReturnPct - a.totalReturnPct);
  }, [portfolios, timeframe, typeFilter]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="arena" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <section className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="font-mono-num inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--amber)]">
              <Trophy className="h-3.5 w-3.5" />
              VERIFIED PORTFOLIO ARENA
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
              Tamper-Proof Equity Leaderboards
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
              Every portfolio is locked at official server-verified closing prices with an immutable timestamp—no backdating, no deleted calls. Compete against thematic strategy bots and other investors.
            </p>
          </div>

          <Link
            href="/portfolio"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--amber)] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Build &amp; Lock Your Portfolio
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>

        {/* Controls */}
        <section className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
            {(
              [
                { id: "all", label: "All-Time" },
                { id: "ytd", label: "YTD" },
                { id: "month", label: "This Month" },
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

          <div className="flex items-center gap-1.5">
            {(
              [
                { id: "all", label: "All Entries" },
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

        {/* Ranked Leaderboard Cards */}
        <section className="mt-6 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                No portfolios locked in this timeframe yet
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Be the first to lock a verified 3–10 stock portfolio from the Portfolio builder.
              </p>
              <Link
                href="/portfolio"
                className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--amber)] px-3.5 text-xs font-semibold text-white"
              >
                Go to Portfolio Builder
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            filtered.map((p, idx) => (
              <Link
                key={p.id}
                href={`/arena/${p.id}`}
                className="group flex flex-col justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--amber-border)] sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div
                    className={`font-mono-num flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                      idx === 0
                        ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                        : "bg-[var(--surface-subtle)] text-[var(--text-secondary)]"
                    }`}
                  >
                    #{idx + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                        {p.title}
                      </span>
                      {p.isBot ? (
                        <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]">
                          <Bot className="h-3 w-3 text-[var(--amber)]" />
                          Strategy Bot · {p.botTheme}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-[var(--amber-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]">
                          <ShieldCheck className="h-3 w-3" />
                          Verified
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span className="font-mono-num">@{p.handle}</span>
                      <span>·</span>
                      <span className="font-mono-num">
                        Locked {p.lockedAt.slice(0, 10)}
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
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[var(--border)] pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Total Return
                  </div>
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
                </div>
              </Link>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
