"use client";

import { useState } from "react";
import { Download, FileText, ArrowRight } from "lucide-react";
import type { CompanySnapshot, FilingDiffItem } from "@/lib/finance";
import { exportFilingDiffCard } from "@/lib/export-card";
import { FilingAlertModal } from "@/components/FilingAlertModal";

interface FilingDiffRadarProps {
  company: CompanySnapshot;
}

const CATEGORIES: Array<"All" | FilingDiffItem["category"]> = [
  "All",
  "Risk Factors",
  "Customer Concentration",
  "Executive Comp",
  "Capital Allocation",
];

function materialityStyle(level: FilingDiffItem["materiality"]): string {
  switch (level) {
    case "High":
      return "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]";
    case "Medium":
      return "bg-[var(--surface-subtle)] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-strong)]";
    case "Watch":
      return "bg-[var(--surface-subtle)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]";
  }
}

export function FilingDiffRadar({ company }: FilingDiffRadarProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    "All" | FilingDiffItem["category"]
  >("All");
  const [selectedForm, setSelectedForm] = useState<"All" | "periodic" | "8-K" | "DEF 14A">("All");

  const has8k = company.filingDiffs.some((d) => d.filingType === "8-K");
  const hasProxy = company.filingDiffs.some((d) => d.filingType === "DEF 14A");
  const hasPeriodic = company.filingDiffs.some(
    (d) => d.filingType !== "8-K" && d.filingType !== "DEF 14A"
  );
  const showFormFilter = [hasPeriodic, has8k, hasProxy].filter(Boolean).length >= 2;

  const visibleDiffs = company.filingDiffs.filter((d) => {
    if (selectedCategory !== "All" && d.category !== selectedCategory) return false;
    if (selectedForm === "8-K") return d.filingType === "8-K";
    if (selectedForm === "DEF 14A") return d.filingType === "DEF 14A";
    if (selectedForm === "periodic") return d.filingType !== "8-K" && d.filingType !== "DEF 14A";
    return true;
  });

  // Deterministic 3-bullet executive summary (High materiality prioritized)
  const topTakeaways = [...company.filingDiffs]
    .sort((a, b) => {
      const rank = { High: 0, Medium: 1, Watch: 2 };
      return rank[a.materiality] - rank[b.materiality];
    })
    .slice(0, 3);
  const takeawaysMatchLatest = topTakeaways.every(
    (diff) => diff.accessionNumber === company.lastFiling.accessionNumber
  );

  return (
    <div className="space-y-5">
      {topTakeaways.length > 0 && (
        <section className="rounded-xl border border-[var(--amber-border)] bg-[var(--amber-soft)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--amber)]">
              Key Filing Takeaways{takeawaysMatchLatest && ` (${company.lastFiling.type})`}
            </h2>
            {takeawaysMatchLatest && (
              <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                Filed {company.lastFiling.date}
              </span>
            )}
          </div>
          <ul className="mt-2.5 space-y-1.5 text-xs text-[var(--text-primary)]">
            {topTakeaways.map((d) => (
              <li key={d.id} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--amber)]" />
                <span>
                  <strong className="font-semibold">{d.category}:</strong>{" "}
                  {d.headline}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filter & Push Alert Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {showFormFilter && (
            <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--bg)] p-0.5 text-[11px]">
              {(
                [
                  { id: "All", label: "All Forms", show: true },
                  { id: "periodic", label: "10-K / 10-Q", show: hasPeriodic },
                  { id: "8-K", label: "8-K", show: has8k },
                  { id: "DEF 14A", label: "DEF 14A", show: hasProxy },
                ] as const
              )
                .filter((opt) => opt.show)
                .map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedForm(opt.id)}
                    className={`rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
                      selectedForm === opt.id
                        ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            const count =
              cat === "All"
                ? company.filingDiffs.length
                : company.filingDiffs.filter((d) => d.category === cat).length;

            if (cat !== "All" && count === 0) return null;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {cat}
                <span className="font-mono-num ml-1.5 opacity-70">{count}</span>
              </button>
            );
          })}
          </div>
        </div>

        <FilingAlertModal ticker={company.ticker} companyName={company.name} />
      </div>

      {/* Diff Cards */}
      {visibleDiffs.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <div className="text-sm font-medium text-[var(--text-primary)]">
            No filing diffs in this category yet for {company.ticker}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Material SEC 10-K and 10-Q disclosure changes will appear here as new filings are processed.
          </p>
        </div>
      ) : (
      <div className="space-y-4">
        {visibleDiffs.map((diff) => {
          const priorWords = new Set(
            diff.priorExcerpt
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, " ")
              .split(/\s+/)
              .filter((w) => w.length >= 4)
          );
          const edgarUrl =
            /^\d{10}-\d{2}-\d{6}$/.test(diff.accessionNumber) && company.cik
              ? `https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${diff.accessionNumber.replace(/-/g, "")}/`
              : null;

          return (
          <article
            key={diff.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${materialityStyle(diff.materiality)}`}
                >
                  {diff.materiality} Signal
                </span>
                <span className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  {diff.category}
                </span>
                <span className="font-mono-num inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                  <FileText className="h-3 w-3" />
                  {diff.filingType} ({diff.filingDate})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                  {diff.section}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    exportFilingDiffCard({
                      ticker: company.ticker,
                      companyName: company.name,
                      filingType: diff.filingType,
                      filingDate: diff.filingDate,
                      category: diff.category,
                      section: diff.section,
                      materiality: diff.materiality,
                      headline: diff.headline,
                      priorExcerpt: diff.priorExcerpt,
                      currentExcerpt: diff.currentExcerpt,
                      signalNote: diff.signalNote,
                      accessionNumber: diff.accessionNumber,
                    })
                  }
                  className="inline-flex h-6 items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface-subtle)] px-2 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
                >
                  <Download className="h-3 w-3" />
                  PNG
                </button>
              </div>
            </div>

            <h3 className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              {diff.headline}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              {diff.summary}
            </p>

            {/* Prior vs Latest Filing Comparison */}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  Prior Filing Language
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                  &ldquo;{diff.priorExcerpt}&rdquo;
                </p>
              </div>

              <div className="rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] p-3.5">
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--amber)]">
                  <ArrowRight className="h-3 w-3" />
                  Latest Filing Language
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-primary)]">
                  &ldquo;
                  {diff.currentExcerpt.split(/(\s+)/).map((tok, i) => {
                    const bare = tok.toLowerCase().replace(/[^a-z0-9]/g, "");
                    const isNovel =
                      bare.length >= 5 && priorWords.size >= 5 && !priorWords.has(bare);
                    return isNovel ? (
                      <mark
                        key={i}
                        className="rounded bg-[var(--amber)]/20 px-0.5 text-[var(--text-primary)]"
                      >
                        {tok}
                      </mark>
                    ) : (
                      <span key={i}>{tok}</span>
                    );
                  })}
                  &rdquo;
                </p>
              </div>
            </div>

            {/* Analyst Signal Takeaway */}
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-xs">
              <p className="text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">
                  Amber Take:{" "}
                </span>
                {diff.signalNote}
              </p>
              {edgarUrl ? (
                <a
                  href={edgarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono-num text-[10px] text-[var(--amber)] hover:underline"
                >
                  EDGAR {diff.accessionNumber} ↗
                </a>
              ) : (
                <span className="font-mono-num text-[10px] text-[var(--text-muted)]">
                  EDGAR {diff.accessionNumber}
                </span>
              )}
            </div>
          </article>
          );
        })}
      </div>
      )}
    </div>
  );
}
