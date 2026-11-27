import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSearchIndex, getSectorBenchmark } from "@/data/repository";
import { TopNav } from "@/components/TopNav";
import { SiteFooter } from "@/components/SiteFooter";
import { SectorQuadrantChart } from "@/components/SectorQuadrantChart";
import { sectorSlug } from "@/lib/agentic-data";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";
import { SITE_URL } from "@/lib/site";

export const revalidate = 21600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const entries = await getSearchIndex();
  const slugs = Array.from(new Set(entries.map((e) => sectorSlug(e.sector))));
  return slugs.map((slug) => ({ slug }));
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function resolveSector(slug: string) {
  const entries = await getSearchIndex();
  const sectorName = entries.find((e) => sectorSlug(e.sector) === slug)?.sector ?? null;
  if (!sectorName) return null;
  const sectorEntries = entries
    .filter((e) => e.sector === sectorName)
    .sort((a, b) => b.marketCap - a.marketCap);
  const benchmark = getSectorBenchmark(sectorName, entries);
  const medianDilution = medianOf(sectorEntries.map((e) => e.netDilutionCagr));
  const medianImplied = medianOf(
    sectorEntries.flatMap((e) => (e.impliedCagr !== null ? [e.impliedCagr] : []))
  );
  return { sectorName, sectorEntries, benchmark, medianDilution, medianImplied };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveSector(slug);
  if (!resolved) return { title: "Sector Not Found" };

  const { sectorName, sectorEntries, benchmark } = resolved;
  const title = `${sectorName} Stocks: True FCF, SBC & Reverse DCF Benchmarks`;
  const description = `Compare ${sectorEntries.length} ${sectorName} companies on SEC-verified True Free Cash Flow (median ${formatPct(benchmark?.medianTrueFcfMargin ?? null)}), Stock-Based Compensation (median ${formatPct(benchmark?.medianSbcPctRevenue ?? null)}), and priced-in 10Y growth.`;
  const canonicalUrl = `${SITE_URL}/sectors/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl },
  };
}

export default async function SectorHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolveSector(slug);
  if (!resolved) notFound();

  const { sectorName, sectorEntries, benchmark, medianDilution, medianImplied } = resolved;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="index" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--amber)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Companies
        </Link>

        <section className="mt-3 border-b border-[var(--border)] pb-6">
          <div className="font-mono-num text-xs font-semibold uppercase tracking-[0.06em] text-[var(--amber)]">
            Sector Benchmark Hub · {sectorEntries.length} Companies
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {sectorName}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">
            SEC EDGAR-verified True Free Cash Flow (after Stock-Based Compensation), 4-year share dilution, and Reverse DCF expectations across {sectorEntries.length} {sectorName} issuers.
          </p>

          {benchmark && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
                <div className="text-[11px] text-[var(--text-muted)]">Median True FCF %</div>
                <div className="font-mono-num mt-1 text-lg font-semibold text-[var(--amber)]">
                  {formatPct(benchmark.medianTrueFcfMargin)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
                <div className="text-[11px] text-[var(--text-muted)]">Median Stock Comp %</div>
                <div className="font-mono-num mt-1 text-lg font-semibold text-[var(--sbc)]">
                  {formatPct(benchmark.medianSbcPctRevenue)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
                <div className="text-[11px] text-[var(--text-muted)]">Median 4Y Share Chg</div>
                <div className="font-mono-num mt-1 text-lg font-semibold text-[var(--text-primary)]">
                  {medianDilution !== null ? `${formatPct(medianDilution, true)}/yr` : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
                <div className="text-[11px] text-[var(--text-muted)]">Median Priced-In 10Y</div>
                <div className="font-mono-num mt-1 text-lg font-semibold text-[var(--text-primary)]">
                  {medianImplied !== null ? `${formatPct(medianImplied)}/yr` : "—"}
                </div>
              </div>
            </div>
          )}
        </section>

        <SectorQuadrantChart
          sector={sectorName}
          sectorSlug={slug}
          entries={sectorEntries}
          benchmark={benchmark}
        />

        <section className="mt-7">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            {sectorName} Leaders ({sectorEntries.length})
          </h2>
          <div className="amber-table-wrapper">
            <table className="amber-table">
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">Mkt Cap</th>
                  <th scope="col">True FCF</th>
                  <th scope="col">True FCF %</th>
                  <th scope="col">Stock Comp %</th>
                  <th scope="col">Share Chg (4Y)</th>
                  <th scope="col">Priced-In Growth</th>
                </tr>
              </thead>
              <tbody>
                {sectorEntries.map((c) => (
                  <tr key={c.ticker} className="cv-row">
                    <th scope="row">
                      <Link
                        href={`/t/${c.ticker}`}
                        className="inline-flex items-center gap-2 hover:text-[var(--amber)]"
                      >
                        <span className="font-mono-num w-12 font-semibold text-[var(--amber)]">
                          {c.ticker}
                        </span>
                        <span className="font-medium text-[var(--text-primary)]">
                          {c.name}
                        </span>
                      </Link>
                    </th>
                    <td data-label="Mkt Cap" className="font-mono-num">
                      {formatCurrencyCompact(c.marketCap)}
                    </td>
                    <td
                      data-label="True FCF"
                      className={`font-mono-num font-semibold ${
                        c.trueFcf >= 0 ? "text-[var(--amber)]" : "text-[var(--negative)]"
                      }`}
                    >
                      {formatCurrencyCompact(c.trueFcf)}
                    </td>
                    <td data-label="True FCF %" className="font-mono-num">
                      {formatPct(c.scenarioBasis.equityLensOnly ? null : c.trueFcfMargin)}
                    </td>
                    <td data-label="Stock Comp %" className="font-mono-num text-[var(--sbc)]">
                      {formatPct(c.sbcPctRevenue)}
                    </td>
                    <td
                      data-label="Share Chg (4Y)"
                      className={`font-mono-num ${
                        c.netDilutionCagr > 1.5
                          ? "text-[var(--negative)]"
                          : c.netDilutionCagr < -0.5
                            ? "text-[var(--positive)]"
                            : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {formatPct(c.netDilutionCagr, true)}
                    </td>
                    <td data-label="Priced-In Growth" className="font-mono-num font-medium">
                      {formatPct(c.impliedCagr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <SiteFooter />
      </main>
    </div>
  );
}
