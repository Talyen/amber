"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useDialogLightDismiss } from "@/lib/dialog-light-dismiss";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, X } from "lucide-react";
import type { CommandSearchEntry } from "@/data/search-index";
import { searchCompanies } from "@/lib/company-search";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

let cachedSearchIndex: CommandSearchEntry[] | null = null;
let inFlightSearchIndex: Promise<CommandSearchEntry[] | null> | null = null;

function loadSearchIndex(): Promise<CommandSearchEntry[] | null> {
  if (cachedSearchIndex) return Promise.resolve(cachedSearchIndex);
  if (!inFlightSearchIndex) {
    inFlightSearchIndex = fetch("/api/search-index/compact")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CommandSearchEntry[] | null) => {
        if (Array.isArray(data) && data.length > 0) {
          cachedSearchIndex = data;
          return data;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        inFlightSearchIndex = null;
      });
  }
  return inFlightSearchIndex;
}

interface CommandSearchProps {
  variant?: "nav" | "hero";
  initialEntries?: CommandSearchEntry[];
}

export function CommandSearch({
  variant = "nav",
  initialEntries,
}: CommandSearchProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lightDismiss = useDialogLightDismiss(dialogRef);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [loadedEntries, setLoadedEntries] = useState<CommandSearchEntry[]>([]);
  const entries = initialEntries?.length ? initialEntries : loadedEntries;
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "failed">("idle");
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const results = useMemo(() => searchCompanies(entries, query, 12), [entries, query]);
  const activeTicker = results[activeIdx]?.ticker;

  const openDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    if (entries.length === 0) {
      if (!cachedSearchIndex) setLoadStatus("loading");
      loadSearchIndex().then((data) => {
        if (data) setLoadedEntries(data);
        setLoadStatus(data ? "idle" : "failed");
      });
    }

    dialog.showModal();
    setQuery("");
    setActiveIdx(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [entries.length]);

  const closeDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    }
  }, []);

  function selectTicker(ticker: string) {
    closeDialog();
    router.push(`/t/${ticker}`);
  }

  // Global Cmd+K / Ctrl+K shortcut (only when variant === "nav" to avoid duplicate listeners)
  useEffect(() => {
    if (variant !== "nav") return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialogRef.current?.open) {
          closeDialog();
        } else {
          openDialog();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant, openDialog, closeDialog]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) =>
        results.length ? (prev + 1) % results.length : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) =>
        results.length ? (prev - 1 + results.length) % results.length : 0
      );
    } else if (e.key === "Enter" && results[activeIdx]) {
      e.preventDefault();
      selectTicker(results[activeIdx].ticker);
    }
  }

  return (
    <>
      {variant === "nav" ? (
        <button
          type="button"
          aria-label="Search tickers"
          onClick={openDialog}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span className="hidden md:inline">Search tickers…</span>
          <kbd className="font-mono-num hidden rounded border border-[var(--border)] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] sm:inline">
            ⌘K
          </kbd>
        </button>
      ) : (
        <button
          type="button"
          onClick={openDialog}
          className="flex w-full max-w-md items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--amber-border)] cursor-pointer"
        >
          <span className="inline-flex items-center gap-2.5">
            <Search className="h-4 w-4 text-[var(--amber)]" />
            <span>
              {entries.length > 0
                ? `Search ${entries.length} SEC-verified companies…`
                : "Search SEC-verified companies…"}
            </span>
          </span>
          <kbd className="font-mono-num rounded border border-[var(--border)] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">
            ⌘K
          </kbd>
        </button>
      )}

      {/* Native modal <dialog>: no role="dialog" or aria-modal needed */}
      <dialog
        ref={dialogRef}
        aria-label="Search companies"
        {...lightDismiss}
        className="amber-dialog m-auto mt-[12vh] w-[min(600px,calc(100vw-2rem))] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-0 text-[var(--text-primary)] shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--amber)]" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Search companies"
            aria-expanded={results.length > 0}
            aria-controls={results.length > 0 ? listboxId : undefined}
            aria-activedescendant={activeTicker ? `${listboxId}-${activeTicker}` : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a ticker, company name, or sector (e.g. NVDA, CRWD, SaaS)…"
            autoFocus
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={closeDialog}
            aria-label="Close search"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="max-h-[380px] overflow-y-auto p-2">
          {entries.length === 0 && loadStatus === "loading" ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              Loading SEC-indexed companies…
            </div>
          ) : entries.length === 0 && loadStatus === "failed" ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              Could not load companies. Reopen search to try again.
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              No SEC-indexed companies match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Matching companies"
              className="space-y-0.5"
            >
              {results.map((item, idx) => {
                const isSelected = idx === activeIdx;
                return (
                  <li key={item.ticker} role="none">
                    <button
                      id={`${listboxId}-${item.ticker}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      ref={
                        isSelected
                          ? (el) => el?.scrollIntoView({ block: "nearest" })
                          : undefined
                      }
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => selectTicker(item.ticker)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[var(--amber-soft)] text-[var(--text-primary)]"
                          : "hover:bg-[var(--surface-subtle)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num text-xs font-semibold text-[var(--amber)]">
                            {item.ticker}
                          </span>
                          <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                            {item.name}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                          {item.sector}, Mkt Cap {formatCurrencyCompact(item.marketCap)}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-4 text-right">
                        <div className="hidden sm:block">
                          <div className="text-[10px] text-[var(--text-muted)]">
                            True FCF
                          </div>
                          <div
                            className={`font-mono-num text-xs font-medium ${
                              item.trueFcf < 0
                                ? "text-[var(--negative)]"
                                : "text-[var(--text-primary)]"
                            }`}
                          >
                            {Number.isFinite(item.trueFcf) ? formatCurrencyCompact(item.trueFcf) : "—"}
                          </div>
                        </div>
                        <div className="hidden sm:block">
                          <div className="text-[10px] text-[var(--text-muted)]">
                            SBC / Rev
                          </div>
                          <div className="font-mono-num text-xs font-medium text-[var(--sbc)]">
                            {formatPct(item.sbcPctRevenue)}
                          </div>
                        </div>
                        <ArrowRight
                          className={`h-3.5 w-3.5 ${
                            isSelected
                              ? "text-[var(--amber)]"
                              : "text-[var(--text-muted)]"
                          }`}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
          <span>↑↓ Navigate  ↵ Open  Esc Close</span>
          <span className="font-mono-num">
            {entries.length} companies
          </span>
        </div>
      </dialog>
    </>
  );
}
