import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
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
  isFinancialInstitution,
} from "@/lib/finance";
import { SITE_URL } from "@/lib/site";

export type TickerWedgeView = "overview" | "sbc" | "valuation" | "filings";

const TAB_BY_WEDGE: Record<TickerWedgeView, "overview" | "fcf" | "dcf" | "diffs"> = {
  overview: "overview",
  sbc: "fcf",
  valuation: "dcf",
  filings: "diffs",
};

export async function buildTickerMetadata(
  ticker: string,
  view: TickerWedgeView
): Promise<Metadata> {
  const company = await getCompanySnapshot(ticker);
  if (!company) {
    return { title: "Ticker Not Found" };
  }

  const { latest, netDilutionCagr, reverseDcf } = computeCompanyValuation(company);
  const sectorNative = isFinancialInstitution(company);
  const path = view === "overview" ? `/t/${company.ticker}` : `/t/${company.ticker}/${view}`;
  const canonicalUrl = `${SITE_URL}${path}`;

  let title = `${company.ticker} | ${company.name} Valuation, SEC Filings & Insiders`;
  let description = `${company.name} (${company.ticker}): ${reverseDcf ? `${formatPct(reverseDcf.impliedRevenueCagrPct)}/yr implied 10Y growth, ` : ""}${formatCurrencyCompact(latest.trueFcf)} True FCF (${formatPct(latest.trueFcfMargin)} margin), ${formatPct(netDilutionCagr, true)}/yr share count trend, and SEC ${company.lastFiling.type} filing diffs.`;
  if (sectorNative) {
    description = `${company.name} (${company.ticker}): sector-specific valuation, ${formatPct(netDilutionCagr, true)}/yr share count trend, and SEC ${company.lastFiling.type} filing diffs.`;
  }

  if (view === "sbc") {
    title = `${company.ticker} Stock-Based Compensation, Dilution${sectorNative ? "" : " & True FCF"} | ${company.name}`;
    const sbc = `${company.name} (${company.ticker}) SBC is ${formatCurrencyCompact(latest.sbc)} (${formatPct(latest.sbcPctRevenue)} of revenue)`;
    description = sectorNative
      ? `${sbc}, with ${formatPct(netDilutionCagr, true)}/yr 4Y share change.`
      : `${sbc}, reducing headline FCF to ${formatCurrencyCompact(latest.trueFcf)} True FCF (${formatPct(latest.trueFcfMargin)} margin) with ${formatPct(netDilutionCagr, true)}/yr 4Y share change.`;
  } else if (view === "valuation") {
    title = `${company.ticker} ${reverseDcf ? "Reverse DCF & " : ""}5-Year Valuation Model | ${company.name}`;
    description = reverseDcf
      ? `At $${company.price.toFixed(2)}, Reverse DCF implies ${formatPct(reverseDcf.impliedRevenueCagrPct)}/yr 10-year revenue growth for ${company.name}.`
      : `Explore a 5-year valuation scenario for ${company.name} using SEC ${company.lastFiling.type} filings.`;
  } else if (view === "filings") {
    title = `${company.ticker} SEC 10-K/10-Q Filing Changes & Insider Trades | ${company.name}`;
    description = `Track ${company.name} (${company.ticker}) SEC ${company.lastFiling.type} prose diffs, Form 8-K material events, and Form 4 open-market insider purchases (latest filing ${company.lastFiling.date}).`;
  }

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
    },
  };
}

export async function renderTickerView(ticker: string, view: TickerWedgeView) {
  const company = await getCompanySnapshot(ticker);
  if (!company) notFound();

  const [insiderTrades, searchIndex] = await Promise.all([
    getInsiderTrades(company.ticker),
    getSearchIndex(),
  ]);

  const sectorBenchmark = getSectorBenchmark(company.sector, searchIndex);
  const sectorPeers = searchIndex
    .filter((c) => c.sector === company.sector && c.ticker !== company.ticker)
    .sort(
      (a, b) =>
        Math.abs(a.marketCap - company.marketCap) -
        Math.abs(b.marketCap - company.marketCap)
    )
    .slice(0, 5);

  const { latest, enterpriseValue, netDilutionCagr, reverseDcf } =
    computeCompanyValuation(company);
  const sectorNative = isFinancialInstitution(company);
  const latestFilingDiff = company.filingDiffs.find(
    (diff) => diff.accessionNumber === company.lastFiling.accessionNumber
  );

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      ...(reverseDcf
        ? [
            {
              "@type": "Question",
              name: `What growth rate is ${company.ticker} stock pricing in?`,
              acceptedAnswer: {
                "@type": "Answer",
                text: `At $${company.price.toFixed(2)} (${formatCurrencyCompact(enterpriseValue)} Enterprise Value), ${company.name} (${company.ticker}) is pricing in approximately ${formatPct(reverseDcf.impliedRevenueCagrPct)} annual revenue growth over the next 10 years under baseline Reverse DCF assumptions.`,
              },
            },
          ]
        : []),
      ...(!sectorNative ? [{
        "@type": "Question",
        name: `What is ${company.ticker}'s True Free Cash Flow after stock-based compensation?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${company.name} (${company.ticker}) generated ${formatCurrencyCompact(latest.trueFcf)} in True Free Cash Flow (${formatPct(latest.trueFcfMargin)} margin) after deducting ${formatCurrencyCompact(latest.sbc)} in stock-based compensation (${formatPct(latest.sbcPctRevenue)} of revenue). Over 4 years, diluted shares changed at ${formatPct(netDilutionCagr, true)}/yr.`,
        },
      }] : []),
      {
        "@type": "Question",
        name: `What changed in ${company.ticker}'s latest SEC filing?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: latestFilingDiff
            ? `${latestFilingDiff.headline}: ${latestFilingDiff.summary}`
            : `${company.name} last filed a ${company.lastFiling.type} on ${company.lastFiling.date}. Amber’s latest available financials show ${formatCurrencyCompact(latest.revenue)} in revenue${sectorNative ? "" : ` and ${formatCurrencyCompact(latest.trueFcf)} in True Free Cash Flow`}.`,
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
        initialTab={TAB_BY_WEDGE[view]}
      />
    </>
  );
}
