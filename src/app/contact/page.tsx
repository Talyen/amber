import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Amber",
  description:
    "Reach the Amber team for SEC EDGAR data corrections, feature requests, API/MCP questions, or account support.",
  alternates: {
    canonical: `${SITE_URL}/contact`,
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="legal" />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
        <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
          CONTACT
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          Contact {SITE_NAME}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Have a question about Amber&apos;s SEC EDGAR methodology, spotted a filing tag anomaly for a covered company, or integrating with our public API and MCP server? Reach out using any of the channels below.
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--text-secondary)]">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Direct Email
            </h2>
            <p className="mt-2">
              For general inquiries, data verification, press, or API/MCP feedback:{" "}
              <a
                href="mailto:research@amberstocks.com"
                className="font-mono-num text-[var(--amber)] hover:underline"
              >
                research@amberstocks.com
              </a>
            </p>
            <p className="mt-2">
              Filing alerts and account sign-in links are dispatched from{" "}
              <span className="font-mono-num text-xs text-[var(--text-primary)]">
                alerts@amberstocks.com
              </span>
              . You can manage or cancel alerts at any time from{" "}
              <Link href="/settings" className="text-[var(--amber)] hover:underline">
                Settings
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Data Corrections &amp; Open Issues
            </h2>
            <p className="mt-2">
              Amber&apos;s ingestion pipeline is source-available on GitHub. When an issuer changes an XBRL tag or omits a line item from SEC Company Facts, we record verified filing supplements with the exact SEC accession number and reporting period. You can report a filing discrepancy or feature request at{" "}
              <a
                href="https://github.com/Talyen/amber/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--amber)] hover:underline"
              >
                github.com/Talyen/amber/issues
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-4 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)]">
          <Link href="/" className="text-[var(--amber)] hover:underline">
            Back to Amber
          </Link>
          <Link href="/about" className="hover:text-[var(--text-primary)]">
            About
          </Link>
          <Link href="/docs" className="hover:text-[var(--text-primary)]">
            API &amp; MCP Docs
          </Link>
          <Link href="/privacy" className="hover:text-[var(--text-primary)]">
            Privacy
          </Link>
        </div>
      </main>
    </div>
  );
}
