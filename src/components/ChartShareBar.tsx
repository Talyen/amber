"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Code2, Copy, Download } from "lucide-react";
import type { CardDeliveryMode, CardDeliveryResult } from "@/lib/export-card";
import { SITE_URL } from "@/lib/site";

interface ChartShareBarProps {
  onDeliverCard: (mode: CardDeliveryMode) => Promise<CardDeliveryResult> | void;
  /** Optional relative embed path, e.g. "/embed/NVDA?chart=sankey" */
  embedPath?: string;
  /** Optional canonical page path for Markdown attribution, e.g. "/t/NVDA" */
  pagePath?: string;
  /** Optional label for Markdown link, e.g. "NVDA Revenue Flow on Amber" */
  embedTitle?: string;
}

export function ChartShareBar({
  onDeliverCard,
  embedPath,
  pagePath,
  embedTitle = "Interactive chart on Amber",
}: ChartShareBarProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "downloaded">("idle");
  const [embedOpen, setEmbedOpen] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<"iframe" | "markdown" | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!embedOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEmbedOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setEmbedOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [embedOpen]);

  async function handleAction(mode: CardDeliveryMode) {
    const res = await onDeliverCard(mode);
    const next = res === "copied" ? "copied" : "downloaded";
    setStatus(next);
    window.setTimeout(() => setStatus("idle"), 1800);
  }

  const origin =
    typeof window !== "undefined" && window.location.origin && !window.location.origin.includes("localhost")
      ? window.location.origin
      : SITE_URL;
  const fullEmbedUrl = embedPath ? `${origin}${embedPath}` : "";
  const fullPageUrl = pagePath ? `${origin}${pagePath}` : origin;
  const iframeCode = `<iframe src="${fullEmbedUrl}" title="${embedTitle}" width="100%" height="520" style="border:0;border-radius:12px;overflow:hidden;" loading="lazy"></iframe>`;
  const markdownCode = `[${embedTitle}](${fullPageUrl})`;

  async function copyText(kind: "iframe" | "markdown", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSnippet(kind);
      window.setTimeout(() => setCopiedSnippet(null), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  }

  return (
    <div ref={popoverRef} className="relative inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => handleAction("copy")}
        title="Copy high-resolution PNG card directly to clipboard"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:bg-[var(--amber-soft)] hover:text-[var(--amber)] cursor-pointer"
      >
        {status === "copied" ? (
          <>
            <Check className="h-3.5 w-3.5 text-[var(--positive)]" />
            Copied PNG
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            Copy PNG
          </>
        )}
      </button>

      <button
        type="button"
        onClick={() => handleAction("download")}
        aria-label="Download PNG card"
        title="Download PNG"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
      >
        {status === "downloaded" ? (
          <Check className="h-3.5 w-3.5 text-[var(--positive)]" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </button>

      {embedPath && (
        <button
          type="button"
          onClick={() => setEmbedOpen((prev) => !prev)}
          aria-expanded={embedOpen}
          aria-label="Embed or share chart"
          title="Embed chart in Substack, blog, or Markdown"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors cursor-pointer ${
            embedOpen
              ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
              : "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Code2 className="h-3.5 w-3.5" />
        </button>
      )}

      {embedOpen && embedPath && (
        <div
          role="dialog"
          aria-label="Embed chart options"
          className="absolute right-0 top-full z-30 mt-1.5 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-3.5 shadow-xl"
        >
          <div className="text-xs font-semibold text-[var(--text-primary)]">
            Embed or cite this chart
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            Live SEC-backed chart for blogs, newsletters, and notes.
          </p>

          <div className="mt-3 space-y-2.5">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="font-medium text-[var(--text-secondary)]">HTML Embed (&lt;iframe&gt;)</span>
                <button
                  type="button"
                  onClick={() => copyText("iframe", iframeCode)}
                  className="inline-flex items-center gap-1 font-medium text-[var(--amber)] hover:underline cursor-pointer"
                >
                  {copiedSnippet === "iframe" ? (
                    <>
                      <Check className="h-3 w-3 text-[var(--positive)]" />
                      Copied
                    </>
                  ) : (
                    "Copy HTML"
                  )}
                </button>
              </div>
              <pre className="font-mono-num overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-[10px] text-[var(--text-secondary)]">
                {iframeCode}
              </pre>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="font-medium text-[var(--text-secondary)]">Markdown link (Substack / Reddit)</span>
                <button
                  type="button"
                  onClick={() => copyText("markdown", markdownCode)}
                  className="inline-flex items-center gap-1 font-medium text-[var(--amber)] hover:underline cursor-pointer"
                >
                  {copiedSnippet === "markdown" ? (
                    <>
                      <Check className="h-3 w-3 text-[var(--positive)]" />
                      Copied
                    </>
                  ) : (
                    "Copy Markdown"
                  )}
                </button>
              </div>
              <pre className="font-mono-num overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-[10px] text-[var(--text-secondary)]">
                {markdownCode}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
