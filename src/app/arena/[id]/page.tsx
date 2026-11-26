import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, PieChart, RefreshCw } from "lucide-react";
import {
  getArenaPerformance,
  getArenaPortfolioById,
} from "@/data/arena-repository";
import { TopNav } from "@/components/TopNav";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import {
  ArenaBenchmarkCard,
  ArenaScorecardExport,
} from "@/components/ArenaScorecardActions";
import { formatPct } from "@/lib/finance";
import { arenaPortfolioAnalysisHref } from "@/lib/portfolio-link";

export const revalidate = 21600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const portfolio = await getArenaPortfolioById(id);
  if (!portfolio) return { title: "Portfolio Not Found" };

  return {
    title: `${portfolio.title} (${portfolio.handle}) | Arena`,
    description: `Amber Arena portfolio started ${portfolio.lockedAt.slice(0, 10)}: ${formatPct(portfolio.totalReturnPct, true)} return.`,
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

  const { spyReturn, curvePoints } = await getArenaPerformance(portfolio);

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
          <div className="flex items-start gap-4">
            <ProfileAvatar icon={portfolio.avatarIcon} size="lg" className="mt-0.5" />
            <div>
            <div className="flex flex-wrap items-center gap-2">
              {portfolio.isBot ? (
                <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]">
                  <Bot className="h-3.5 w-3.5 text-[var(--amber)]" />
                  Strategy Bot ({portfolio.botTheme})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-[var(--amber-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]">
                  Community Portfolio
                </span>
              )}
              <span className="font-mono-num inline-flex flex-wrap items-center gap-x-3 text-xs text-[var(--text-muted)]">
                <Link
                  href={`/u/${encodeURIComponent(portfolio.handle)}`}
                  className="hover:text-[var(--amber)] hover:underline"
                >
                  {portfolio.handle}
                </Link>
                <span>Started {portfolio.lockedAt.slice(0, 10)}</span>
                {portfolio.rebalances.length > 0 && (
                  <span>Rebalanced {portfolio.lastRebalancedAt.slice(0, 10)}</span>
                )}
              </span>
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
              {portfolio.title}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">
              {portfolio.thesis}
            </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end sm:text-right">
            <div>
              <div className="text-xs text-[var(--text-muted)]">
                Total Return
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
            <div className="flex flex-wrap items-center gap-2">
              <ArenaScorecardExport
                portfolio={portfolio}
                spyReturnPct={spyReturn}
              />
              {!portfolio.positions.every((p) => p.ticker === "SPY") && (
                <Link
                  href={arenaPortfolioAnalysisHref(portfolio.positions)}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3 text-xs font-semibold text-[var(--amber)] transition-colors hover:bg-[var(--cta-bg)] hover:text-[var(--cta-fg)]"
                >
                  <PieChart className="h-3.5 w-3.5" aria-hidden="true" />
                  Analyze in Portfolio
                </Link>
              )}
            </div>
          </div>
        </section>

        {typeof spyReturn === "number" && (
          <ArenaBenchmarkCard
            portfolioReturnPct={portfolio.totalReturnPct}
            spyReturnPct={spyReturn}
            periodLabel={portfolio.periodKey}
            curvePoints={curvePoints}
          />
        )}

        {typeof portfolio.weightedTrueFcfMargin === "number" && (
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-[11px] text-[var(--text-muted)]">
                Weighted True FCF Margin
              </div>
              <div className="font-mono-num mt-1 text-xl font-semibold text-[var(--text-primary)]">
                {formatPct(portfolio.weightedTrueFcfMargin)}
              </div>
            </div>
            {typeof portfolio.weightedSbcPct === "number" && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-[11px] text-[var(--text-muted)]">
                  Weighted SBC Burden
                </div>
                <div className="font-mono-num mt-1 text-xl font-semibold text-[var(--sbc)]">
                  {formatPct(portfolio.weightedSbcPct)}
                </div>
              </div>
            )}
            {typeof portfolio.weightedDilutionCagr === "number" && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-[11px] text-[var(--text-muted)]">
                  Weighted Dilution (4Y)
                </div>
                <div
                  className={`font-mono-num mt-1 text-xl font-semibold ${
                    portfolio.weightedDilutionCagr > 1.5
                      ? "text-[var(--negative)]"
                      : portfolio.weightedDilutionCagr < -0.5
                        ? "text-[var(--positive)]"
                        : "text-[var(--text-primary)]"
                  }`}
                >
                  {formatPct(portfolio.weightedDilutionCagr, true)}
                </div>
              </div>
            )}
            {typeof portfolio.weightedImpliedCagr === "number" && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-[11px] text-[var(--text-muted)]">
                  Weighted Implied 10Y
                </div>
                <div className="font-mono-num mt-1 text-xl font-semibold text-[var(--amber)]">
                  {formatPct(portfolio.weightedImpliedCagr)}
                </div>
              </div>
            )}
          </section>
        )}

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
                  <th scope="col">Entry Price</th>
                  <th scope="col">Current Price</th>
                  <th scope="col">Position Return</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map((pos) => (
                  <tr key={pos.ticker}>
                    <th scope="row">
                      {pos.ticker === "SPY" ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-mono-num w-12 font-semibold text-[var(--amber)]">
                            {pos.ticker}
                          </span>
                          <span className="font-medium text-[var(--text-primary)]">
                            {pos.companyName}
                          </span>
                        </span>
                      ) : (
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
                      )}
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

        {portfolio.rebalances.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
              <RefreshCw className="h-3.5 w-3.5 text-[var(--amber)]" />
              Rebalance History
            </h2>
            <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {portfolio.rebalances.map((reb) => {
                const cumRet = reb.navAtRebalance - 100;
                return (
                  <div
                    key={reb.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num text-[var(--text-muted)]">
                        {reb.createdAt.slice(0, 10)}
                      </span>
                      <span className="text-[var(--text-primary)]">
                        {reb.summary}
                      </span>
                    </div>
                    <span
                      className={`font-mono-num font-semibold ${
                        cumRet > 0
                          ? "text-[var(--positive)]"
                          : cumRet < 0
                            ? "text-[var(--negative)]"
                            : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {formatPct(cumRet, true)} at rebalance
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
