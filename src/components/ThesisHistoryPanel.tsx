"use client";

import { useState } from "react";
import { ChevronDown, History, RotateCcw } from "lucide-react";
import type { ThesisHistoryEntry } from "@/lib/valuation-presets";

interface ThesisHistoryPanelProps {
  entries: ThesisHistoryEntry[];
  onRestore: (entry: ThesisHistoryEntry) => void;
}

function formatShortDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

export function ThesisHistoryPanel({
  entries,
  onRestore,
}: ThesisHistoryPanelProps) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left cursor-pointer"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
          <History className="h-3.5 w-3.5 text-[var(--amber)]" aria-hidden="true" />
          Thesis Journal
          <span className="font-mono-num rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
            {entries.length}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ol className="mt-3 divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {entries.map((item, idx) => (
            <li
              key={item.id}
              className="flex flex-col justify-between gap-2 py-2.5 sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                  <span className="font-semibold text-[var(--text-primary)]">
                    {formatShortDate(item.createdAt)}
                  </span>
                  {idx === 0 && (
                    <span className="rounded bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--amber)]">
                      Latest
                    </span>
                  )}
                  {typeof item.priceAtSave === "number" && Number.isFinite(item.priceAtSave) && (
                    <span className="font-mono-num text-[var(--text-muted)]">
                      Stock ${item.priceAtSave.toFixed(2)}
                    </span>
                  )}
                  {item.filingDateAtSave && (
                    <span className="font-mono-num text-[var(--text-muted)]">
                      Filing {item.filingDateAtSave}
                    </span>
                  )}
                </div>

                <div className="font-mono-num mt-1 text-xs text-[var(--text-secondary)]">
                  {item.lens.toUpperCase()} · {item.revGrowth}% rev · {item.targetMargin}% margin · {item.exitMultiple}x exit
                </div>

                {item.thesisNote && (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    &ldquo;{item.thesisNote}&rdquo;
                  </p>
                )}
              </div>

              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => onRestore(item)}
                  className="inline-flex shrink-0 items-center gap-1 self-start rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Restore
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
