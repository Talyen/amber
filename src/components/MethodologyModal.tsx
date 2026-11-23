"use client";

import { useRef } from "react";
import { useDialogLightDismiss } from "@/lib/dialog-light-dismiss";
import { BookOpen, X } from "lucide-react";

export function MethodologyModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lightDismiss = useDialogLightDismiss(dialogRef);

  function openModal() {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }

  function closeModal() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--amber)] cursor-pointer"
      >
        <BookOpen className="h-3.5 w-3.5" />
        Methodology &amp; XBRL Sources
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="methodology-title"
        {...lightDismiss}
        className="amber-dialog m-auto w-[min(580px,calc(100vw-2rem))] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-6 text-[var(--text-primary)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div>
            <div className="font-mono-num text-[11px] font-semibold text-[var(--amber)]">
              AMBER METHODOLOGY
            </div>
            <h2
              id="methodology-title"
              className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]"
            >
              Formulas &amp; SEC EDGAR XBRL Sources
            </h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close methodology dialog"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 max-h-[65vh] space-y-4 overflow-y-auto pr-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">
              1. True Free Cash Flow (Owner Earnings)
            </h3>
            <p className="mt-1">
              <code className="font-mono-num rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[var(--amber)]">
                True FCF = Operating Cash Flow − CapEx − Stock-Based Compensation
              </code>
            </p>
            <p className="mt-1">
              Standard screeners treat SBC as a non-cash add-back. Because employee equity grants dilute owners (or require cash buybacks to offset), Amber deducts SBC directly to approximate economic cash flow.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">
              2. Trailing Twelve Months (TTM)
            </h3>
            <p className="mt-1">
              When a company files a 10-Q more recent than its latest 10-K, Amber computes{" "}
              <code className="font-mono-num rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[var(--text-primary)]">
                TTM = Latest FY (10-K) + Current YTD (10-Q) − Prior-Year YTD (10-Q)
              </code>
              .
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">
              3. Reverse DCF Implied 10Y Revenue CAGR
            </h3>
            <p className="mt-1">
              Rather than predicting a single fair value, Amber solves deterministically via binary search for the 10-year annual revenue growth rate whose discounted True FCF stream plus Terminal Value equals current Enterprise Value (<code className="font-mono-num">Market Cap + Debt − Cash</code>).
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">
              4. Official US-GAAP XBRL Tags
            </h3>
            <ul className="font-mono-num mt-1.5 space-y-1 break-all text-[11px] text-[var(--text-muted)]">
              <li>• OCF: NetCashProvidedByUsedInOperatingActivities</li>
              <li>• CapEx: PaymentsToAcquirePropertyPlantAndEquipment</li>
              <li>• SBC: ShareBasedCompensation / AllocatedShareBasedCompensationExpense</li>
              <li>• Shares: WeightedAverageNumberOfDilutedSharesOutstanding</li>
            </ul>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-[11px] text-[var(--text-muted)]">
            Banks, insurers, and REITs are excluded from FCF margin leaderboards because GAAP Operating Cash Flow for financial institutions mixes customer deposits and loan activity with operating earnings.
          </div>
        </div>
      </dialog>
    </>
  );
}
