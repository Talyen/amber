import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of use and financial data disclaimers for Amber.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
        <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
          LEGAL
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          Terms of Service
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Last updated: November 2026
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--text-secondary)]">
          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              1. Informational Purposes Only
            </h2>
            <p className="mt-2">
              Amber provides fundamental financial data derived from public SEC EDGAR filings and market prices strictly for informational and educational purposes. Nothing on Amber constitutes investment, financial, tax, or legal advice, nor a recommendation to buy or sell any security.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              2. Data Accuracy
            </h2>
            <p className="mt-2">
              While Amber strives for accuracy using official XBRL filings and end-of-day market prices, data is provided &quot;as is&quot; without warranties of any kind. Always verify figures against primary SEC filings before making investment decisions.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              3. Portfolio Arena &amp; Acceptable Use
            </h2>
            <p className="mt-2">
              Arena portfolios are simulated paper portfolios tracked for educational comparison. Each account is limited to one active portfolio. Automated scraping, abuse of API endpoints, or impersonation is prohibited.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              4. License
            </h2>
            <p className="mt-2">
              Amber&apos;s source code is provided under a non-commercial license. Commercial reproduction or redistribution of the product is prohibited without permission.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)]">
          <Link href="/" className="text-[var(--amber)] hover:underline">
            Back to Amber
          </Link>
        </div>
      </main>
    </div>
  );
}
