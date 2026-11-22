import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, ShieldCheck } from "lucide-react";
import { getArenaPortfolioById } from "@/data/repository";
import { TopNav } from "@/components/TopNav";
import { formatPct } from "@/lib/finance";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const portfolio = await getArenaPortfolioById(id);
  if (!portfolio) return { title: "Portfolio Not Found" };

  return {
    title: `${portfolio.title} (@${portfolio.handle}) — Arena`,
    description: `Verified Amber Arena portfolio locked ${portfolio.lockedAt.slice(0, 10)}: ${formatPct(portfolio.totalReturnPct, true)} return.`,
  };
}

export default async function ArenaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const portfolio = await getArenaPortfolioById(id);
  if (!portfolio) notFound();

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="arena" />

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        <Link
          href="/arena"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--amber)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Arena Leaderboard
        </Link>

        <section className="mt-4 flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {portfolio.isBot ? (
                <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]">
                  <Bot className="h-3.5 w-3.5 text-[var(--amber)]" />
                  Strategy Bot · {portfolio.botTheme}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-[var(--amber-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Tamper-Proof Receipt
                </span>
              )}
              <span className="font-mono-num text-xs text-[var(--text-muted)]">
                @{portfolio.handle} · Locked {portfolio.lockedAt.slice(0, 10)}
              </span>
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
              {portfolio.title}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">
              {portfolio.thesis}
            </p>
          </div>

          <div className="sm:text-right">
            <div className="text-xs text-[var(--text-muted)]">
              Verified Return Since Lock
            </div>
            <div
              className={`font-mono-num mt-0.5 text-4xl font-semibold tracking-[-0.03em] ${
                portfolio.totalReturnPct > 0
                  ? "text-[var(--positive)]"
                  : portfolio.totalReturnPct < 0
                    ? "text-[var(--negative)]"
                    : "text-[var(--text-primary)]"
              }`}
            >
              {formatPct(portfolio.totalReturnPct, true)}
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div
            tabIndex={0}
            role="region"
            aria-label="Locked portfolio positions"
            className="amber-table-wrapper"
          >
            <table className="amber-table">
              <thead>
                <tr>
                  <th scope="col">Holding</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Locked Entry</th>
                  <th scope="col">Current Price</th>
                  <th scope="col">Position Return</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map((pos) => (
                  <tr key={pos.ticker}>
                    <th scope="row">
                      <Link
                        href={`/t/${pos.ticker}`}
                        className="inline-flex items-center gap-2 hover:text-[var(--amber)]"
                      >
                        <span className="font-mono-num w-12 font-semibold text-[var(--amber)]">
                          {pos.ticker}
                        </span>
                        <span className="font-medium text-[var(--text-primary)]">
                          {pos.companyName}
                        </span>
                      </Link>
                    </th>
                    <td data-label="Weight" className="font-mono-num">
                      {pos.weightPct.toFixed(1)}%
                    </td>
                    <td data-label="Locked Entry" className="font-mono-num">
                      ${pos.entryPrice.toFixed(2)}
                    </td>
                    <td data-label="Current Price" className="font-mono-num">
                      ${pos.currentPrice.toFixed(2)}
                    </td>
                    <td
                      data-label="Position Return"
                      className={`font-mono-num font-semibold ${
                        pos.returnPct > 0
                          ? "text-[var(--positive)]"
                          : pos.returnPct < 0
                            ? "text-[var(--negative)]"
                            : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {formatPct(pos.returnPct, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
