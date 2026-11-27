"use client";

import { useEffect } from "react";
import { AmberLogo } from "@/components/AmberLogo";
import { RevenueSankey } from "@/components/RevenueSankey";
import { TrueFcfChart } from "@/components/TrueFcfChart";
import { ReverseDcfStudio } from "@/components/ReverseDcfStudio";
import { computeCompanyValuation, isFinancialInstitution, type CompanySnapshot } from "@/lib/finance";
import { SITE_HOST, SITE_URL } from "@/lib/site";
import { trackDistribution } from "@/lib/distribution";

export type EmbedChartType = "sankey" | "true-fcf" | "reverse-dcf";

interface EmbedChartFrameProps {
  company: CompanySnapshot;
  chart: EmbedChartType;
  theme?: "dark" | "light";
}

export function EmbedChartFrame({ company, chart, theme }: EmbedChartFrameProps) {
  useEffect(() => {
    if (theme === "dark" || theme === "light") {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  const { series, latest, reverseDcf } = computeCompanyValuation(company);
  const fySeries = series.filter((s) => s.fiscalYear !== "TTM");
  const latestFy = fySeries[fySeries.length - 1] ?? latest;
  const unavailableChart = chart === "reverse-dcf" && !reverseDcf
    ? "Reverse DCF"
    : isFinancialInstitution(company) && chart !== "reverse-dcf"
      ? chart === "true-fcf" ? "True FCF" : "Revenue Sankey"
      : null;

  const targetPath = unavailableChart
    ? `/t/${company.ticker}/valuation`
    : chart === "true-fcf"
      ? `/t/${company.ticker}/sbc`
      : chart === "reverse-dcf"
        ? `/t/${company.ticker}/valuation`
        : `/t/${company.ticker}`;

  return (
    <div className="min-h-screen bg-[var(--bg)] p-3 text-[var(--text-primary)]">
      <div className="mx-auto max-w-4xl">
        {unavailableChart ? (
          <p className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
            {unavailableChart} is unavailable for {company.ticker}. See Amber for available valuation metrics.
          </p>
        ) : chart === "true-fcf" ? (
          <TrueFcfChart company={company} series={series} />
        ) : chart === "reverse-dcf" && reverseDcf ? (
          <ReverseDcfStudio company={company} latest={latest} />
        ) : (
          <RevenueSankey
            ticker={company.ticker}
            companyName={company.name}
            period={latest}
            fyPeriod={latestFy}
          />
        )}

        <footer className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[var(--text-muted)]">
          <div className="inline-flex items-center gap-2">
            <a
              href={`${SITE_URL}${targetPath}`}
              onClick={() => trackDistribution("embed_click")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-[var(--text-secondary)] hover:text-[var(--amber)]"
            >
              <AmberLogo className="scale-75 origin-left" />
            </a>
            <span>SEC EDGAR XBRL · {company.lastFiling.type} ({company.lastFiling.date})</span>
          </div>
          <a
            href={`${SITE_URL}${targetPath}`}
            onClick={() => trackDistribution("embed_click")}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono-num font-semibold text-[var(--amber)] hover:underline"
          >
            Interactive model on {SITE_HOST} →
          </a>
        </footer>
      </div>
    </div>
  );
}
