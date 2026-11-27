import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Amber Developer Portal" },
  description: "Start using the Amber stock screener and SEC filings REST API or MCP server. Get company fundamentals with a keyless, read-only request.",
  alternates: { canonical: `${SITE_URL}/developers` },
};

const links = [
  { href: "/docs", label: "Amber API documentation", description: "REST endpoints, responses, quota, versioning and error codes." },
  { href: "/openapi.json", label: "OpenAPI specification", description: "Machine-readable contract for the v1 REST API." },
  { href: "/mcp", label: "Amber MCP server", description: "Client setup and tools for company lookup, screening, comparison, and signals." },
  { href: "/llms.txt", label: "Agent instructions", description: "When to use Amber and which endpoint or tool to call." },
];

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="legal" />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">Amber Developer Portal</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Integrate public US-company fundamentals, stock screening and SEC filing signals into a research tool or agent. REST and MCP are read-only and require no Amber account or API key.
        </p>

        <section className="mt-8">
          <h2 className="text-base font-semibold">Run your first request</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Try the <Link href="/api/v1/t/NVDA" className="text-[var(--amber)] hover:underline">NVDA fundamentals example</Link> in your browser or run the request in a terminal. The example reads public data and has no side effects.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-mono-num text-xs">
            <code>{`curl -fsS "${SITE_URL}/api/v1/t/NVDA"`}</code>
          </pre>
        </section>

        <ul className="mt-8 divide-y divide-[var(--border)] text-sm">
          {links.map(({ href, label, description }) => (
            <li key={href} className="py-3">
              <Link href={href} prefetch={false} className="font-semibold text-[var(--amber)] hover:underline">{label}</Link>
              <p className="mt-1 text-[var(--text-secondary)]">{description}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 border-t border-[var(--border)] pt-6 text-sm text-[var(--text-secondary)]">
          For integration questions, <Link href="/contact" className="text-[var(--amber)] hover:underline">contact Amber</Link> or visit <a href="https://github.com/Talyen/amber" className="text-[var(--amber)] hover:underline">Amber on GitHub</a>.
        </p>
      </main>
    </div>
  );
}
