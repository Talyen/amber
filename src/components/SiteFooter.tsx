"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MethodologyModal } from "@/components/MethodologyModal";

interface SiteFooterProps {
  rightExtra?: ReactNode;
}

export function SiteFooter({ rightExtra }: SiteFooterProps) {
  return (
    <footer className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span>© {new Date().getFullYear()} Amber</span>
        <Link href="/about" className="transition-colors hover:text-[var(--text-primary)]">
          About
        </Link>
        <Link href="/docs" className="transition-colors hover:text-[var(--text-primary)]">
          API &amp; MCP
        </Link>
        <Link href="/contact" className="transition-colors hover:text-[var(--text-primary)]">
          Contact
        </Link>
        <Link href="/privacy" className="transition-colors hover:text-[var(--text-primary)]">
          Privacy
        </Link>
        <Link href="/terms" className="transition-colors hover:text-[var(--text-primary)]">
          Terms
        </Link>
        <a
          href="https://github.com/Talyen/amber"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[var(--text-primary)]"
        >
          GitHub
        </a>
        <span>Not investment advice.</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <MethodologyModal />
        {rightExtra}
      </div>
    </footer>
  );
}
