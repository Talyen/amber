import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Amber",
  description:
    "Why Amber exists: deterministic SEC EDGAR fundamentals, True Free Cash Flow minus Stock-Based Compensation, Reverse DCF valuation, and zero-paywall clarity.",
  alternates: {
    canonical: `${SITE_URL}/about`,
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="legal" />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
        <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
          ABOUT
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          About {SITE_NAME}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Amber is an independent fundamental equity research platform built for long-term investors who want direct, unvarnished numbers from official SEC EDGAR filings—without paywalls, ad clutter, or black-box estimates.
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--text-secondary)]">
          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Why True Free Cash Flow Matters
            </h2>
            <p className="mt-2">
              Headline Free Cash Flow often overstates owner earnings at modern public companies by treating Stock-Based Compensation (SBC) as a non-cash add-back. Amber isolates SBC directly from reported cash flow statements to surface True Free Cash Flow (Operating Cash Flow minus Capital Expenditures minus SBC) alongside 4-year net diluted share count changes.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Deterministic SEC EDGAR Pipelines
            </h2>
            <p className="mt-2">
              Every night, Amber ingests official SEC EDGAR XBRL company facts, Form 4 open-market insider purchases, Form 8-K material events, DEF 14A proxy disclosures, and structured 10-K/10-Q Risk Factor and MD&amp;A prose diffs across 700+ Nasdaq and NYSE companies. Banks and insurers automatically switch to Price / Tangible Book Value (P/TBV) and ROTCE, while REITs switch to Price / FFO so valuation guardrails stay sector-accurate.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Built for Both Humans and AI Agents
            </h2>
            <p className="mt-2">
              Every visual on Amber—from Revenue Sankeys to Reverse DCF sensitivity grids and Sector 2×2 quadrants—supports 1-click PNG export and live embeds with automatic SEC filing attribution. For researchers and AI workflows, Amber also publishes a free read-only REST API and Streamable HTTP MCP server documented at{" "}
              <Link href="/docs" className="text-[var(--amber)] hover:underline">
                {SITE_URL}/docs
              </Link>
              .
            </p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-4 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)]">
          <Link href="/" className="text-[var(--amber)] hover:underline">
            Back to Amber
          </Link>
          <Link href="/docs" className="hover:text-[var(--text-primary)]">
            API &amp; MCP Docs
          </Link>
          <Link href="/contact" className="hover:text-[var(--text-primary)]">
            Contact
          </Link>
        </div>
      </main>
    </div>
  );
}
