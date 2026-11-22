"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, X } from "lucide-react";
import { SEARCH_INDEX, type SearchIndexEntry } from "@/data/universe";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

interface CommandSearchProps {
  variant?: "nav" | "hero";
}

export function CommandSearch({
  variant = "nav",
  initialEntries = SEARCH_INDEX,
}: CommandSearchProps & { initialEntries?: SearchIndexEntry[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<SearchIndexEntry[]>(initialEntries);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  // Hydrate latest edge-cached search index from /api/search-index once on open
  const hasFetchedRef = useRef(false);
  function refreshIndexOnce() {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetch("/api/search-index")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SearchIndexEntry[] | null) => {
        if (Array.isArray(data) && data.length > 0) {
          setEntries(data);
        }
      })
      .catch(() => {
        // Keep bundled initialEntries on network error
      });
  }

  const results = useMemo<SearchIndexEntry[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...entries]
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, 12);
    }
    return entries
      .filter(
        (item) =>
          item.ticker.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.sector.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aExact = a.ticker.toLowerCase().startsWith(q) ? 1 : 0;
        const bExact = b.ticker.toLowerCase().startsWith(q) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return b.marketCap - a.marketCap;
      })
      .slice(0, 12);
  }, [entries, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    refreshIndexOnce();
    dialog.showModal();
    setQuery("");
    setActiveIdx(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeDialog() {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    }
  }

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
  }, [variant]);

  // Safari fallback for closedby="any" (pointer position outside bounding rect)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype) {
      return;
    }

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    let pressedOutside = false;
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
    };

    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

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
            <span>Search {entries.length} SEC-verified companies…</span>
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
        {...({ closedby: "any" } as Record<string, string>)}
        className="amber-dialog m-auto mt-[12vh] w-[min(600px,calc(100vw-2rem))] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-0 text-[var(--text-primary)] shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--amber)]" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              No SEC-indexed companies match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <ul role="listbox" aria-label="Matching companies" className="space-y-0.5">
              {results.map((item, idx) => {
                const isSelected = idx === activeIdx;
                return (
                  <li key={item.ticker} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
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
                          {item.sector} · Mkt Cap {formatCurrencyCompact(item.marketCap)}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-4 text-right">
                        <div className="hidden sm:block">
                          <div className="text-[10px] text-[var(--text-muted)]">
                            True FCF
                          </div>
                          <div
                            className={`font-mono-num text-xs font-medium ${
                              item.trueFcf >= 0
                                ? "text-[var(--text-primary)]"
                                : "text-[var(--negative)]"
                            }`}
                          >
                            {formatCurrencyCompact(item.trueFcf)}
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
          <span>↑↓ Navigate · ↵ Open · Esc Close</span>
          <span className="font-mono-num">
            {entries.length} companies · SEC EDGAR 10-K
          </span>
        </div>
      </dialog>
    </>
  );
}
