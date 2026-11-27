import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { TopNav } from "@/components/TopNav";
import { SITE_URL } from "@/lib/site";

const title = "What happens to free cash flow after stock comp at three software giants?";
const description = "How stock-based compensation changes trailing free cash flow at CrowdStrike, Palo Alto Networks, and Palantir.";
const canonical = `${SITE_URL}/research/hidden-dilution`;
const chartPath = "/research/hidden-dilution.png";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: {
    type: "article",
    title,
    description,
    url: canonical,
    publishedTime: "2026-11-27",
    images: [{ url: chartPath, width: 1800, height: 982, alt: description }],
  },
  twitter: { card: "summary_large_image", title, description, images: [chartPath] },
};

const observations = [
  {
    ticker: "CRWD", name: "CrowdStrike", before: "$1.80B", sbc: "$1.32B", after: "$0.48B", share: "73%", margin: "8.3%",
    filing: "https://www.sec.gov/Archives/edgar/data/1535527/000153552726000038/0001535527-26-000038-index.htm",
  },
  {
    ticker: "PANW", name: "Palo Alto Networks", before: "$4.27B", sbc: "$2.00B", after: "$2.27B", share: "47%", margin: "18.2%",
    filing: "https://www.sec.gov/Archives/edgar/data/1327567/000132756726000033/0001327567-26-000033-index.htm",
  },
  {
    ticker: "PLTR", name: "Palantir", before: "$4.05B", sbc: "$0.98B", after: "$3.07B", share: "24%", margin: "42.2%",
    filing: "https://www.sec.gov/Archives/edgar/data/1321655/000132165526000048/0001321655-26-000048-index.htm",
  },
];

const researchLink = "font-medium text-[var(--amber)] underline decoration-[var(--amber-border)] underline-offset-4 hover:decoration-current";

export default function HiddenDilutionStory() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="index" />
      <main className="mx-auto max-w-5xl px-4 pb-14 pt-10 sm:px-8 sm:pt-16">
        <article>
          <header className="max-w-3xl">
            <h1 className="text-3xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl">{title}</h1>
            <p className="mt-4 text-sm text-[var(--text-muted)]">
              Amber Research · <time dateTime="2026-11-27">November 27, 2026</time>
            </p>
            <p className="mt-6 max-w-[65ch] leading-7 text-[var(--text-secondary)]">
              CrowdStrike generated <strong className="text-[var(--text-primary)]">$1.80 billion</strong> of trailing free cash flow
              and recorded <strong className="text-[var(--text-primary)]">$1.32 billion</strong> in stock-based compensation over the
              same period. After subtracting stock comp, $477 million remains, or 8.3% of revenue. Palo Alto Networks and
              Palantir pass the same screen, with different results.
            </p>
          </header>

          <figure className="mt-9">
            <a href={chartPath} className="block rounded-lg" aria-label="Open the full-size free cash flow chart">
              <Image
                src={chartPath}
                alt="Stock-based compensation accounted for 73% of free cash flow at CrowdStrike, 47% at Palo Alto Networks, and 24% at Palantir."
                width={1800}
                height={982}
                sizes="(max-width: 1024px) 94vw, 960px"
                className="h-auto w-full rounded-lg border border-[var(--border)]"
                priority
              />
            </a>
            <figcaption className="mt-2 text-sm text-[var(--text-muted)]">Trailing twelve months, using SEC EDGAR data via Amber.</figcaption>
          </figure>

          <div className="mt-8">
            <table aria-label="Free cash flow comparison" className="w-full border-collapse text-sm tabular-nums">
              <thead className="text-[var(--text-secondary)]">
                <tr className="border-y border-[var(--border)]">
                  <th scope="col" className="py-3 pr-2 text-left font-medium">Company</th>
                  <th scope="col" className="hidden px-2 py-3 text-right font-medium sm:table-cell">FCF before SBC</th>
                  <th scope="col" className="hidden px-2 py-3 text-right font-medium sm:table-cell">SBC</th>
                  <th scope="col" className="px-1 py-3 text-right font-medium sm:px-2">FCF after SBC</th>
                  <th scope="col" className="px-1 py-3 text-right font-medium sm:px-2">SBC / FCF</th>
                  <th scope="col" className="px-1 py-3 text-right font-medium sm:px-2">After-SBC margin</th>
                </tr>
              </thead>
              <tbody>
                {observations.map(({ ticker, name, before, sbc, after, share, margin }) => (
                  <tr key={ticker} className="border-b border-[var(--border)]">
                    <th scope="row" className="py-3 pr-2 text-left font-medium">
                      <Link className={researchLink} href={`/t/${ticker}/sbc`}>{name}</Link>
                      <span className="mt-1 block text-xs font-normal leading-snug text-[var(--text-muted)] sm:hidden">
                        {before} FCF before SBC<br />{sbc} SBC
                      </span>
                    </th>
                    <td className="hidden px-2 py-3 text-right sm:table-cell">{before}</td>
                    <td className="hidden px-2 py-3 text-right sm:table-cell">{sbc}</td>
                    <td className="px-1 py-3 text-right font-semibold sm:px-2">{after}</td>
                    <td className="px-1 py-3 text-right sm:px-2">{share}</td>
                    <td className="px-1 py-3 text-right sm:px-2">{margin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-9 max-w-[65ch] space-y-5 leading-7 text-[var(--text-secondary)]">
            <p>
              Palo Alto had the largest stock-comp expense in dollars. CrowdStrike had the largest expense relative to
              its cash flow. Palantir retained the highest after-SBC margin of the three while its diluted share count
              grew about 7.5% annually in Amber’s four-year comparison, versus 6.6% at Palo Alto and 2.5% at CrowdStrike.
              The after-SBC margin and the change in diluted shares answer different questions about the economics for each share.
            </p>
            <p>
              <Link className={researchLink} href="/compare/CRWD-vs-PANW-vs-PLTR">Compare the three companies in Amber</Link>
            </p>
            <h2 className="pt-3 text-xl font-semibold tracking-tight text-[var(--text-primary)]">How we measured it</h2>
            <p>
              The November 27 snapshot covers all three matches in Amber’s{" "}
              <Link className={researchLink} href="/lenses/hidden-dilution">Hidden Dilution screen</Link> worth at least $200 billion
              at the November 25 close. The screen uses SBC as a share of revenue. The table ranks the matches by SBC as
              a share of free cash flow. Figures cover the latest trailing twelve months available for each company.
            </p>
            <p>
              Amber calculates free cash flow as operating cash flow minus capital expenditures, then subtracts reported stock-based
              compensation to get True FCF. Stock comp is a noncash expense. Subtracting it shows how much of the cash flow is
              offset by the reported cost of equity compensation.
            </p>
            <ul aria-label="Source filings" className="flex flex-wrap gap-x-5 gap-y-1">
              {observations.map(({ ticker, name, filing }) => (
                <li key={ticker}><a className={researchLink} href={filing}>{name} 10-Q</a></li>
              ))}
            </ul>
          </div>
        </article>
        <SiteFooter />
      </main>
    </div>
  );
}
