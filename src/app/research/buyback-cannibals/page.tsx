import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { TopNav } from "@/components/TopNav";
import { SITE_URL } from "@/lib/site";

const title = "The buyback cannibals shrinking their share counts fastest";
const description = "Ten companies with the fastest sustained declines in diluted shares in Amber’s Buyback Cannibals screen, from fiscal 2021 through fiscal 2025.";
const canonical = `${SITE_URL}/research/buyback-cannibals`;
const chartPath = "/research/buyback-cannibals.png";
const chartAlt = "Annualized declines in diluted share counts from FY2021 to FY2025. Marathon Petroleum led at 16.78%, followed by MGM Resorts at 13.16%. The table provides all ten values.";
const published = "2026-11-27";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: {
    type: "article",
    title,
    description,
    url: canonical,
    publishedTime: published,
    images: [{ url: chartPath, width: 1600, height: 1600, alt: chartAlt }],
  },
  twitter: { card: "summary_large_image", title, description, images: [chartPath] },
};

const observations = [
  { ticker: "MPC", name: "Marathon Petroleum", start: "638M", end: "306M", annual: "−16.78%", total: "−52.0%" },
  { ticker: "MGM", name: "MGM Resorts", start: "487M", end: "277M", annual: "−13.16%", total: "−43.1%" },
  { ticker: "GM", name: "General Motors", start: "1,468M", end: "973M", annual: "−9.77%", total: "−33.7%" },
  { ticker: "DVA", name: "DaVita", start: "110M", end: "76M", annual: "−8.83%", total: "−30.9%" },
  { ticker: "EBAY", name: "eBay", start: "663M", end: "468M", annual: "−8.34%", total: "−29.4%" },
  { ticker: "IMO", name: "Imperial Oil", start: "713M", end: "504M", annual: "−8.31%", total: "−29.3%" },
  { ticker: "ARW", name: "Arrow Electronics", start: "73M", end: "52M", annual: "−8.13%", total: "−28.8%" },
  { ticker: "STLD", name: "Steel Dynamics", start: "207M", end: "148M", annual: "−8.05%", total: "−28.5%" },
  { ticker: "VST", name: "Vistra", start: "482M", end: "346M", annual: "−7.95%", total: "−28.2%" },
  { ticker: "HCA", name: "HCA Healthcare", start: "329M", end: "239M", annual: "−7.68%", total: "−27.4%" },
];

const filings = [
  { label: "Marathon FY2021 10-K", url: "https://www.sec.gov/Archives/edgar/data/1510295/000151029522000011/mpc-20211231.htm" },
  { label: "Marathon FY2025 10-K", url: "https://www.sec.gov/Archives/edgar/data/1510295/000151029526000009/mpc-20251231.htm" },
  { label: "GM FY2021 10-K", url: "https://www.sec.gov/Archives/edgar/data/1467858/000146785822000034/gm-20211231.htm" },
  { label: "GM FY2025 10-K", url: "https://www.sec.gov/Archives/edgar/data/1467858/000146785826000013/gm-20251231.htm" },
  { label: "MGM FY2021 10-K", url: "https://www.sec.gov/Archives/edgar/data/789570/000078957022000005/mgm-20211231.htm" },
  { label: "MGM FY2025 10-K", url: "https://www.sec.gov/Archives/edgar/data/789570/000078957026000018/mgm-20251231.htm" },
  { label: "Marathon Speedway sale announcement", url: "https://www.sec.gov/Archives/edgar/data/1510295/000151029521000078/ex991pressreleasemay14.htm" },
];
const medlineFiling = "https://www.sec.gov/Archives/edgar/data/2046386/000204638626000009/mdln-20251231.htm";

const researchLink = "font-medium text-[var(--amber)] underline decoration-[var(--amber-border)] underline-offset-4 hover:decoration-current";

export default function BuybackCannibalsStory() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="index" />
      <main className="mx-auto max-w-5xl px-4 pb-14 pt-10 sm:px-8 sm:pt-16">
        <article>
          <header className="max-w-3xl">
            <h1 className="text-3xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl">{title}</h1>
            <p className="mt-4 text-sm text-[var(--text-muted)]">
              Amber Research · <time dateTime={published}>November 27, 2026</time>
            </p>
            <p className="mt-6 max-w-[65ch] leading-7 text-[var(--text-secondary)]">
              Marathon Petroleum spent $3.4 billion repurchasing shares in fiscal 2025. General Motors spent $6.0 billion.
              Across the four years through fiscal 2025, Marathon’s weighted-average diluted share count fell{" "}
              <strong className="text-[var(--text-primary)]">52%</strong>, from 638 million to 306 million. GM’s fell{" "}
              <strong className="text-[var(--text-primary)]">34%</strong>, from about 1.47 billion to 973 million.
              Marathon led Amber’s ranking at 16.78% a year after excluding Medline’s IPO-year comparison.
            </p>
          </header>

          <figure className="mt-9 max-w-3xl">
            <a href={chartPath} className="block rounded-lg">
              <Image
                src={chartPath}
                alt={chartAlt}
                width={1600}
                height={1600}
                sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 831px) calc(100vw - 64px), 768px"
                className="h-auto w-full rounded-lg border border-[var(--border)]"
                priority
              />
            </a>
            <figcaption className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
              <span>FY2021–FY2025. Source: SEC EDGAR via Amber.</span>
              <a href={chartPath} download className={researchLink}>Download chart (PNG)</a>
            </figcaption>
          </figure>

          <div className="mt-8">
            <table aria-label="Diluted share count comparison" className="w-full border-collapse text-sm tabular-nums">
              <thead className="text-[var(--text-secondary)]">
                <tr className="border-y border-[var(--border)]">
                  <th scope="col" className="py-3 pr-2 text-left font-medium">Company</th>
                  <th scope="col" className="hidden px-2 py-3 text-right font-medium sm:table-cell">FY2021 shares</th>
                  <th scope="col" className="hidden px-2 py-3 text-right font-medium sm:table-cell">FY2025 shares</th>
                  <th scope="col" className="px-1 py-3 text-right font-medium sm:px-2">Annual change</th>
                  <th scope="col" className="px-1 py-3 text-right font-medium sm:px-2">Four-year change</th>
                </tr>
              </thead>
              <tbody>
                {observations.map(({ ticker, name, start, end, annual, total }) => (
                  <tr key={ticker} className="border-b border-[var(--border)]">
                    <th scope="row" className="py-3 pr-2 text-left font-medium">
                      <Link className={researchLink} href={`/t/${ticker}/sbc`}>{name}</Link>{" "}
                      <span className="text-xs font-normal text-[var(--text-muted)]">{ticker}</span>
                      <span className="mt-1 block text-xs font-normal leading-snug text-[var(--text-muted)] sm:hidden">
                        <span className="whitespace-nowrap">FY2021 {start}</span>{" → "}
                        <span className="whitespace-nowrap">FY2025 {end}</span>
                      </span>
                    </th>
                    <td className="hidden px-2 py-3 text-right sm:table-cell">{start}</td>
                    <td className="hidden px-2 py-3 text-right sm:table-cell">{end}</td>
                    <td className="px-1 py-3 text-right font-semibold sm:px-2">{annual}</td>
                    <td className="px-1 py-3 text-right sm:px-2">{total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-9 max-w-[65ch] space-y-5 leading-7 text-[var(--text-secondary)]">
            <p>
              All ten reported a lower weighted-average diluted share count in each of the four annual comparisons.
              MGM Resorts ranked second, falling from 487 million to 277 million. Marathon announced a $10 billion
              buyback plan after closing its $21 billion Speedway sale in 2021 and reported $11.6 billion of
              repurchases in 2023. A multi-year share count shows the cumulative effect of repurchases and
              share issuances spread across several years.
            </p>
            <h2 className="pt-3 text-xl font-semibold tracking-tight text-[var(--text-primary)]">How we measured it</h2>
            <p>
              Amber’s live <Link className={researchLink} href="/lenses/buyback-cannibals">Buyback Cannibals screen</Link>{" "}
              returned 194 matches on November 27, 2026. It requires at least $500 million in revenue, positive free cash
              flow after stock-based compensation, and an annualized diluted share-count decline of at least 1.5%.
              It excludes financial institutions and REITs.
            </p>
            <p>
              All ten companies shown have five full fiscal-year observations from FY2021 through FY2025.
              The ranking uses the compound annual change between the two endpoints, calculated from Amber’s share
              figures in millions. Weighted-average diluted shares are the denominator used for diluted EPS and
              reflect share issuances and potential dilution as well as buybacks.
            </p>
            <p>
              We excluded Medline, the raw screen’s top row. Its FY2025 filing calculates the weighted-average
              Class A count over the period following its December 2025 reorganization and IPO. That provides a
              different share base from the predecessor figures used earlier in Amber’s series.{" "}
              <a className={researchLink} href={medlineFiling}>Medline FY2025 10-K</a>
            </p>
            <h2 className="pt-3 text-xl font-semibold tracking-tight text-[var(--text-primary)]">Source filings</h2>
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {filings.map(({ label, url }) => (
                <li key={url}><a className={researchLink} href={url}>{label}</a></li>
              ))}
            </ul>
          </div>
        </article>
        <SiteFooter />
      </main>
    </div>
  );
}
