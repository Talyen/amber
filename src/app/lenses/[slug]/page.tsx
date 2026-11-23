import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getSearchIndex } from "@/data/repository";
import { DISCOVERY_LENSES } from "@/lib/insights";
import { TopNav } from "@/components/TopNav";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

export const revalidate = 86400;

export function generateStaticParams() {
  return DISCOVERY_LENSES.map((lens) => ({ slug: lens.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lens = DISCOVERY_LENSES.find((l) => l.id === slug);
  if (!lens) return { title: "Lens Not Found" };

  return {
    title: `${lens.title} — ${lens.subtitle}`,
    description: `${lens.whyItMatters} Live SEC EDGAR XBRL screen updated nightly on Amber.`,
  };
}

export default async function LensPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lens = DISCOVERY_LENSES.find((l) => l.id === slug);
  if (!lens) notFound();

  const entries = await getSearchIndex();
  const matched = entries.filter(lens.filter).sort(lens.sort);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="index" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--amber)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Signal Index
        </Link>

        <section className="mt-4 border-b border-[var(--border)] pb-6">
          <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
            DISCOVERY LENS ({matched.length} COMPANIES)
          </div>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
            {lens.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
            {lens.whyItMatters}
          </p>

          {/* Cross-links to other Lenses */}
          <div className="mt-5 flex flex-wrap gap-1.5">
            {DISCOVERY_LENSES.map((other) => {
              const active = other.id === lens.id;
              return (
                <Link
                  key={other.id}
                  href={`/lenses/${other.id}`}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                      : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {other.title}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <div
            tabIndex={0}
            role="region"
            aria-label={`${lens.title} companies`}
            className="amber-table-wrapper"
          >
            <table className="amber-table">
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">Mkt Cap</th>
                  <th scope="col">True FCF</th>
                  <th scope="col">True Margin</th>
                  <th scope="col">SBC / Rev</th>
                  <th scope="col">Dilution (4Y)</th>
                  <th scope="col">Implied 10Y</th>
                </tr>
              </thead>
              <tbody>
                {matched.map((c) => (
                  <tr key={c.ticker}>
                    <th scope="row">
                      <Link
                        href={`/t/${c.ticker}`}
                        className="group inline-flex items-center gap-2 hover:text-[var(--amber)]"
                      >
                        <span className="font-mono-num w-12 font-semibold text-[var(--amber)]">
                          {c.ticker}
                        </span>
                        <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--amber)]">
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
                        c.trueFcf >= 0
                          ? "text-[var(--amber)]"
                          : "text-[var(--negative)]"
                      }`}
                    >
                      {formatCurrencyCompact(c.trueFcf)}
                    </td>
                    <td data-label="True Margin" className="font-mono-num">
                      {formatPct(c.trueFcfMargin)}
                    </td>
                    <td
                      data-label="SBC / Rev"
                      className="font-mono-num text-[var(--sbc)]"
                    >
                      {formatPct(c.sbcPctRevenue)}
                    </td>
                    <td
                      data-label="Dilution (4Y)"
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
                    <td
                      data-label="Implied 10Y"
                      className="font-mono-num font-medium"
                    >
                      {formatPct(c.impliedCagr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {matched.length >= 2 && (
            <div className="mt-5 flex justify-end">
              <Link
                href={`/compare?t=${matched
                  .slice(0, 4)
                  .map((m) => m.ticker)
                  .join(",")}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--amber)] hover:underline"
              >
                Compare top {Math.min(4, matched.length)} side-by-side
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
