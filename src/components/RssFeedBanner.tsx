import { Rss } from "lucide-react";

export function RssFeedBanner() {
  return (
    <section
      aria-label="SEC signals RSS feed"
      className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
        Follow SEC filing changes and insider buys in your RSS reader
      </h2>
      <a
        href="/feed.xml"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--amber)] hover:underline"
      >
        <Rss className="h-3.5 w-3.5" aria-hidden="true" />
        Subscribe via RSS
      </a>
    </section>
  );
}
