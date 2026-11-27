import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Amber MCP Server" },
  description: "Connect to the Amber Model Context Protocol server for company fundamentals, stock screening, comparisons and SEC filing signals.",
  alternates: { canonical: `${SITE_URL}/mcp` },
};

const tools = [
  ["amber_get_company", "Get cash flow, dilution, valuation and recent SEC activity for one ticker."],
  ["amber_screen_companies", "Find companies by sector, financial thresholds or a screener lens."],
  ["amber_compare_companies", "Compare two to five covered companies and get a shareable link."],
  ["amber_get_recent_signals", "Find filing changes and open-market insider purchases."],
];

export default function McpPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="legal" />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">Amber MCP Server</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Add Amber as a remote Streamable HTTP server in your MCP client. Use <Link href="/api/mcp" prefetch={false} className="break-all text-[var(--amber)] hover:underline">{SITE_URL}/api/mcp</Link> as the server URL. It provides read-only access to public company data without a key.
        </p>

        <section className="mt-8 space-y-2 text-sm text-[var(--text-secondary)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Make a connection</h2>
          <p>Send an initialize request using MCP protocol version 2025-03-26, send the initialized notification, then list the available tools. POST requests should accept both <code>application/json</code> and <code>text/event-stream</code>. The server returns JSON for tool requests.</p>
          <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-mono-num text-xs text-[var(--text-primary)]">
            <code>{`curl -fsS "${SITE_URL}/api/mcp" \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"amber-example","version":"1.0.0"}}}'`}</code>
          </pre>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold">Tools</h2>
          <dl className="mt-2 space-y-3 text-sm">
            {tools.map(([name, description]) => (
              <div key={name}>
                <dt className="break-all font-mono-num text-xs font-semibold">{name}</dt>
                <dd className="mt-1 text-[var(--text-secondary)]">{description}</dd>
              </div>
            ))}
          </dl>
        </section>
        <p className="mt-8 border-t border-[var(--border)] pt-6 text-sm text-[var(--text-secondary)]">
          For direct HTTP requests, see the <Link href="/docs" className="text-[var(--amber)] hover:underline">Amber REST API documentation</Link>.
        </p>
      </main>
    </div>
  );
}
