"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackDistribution } from "@/lib/distribution";

export function DistributionPageView() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname || lastPath.current === pathname) return;
    const event = lastPath.current === null ? "landing_view" : "page_view";
    lastPath.current = pathname;
    trackDistribution(event);
  }, [pathname]);
  return null;
}
