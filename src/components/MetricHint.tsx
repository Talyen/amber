"use client";

import { useEffect, useId, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

interface MetricHintProps {
  label: string;
  description: string;
  align?: "left" | "right" | "center";
}

export function MetricHint({
  label,
  description,
  align = "center",
}: MetricHintProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const alignClass =
    align === "left"
      ? "left-0"
      : align === "right"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <span ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--amber)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--amber)] cursor-pointer"
      >
        <HelpCircle className="h-3 w-3" aria-hidden="true" />
      </button>

      {open && (
        <span
          id={tipId}
          role="tooltip"
          className={`pointer-events-none absolute bottom-full z-50 mb-2 w-56 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-[var(--text-secondary)] shadow-xl whitespace-normal normal-case tracking-normal ${alignClass}`}
        >
          <strong className="block font-semibold text-[var(--text-primary)]">
            {label}
          </strong>
          <span className="mt-0.5 block">{description}</span>
        </span>
      )}
    </span>
  );
}
