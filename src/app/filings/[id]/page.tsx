import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, FileDiff } from "lucide-react";
import { getFilingDiffById } from "@/data/repository";
import { TopNav } from "@/components/TopNav";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const diff = await getFilingDiffById(id);
  if (!diff) return { title: "Filing Diff Not Found" };

  const title = `${diff.ticker} ${diff.filingType} (${diff.filingDate}): ${diff.headline}`;
  const description = `${diff.companyName} (${diff.ticker}) ${diff.section} change: ${diff.summary}`;
  const canonicalUrl = `${SITE_URL}/filings/${encodeURIComponent(diff.id)}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl },
  };
}

export default async function FilingDiffPermalinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const diff = await getFilingDiffById(id);
  if (!diff) notFound();

  const materialityBadge =
    diff.materiality === "High"
      ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-[var(--amber-border)]"
      : "bg-[var(--surface-subtle)] text-[var(--text-secondary)] ring-[var(--border)]";

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeTicker={diff.ticker} />

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-7 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <Link
            href={`/t/${diff.ticker}/filings`}
            className="inline-flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--amber)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All {diff.ticker} Filings &amp; Insiders
          </Link>
          <Link
            href="/feed"
            className="text-[var(--text-muted)] hover:text-[var(--amber)]"
          >
            Market Feed →
          </Link>
        </div>

        <article className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-mono-num font-semibold text-[var(--amber)]">
              <FileDiff className="h-3.5 w-3.5" />
              {diff.filingType}
            </span>
            <span className="text-[var(--border-strong)]">·</span>
            <Link
              href={`/t/${diff.ticker}`}
              className="font-mono-num font-bold text-[var(--amber)] hover:underline"
            >
              {diff.ticker}
            </Link>
            <span className="text-[var(--text-secondary)]">{diff.companyName}</span>
            <span className="text-[var(--border-strong)]">·</span>
            <span className="font-mono-num text-[var(--text-muted)]">{diff.filingDate}</span>
            <span
              className={`ml-auto rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${materialityBadge}`}
            >
              {diff.materiality} Signal · {diff.category}
            </span>
          </div>

          <h1 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-2xl">
            {diff.headline}
          </h1>

          <p className="mt-2.5 text-sm leading-relaxed text-[var(--text-secondary)]">
            {diff.summary}
          </p>

          {(diff.priorExcerpt || diff.currentExcerpt) && (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {diff.priorExcerpt && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
                  <div className="font-mono-num text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Prior Filing Language ({diff.section})
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {diff.priorExcerpt}
                  </p>
                </div>
              )}
              {diff.currentExcerpt && (
                <div className="rounded-lg border border-[var(--amber-border)] bg-[var(--bg)] p-4">
                  <div className="font-mono-num text-[11px] font-semibold uppercase tracking-wide text-[var(--amber)]">
                    Current Filing Language ({diff.filingDate})
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--text-primary)]">
                    {diff.currentExcerpt}
                  </p>
                </div>
              )}
            </div>
          )}

          {diff.signalNote && (
            <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
              <div className="font-mono-num text-[11px] font-semibold uppercase tracking-wide text-[var(--amber)]">
                Why It Matters
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-primary)]">
                {diff.signalNote}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-xs">
            <span className="font-mono-num text-[var(--text-muted)]">
              SEC Accession {diff.accessionNumber} · {diff.section}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/t/${diff.ticker}/valuation`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 font-medium text-[var(--text-secondary)] hover:border-[var(--amber-border)] hover:text-[var(--amber)]"
              >
                Reverse DCF Model
              </Link>
              <Link
                href={`/t/${diff.ticker}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--cta-bg)] px-3 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
              >
                Open {diff.ticker} Workspace
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </article>

        <SiteFooter />
      </main>
    </div>
  );
}
