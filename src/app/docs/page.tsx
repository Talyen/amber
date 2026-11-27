import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Amber Public API & MCP Documentation",
  description:
    "Free, read-only SEC EDGAR fundamental data REST API, Markdown endpoints, and Streamable HTTP MCP server for AI agents and researchers.",
  alternates: {
    canonical: `${SITE_URL}/docs`,
  },
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="legal" />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
        <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
          DEVELOPERS &amp; AI AGENTS
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {SITE_NAME} Public API &amp; MCP Documentation
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Amber provides free, read-only, SEC EDGAR-verified fundamental data for 700+ Nasdaq and NYSE companies with no API key required. All endpoints return structured JSON or token-light Markdown with canonical links back to interactive charts.
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-[var(--text-secondary)]">
          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              1. Quickstart &amp; Discovery
            </h2>
            <p className="mt-2">
              No authentication is required for read-only public endpoints. Start from the machine-readable index or OpenAPI 3.1 specification:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 font-mono-num text-xs">
              <li>
                Agent Index:{" "}
                <a href="/llms.txt" className="text-[var(--amber)] hover:underline">
                  {SITE_URL}/llms.txt
                </a>
              </li>
              <li>
                OpenAPI 3.1 Spec:{" "}
                <a href="/openapi.json" className="text-[var(--amber)] hover:underline">
                  {SITE_URL}/openapi.json
                </a>
              </li>
              <li>
                Streamable HTTP MCP Server:{" "}
                <span className="text-[var(--text-primary)]">{SITE_URL}/api/mcp</span>
              </li>
              <li>
                RSS / Atom Feed:{" "}
                <a href="/feed.xml" className="text-[var(--amber)] hover:underline">
                  {SITE_URL}/feed.xml
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              2. REST Endpoints
            </h2>
            <div className="mt-3 space-y-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
                  GET /api/public/t/{"{ticker}"}
                </div>
                <p className="mt-1.5">
                  Returns SEC-verified revenue, reported FCF, Stock-Based Compensation (SBC), True FCF (FCF minus SBC), 4-year net share dilution, Reverse DCF implied 10-year revenue growth, recent 10-K/10-Q prose diffs, and open-market Form 4 insider buys. Pass <code className="font-mono-num text-xs">?format=markdown</code> or <code className="font-mono-num text-xs">Accept: text/markdown</code> for Markdown.
                </p>
                <pre className="mt-2.5 overflow-x-auto rounded bg-[var(--bg)] p-2.5 font-mono-num text-xs text-[var(--text-primary)]">
{`curl -s "${SITE_URL}/api/public/t/NVDA"
curl -s -H "Accept: text/markdown" "${SITE_URL}/api/public/t/NVDA"`}
                </pre>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
                  GET /api/public/screener
                </div>
                <p className="mt-1.5">
                  Screen 700+ companies by <code className="font-mono-num text-xs">lens</code>, <code className="font-mono-num text-xs">sector</code>, <code className="font-mono-num text-xs">minTrueFcfMargin</code>, <code className="font-mono-num text-xs">maxSbcPct</code>, <code className="font-mono-num text-xs">maxImpliedCagr</code>, <code className="font-mono-num text-xs">maxDilution</code>, <code className="font-mono-num text-xs">minMarketCapB</code>, and <code className="font-mono-num text-xs">limit</code> (1–50).
                </p>
                <pre className="mt-2.5 overflow-x-auto rounded bg-[var(--bg)] p-2.5 font-mono-num text-xs text-[var(--text-primary)]">
{`curl -s "${SITE_URL}/api/public/screener?lens=cash-machines&minTrueFcfMargin=20&maxSbcPct=5&limit=10"`}
                </pre>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
                  GET /api/public/signals
                </div>
                <p className="mt-1.5">
                  Fetch recent high-materiality SEC 10-K/10-Q filing diffs and open-market Form 4 executive buys. Filter by <code className="font-mono-num text-xs">ticker</code>, <code className="font-mono-num text-xs">type</code> (<code className="font-mono-num text-xs">all</code> | <code className="font-mono-num text-xs">diffs</code> | <code className="font-mono-num text-xs">insiders</code>), and <code className="font-mono-num text-xs">limit</code> (1–50).
                </p>
                <pre className="mt-2.5 overflow-x-auto rounded bg-[var(--bg)] p-2.5 font-mono-num text-xs text-[var(--text-primary)]">
{`curl -s "${SITE_URL}/api/public/signals?type=all&limit=15"`}
                </pre>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              3. Model Context Protocol (MCP) Server
            </h2>
            <p className="mt-2">
              Connect Claude Desktop, Cursor, or any Streamable HTTP MCP client directly to <code className="font-mono-num text-xs text-[var(--text-primary)]">{SITE_URL}/api/mcp</code>. Available tools: <code className="font-mono-num text-xs">amber_get_company</code>, <code className="font-mono-num text-xs">amber_screen_companies</code>, <code className="font-mono-num text-xs">amber_compare_companies</code>, and <code className="font-mono-num text-xs">amber_get_recent_signals</code>.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-mono-num text-xs text-[var(--text-primary)]">
{`{
  "mcpServers": {
    "amber": {
      "url": "${SITE_URL}/api/mcp"
    }
  }
}`}
            </pre>
          </section>

          <section id="errors">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              4. Rate Limits, Versioning &amp; Errors
            </h2>
            <p className="mt-2">
              Public endpoints include standard <code className="font-mono-num text-xs">RateLimit-Policy</code>, <code className="font-mono-num text-xs">RateLimit-Limit</code>, and <code className="font-mono-num text-xs">RateLimit-Remaining</code> headers (120 requests per 60-second window) along with <code className="font-mono-num text-xs">X-API-Version: 1.0</code>. Any breaking schema changes are announced via RFC 8594 <code className="font-mono-num text-xs">Deprecation</code> and <code className="font-mono-num text-xs">Sunset</code> headers at least 90 days in advance.
            </p>
            <p className="mt-2">
              All API errors return structured JSON with machine-readable <code className="font-mono-num text-xs">code</code>, <code className="font-mono-num text-xs">message</code>, and <code className="font-mono-num text-xs">resolution</code> fields so agents can recover cleanly without scraping HTML.
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
