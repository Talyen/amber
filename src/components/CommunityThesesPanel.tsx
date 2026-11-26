"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import type { MarketCommunityThesisItem } from "@/app/api/community-theses/route";
import { formatPct } from "@/lib/finance";
import { ProfileAvatar } from "@/components/ProfileAvatar";

export function CommunityThesesPanel() {
  const [theses, setTheses] = useState<MarketCommunityThesisItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/community-theses", {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: MarketCommunityThesisItem[]) => {
        if (!controller.signal.aborted) {
          setTheses(Array.isArray(rows) ? rows : []);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  if (!loaded || theses.length === 0) return null;

  return (
    <section className="mt-10 border-t border-[var(--border)] pt-8" aria-label="Published community theses">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-[var(--text-primary)]">
            <Sparkles className="h-4 w-4 text-[var(--amber)]" aria-hidden="true" />
            Community Valuation Theses
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Public 5-year models shared by Amber investors. Open any thesis to test or fork the assumptions.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--amber)] hover:underline"
        >
          Publish yours from any company page
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {theses.slice(0, 9).map((item) => {
          const irr = item.irrPct;

          return (
            <div
              key={`${item.handle}-${item.ticker}-${item.updatedAt}`}
              className="flex flex-col justify-between gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--amber-border)]"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/t/${item.ticker}?tab=dcf&model=scenario&lens=${item.lens}&rev=${item.revGrowth}&m=${item.targetMargin}&exit=${item.exitMultiple}`}
                      className="inline-flex items-baseline gap-1.5 hover:text-[var(--amber)]"
                    >
                      <span className="font-mono-num text-sm font-semibold text-[var(--amber)]">
                        {item.ticker}
                      </span>
                      <span className="truncate text-xs text-[var(--text-secondary)]">
                        {item.companyName}
                      </span>
                    </Link>
                    <div className="font-mono-num mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {item.lens.toUpperCase()} · {item.revGrowth}% rev · {item.targetMargin}% margin · {item.exitMultiple}x
                    </div>
                  </div>
                  {irr !== null && (
                    <span
                      className={`font-mono-num shrink-0 text-xs font-semibold ${
                        irr >= 12
                          ? "text-[var(--positive)]"
                          : irr >= 8
                            ? "text-[var(--amber)]"
                            : "text-[var(--negative)]"
                      }`}
                    >
                      {formatPct(irr, true)}/yr
                    </span>
                  )}
                </div>

                {item.thesisNote && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {item.thesisNote}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5 text-[11px]">
                <Link
                  href={`/u/${encodeURIComponent(item.handle)}`}
                  className="inline-flex min-w-0 items-center gap-1.5 font-mono-num font-medium text-[var(--text-secondary)] hover:text-[var(--amber)]"
                >
                  <ProfileAvatar icon={item.avatarIcon} size="sm" />
                  <span className="truncate">{item.handle}</span>
                </Link>
                <Link
                  href={`/t/${item.ticker}?tab=dcf&model=scenario&lens=${item.lens}&rev=${item.revGrowth}&m=${item.targetMargin}&exit=${item.exitMultiple}`}
                  className="shrink-0 font-medium text-[var(--amber)] hover:underline"
                >
                  {item.fairValueToday !== null ? `FV $${item.fairValueToday.toFixed(0)} →` : "Open model →"}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
