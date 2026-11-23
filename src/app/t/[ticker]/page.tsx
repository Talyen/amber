import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getAllTickers,
  getCompanySnapshot,
  getInsiderTrades,
  getSearchIndex,
  getSectorBenchmark,
} from "@/data/repository";
import { CompanyWorkspace } from "@/components/CompanyWorkspace";
import {
  computeCompanyValuation,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";

export const revalidate = 86400;
export const dynamicParams = true;

interface TickerPageProps {
  params: Promise<{ ticker: string }>;
}

/**
 * Pre-render the top 40 tickers at build time for instant cold loads;
 * all remaining tickers (41..5,000+) render on-demand and cache at Vercel's edge for 24h.
 */
export async function generateStaticParams() {
  const tickers = await getAllTickers();
  return tickers.slice(0, 40).map((ticker) => ({ ticker }));
}

export async function generateMetadata({
  params,
}: TickerPageProps): Promise<Metadata> {
  const { ticker } = await params;
  const company = await getCompanySnapshot(ticker);
  if (!company) {
    return { title: "Ticker Not Found" };
  }

  const { latest, netDilutionCagr, reverseDcf } = computeCompanyValuation(company);

  return {
    title: `${company.ticker} | ${company.name} Valuation, SEC Filings & Insiders`,
    description: `${company.name} (${company.ticker}): ${formatPct(reverseDcf.impliedRevenueCagrPct)}/yr implied 10Y growth, ${formatCurrencyCompact(latest.trueFcf)} True FCF (${formatPct(latest.trueFcfMargin)} margin), ${formatPct(netDilutionCagr, true)}/yr share count trend, and SEC ${company.lastFiling.type} filing diffs.`,
  };
}

export default async function TickerPage({ params }: TickerPageProps) {
  const { ticker } = await params;
  const company = await getCompanySnapshot(ticker);

  if (!company) {
    notFound();
  }

  const [insiderTrades, sectorBenchmark, searchIndex] = await Promise.all([
    getInsiderTrades(company.ticker),
    getSectorBenchmark(company.sector),
    getSearchIndex(),
  ]);

  const sectorPeers = searchIndex
    .filter((c) => c.sector === company.sector && c.ticker !== company.ticker)
    .sort(
      (a, b) =>
        Math.abs(a.marketCap - company.marketCap) -
        Math.abs(b.marketCap - company.marketCap)
    )
    .slice(0, 4);

  const { latest, enterpriseValue, netDilutionCagr, reverseDcf } =
    computeCompanyValuation(company);
  const latestFilingDiff = company.filingDiffs.find(
    (diff) => diff.accessionNumber === company.lastFiling.accessionNumber
  );

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What growth rate is ${company.ticker} stock pricing in?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `At $${company.price.toFixed(2)} (${formatCurrencyCompact(enterpriseValue)} Enterprise Value), ${company.name} (${company.ticker}) is pricing in approximately ${formatPct(reverseDcf.impliedRevenueCagrPct)} annual revenue growth over the next 10 years under baseline Reverse DCF assumptions.`,
        },
      },
      {
        "@type": "Question",
        name: `Does ${company.ticker} dilute shareholders?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Over the last 4 fiscal years, ${company.name}'s diluted share count changed at ${formatPct(netDilutionCagr, true)}/yr (currently ${latest.dilutedShares.toLocaleString()}M diluted shares), with ${formatCurrencyCompact(latest.sbc)} in latest-period stock-based compensation (${formatPct(latest.sbcPctRevenue)} of revenue).`,
        },
      },
      {
        "@type": "Question",
        name: `What changed in ${company.ticker}'s latest SEC filing?`,
        acceptedAnswer: {
          "@type": "Answer",
          text:
            latestFilingDiff
              ? `${latestFilingDiff.headline}: ${latestFilingDiff.summary}`
              : `${company.name} last filed a ${company.lastFiling.type} on ${company.lastFiling.date}. Amber’s latest available financials show ${formatCurrencyCompact(latest.revenue)} in revenue and ${formatCurrencyCompact(latest.trueFcf)} in True Free Cash Flow.`,
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <CompanyWorkspace
        company={company}
        insiderTrades={insiderTrades}
        sectorBenchmark={sectorBenchmark}
        sectorPeers={sectorPeers}
      />
    </>
  );
}
