import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Amber handles account data, OAuth sign-in, and watchlists.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
        <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
          LEGAL
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          Privacy Policy
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Last updated: November 2026
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--text-secondary)]">
          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              1. Information We Collect
            </h2>
            <p className="mt-2">
              Amber uses third-party OAuth sign-in (Google or GitHub) and never collects or stores passwords. When you sign in, we store your display name, email address, and provider account identifier so we can maintain your session, cloud-synced watchlist, and Portfolio Arena entry.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              2. How We Use Information
            </h2>
            <p className="mt-2">
              Your account details are used solely to authenticate your session, sync your watchlist across devices, and display your chosen public handle and portfolio holdings if you publish to the Portfolio Arena. We do not sell your data or share it with advertisers.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              3. Cookies &amp; Local Storage
            </h2>
            <p className="mt-2">
              Amber uses strictly necessary session cookies for authentication and browser local storage for theme preferences and logged-out watchlists.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              4. Data Deletion
            </h2>
            <p className="mt-2">
              You may revoke Amber&apos;s access at any time from your Google or GitHub account settings. To request deletion of your stored account or Arena entry, contact the project maintainer via the public GitHub repository.
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
