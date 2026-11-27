import type { Metadata } from "next";
import Link from "next/link";
import { AMBER_HOME_TITLE, AMBER_PRODUCT_TERMS } from "@/lib/agent-readiness";
import { SignalIndex } from "@/components/SignalIndex";
import { SITE_URL } from "@/lib/site";
import {
  getFilingDiffsForTickers,
  getInsiderBuySummaries,
  getInsiderTradesForTickers,
  getMaterialEventSummaries,
  getRecentFilingDiffs,
  getRecentMarketInsiders,
  getSearchIndex,
} from "@/data/repository";
import { selectFeaturedSignals } from "@/lib/featured-signals";
import { toExploreEntry } from "@/data/search-index";
import { getTrendingTickers } from "@/lib/trending";

export const revalidate = 21600;

export const metadata: Metadata = {
  title: { absolute: AMBER_HOME_TITLE },
  keywords: AMBER_PRODUCT_TERMS,
  alternates: {
    canonical: `${SITE_URL}/`,
  },
};

export default async function HomePage() {
  const [entries, trending, insiderBuySummaries, materialEventSummaries] =
    await Promise.all([
      getSearchIndex(),
      getTrendingTickers(),
      getInsiderBuySummaries(),
      getMaterialEventSummaries(),
    ]);
  const trendingSyms = trending.map((t) => t.ticker);

  const [trendingDiffs, trendingInsiders, fallbackDiffs, fallbackInsiders] =
    await Promise.all([
      getFilingDiffsForTickers(trendingSyms, 30),
      getInsiderTradesForTickers(trendingSyms, 40),
      getRecentFilingDiffs(40),
      getRecentMarketInsiders(),
    ]);

  const seenDiffIds = new Set(trendingDiffs.map((d) => d.id));
  const recentDiffs = [
    ...trendingDiffs,
    ...fallbackDiffs.filter((fd) => !seenDiffIds.has(fd.id)),
  ];
  const seenInsiderIds = new Set(trendingInsiders.map((ti) => ti.id));
  const recentInsiders = [
    ...trendingInsiders,
    ...fallbackInsiders.filter((fi) => !seenInsiderIds.has(fi.id)),
  ];

  const { featuredDiffs, featuredInsiderBuy } = selectFeaturedSignals({
    diffs: recentDiffs,
    insiders: recentInsiders,
    entries,
    trendingTickers: trendingSyms,
  });

  return (
    <SignalIndex
      researchGuide={<ResearchGuide />}
      entries={entries.map(toExploreEntry)}
      featuredDiffs={featuredDiffs}
      featuredInsiderBuy={featuredInsiderBuy}
      insiderBuySummaries={insiderBuySummaries}
      materialEventSummaries={materialEventSummaries}
    />
  );
}

function ResearchGuide() {
  const linkClass = "text-[var(--amber)] hover:underline";
  return (
    <section aria-labelledby="amber-research" className="mt-12 max-w-3xl space-y-4 text-sm leading-relaxed text-[var(--text-secondary)]">
      <div>
        <h2 id="amber-research" className="text-base font-semibold text-[var(--text-primary)]">Stock screener and fundamental stock research</h2>
        <p className="mt-2">
          Amber covers US-listed companies using financial statements and disclosures filed with the Securities and Exchange Commission. Use the stock screener to narrow the list by sector or market capitalization, then compare companies on cash generation, stock-based compensation, and changes in diluted shares. Each company page identifies the latest filing and reporting period, so you can tell which results the figures reflect.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-[var(--text-primary)]">Compare cash flow and valuation</h3>
        <p className="mt-2">
          True Free Cash Flow subtracts capital expenditures and stock-based compensation from operating cash flow. Read it alongside reported free cash flow and the four-year change in diluted shares to see whether a company&apos;s cash generation and ownership trends tell the same story. Reverse DCF estimates the revenue growth implied by the current valuation under the model&apos;s assumptions. Use the <Link href="/compare" className={linkClass}>company comparison</Link> to put up to five tickers side by side.
        </p>
        <p className="mt-2">
          Business models call for different measures. Amber shows tangible book value and return on tangible common equity for banks and insurers, and funds from operations for real estate investment trusts. A missing figure means Amber does not have a comparable value for that measure and ticker. Check the as-of date before using a closing price in a comparison or investment note.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-[var(--text-primary)]">Read SEC filings and insider activity</h3>
        <p className="mt-2">
          Browse <Link href="/filings" className={linkClass}>SEC filings and filing changes</Link> to see what companies added or removed from risk factors and management discussion in recent annual and quarterly reports. The <Link href="/feed" className={linkClass}>signal feed</Link> brings those changes together with open-market Form 4 insider purchases. Follow the source links to read the relevant disclosure and review the filing date separately from the transaction or reporting period.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-[var(--text-primary)]">Use Amber data in your own research</h3>
        <p className="mt-2">
          Fetch a company snapshot, run a screen, or retrieve recent signals from the <Link href="/docs" className={linkClass}>Amber API documentation</Link>. The <Link href="/developers" className={linkClass}>developer portal</Link> has a first request you can run without an account, and the <Link href="/mcp" className={linkClass}>Amber MCP server</Link> offers the same core research tasks to compatible clients. Cite the original filing or the linked Amber page when sharing figures.
        </p>
      </div>
    </section>
  );
}
