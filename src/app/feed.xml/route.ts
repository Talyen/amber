import { getRecentFilingDiffs, getRecentMarketInsiders } from "@/data/repository";
import { formatCurrencyCompact } from "@/lib/finance";
import { formatInsiderName, formatInsiderTitle } from "@/lib/insider-format";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 1800;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const [diffs, insiders] = await Promise.all([
    getRecentFilingDiffs(35),
    getRecentMarketInsiders(),
  ]);

  const items: Array<{
    title: string;
    link: string;
    guid: string;
    pubDate: string;
    description: string;
    category: string;
  }> = [];

  for (const d of diffs.slice(0, 30)) {
    const pub = new Date(`${d.filingDate}T12:00:00Z`);
    items.push({
      title: `[${d.ticker}] ${d.filingType}: ${d.headline}`,
      link: `${SITE_URL}/filings/${encodeURIComponent(d.id)}`,
      guid: `${SITE_URL}/filings/${encodeURIComponent(d.id)}`,
      pubDate: Number.isFinite(pub.getTime()) ? pub.toUTCString() : new Date().toUTCString(),
      description: `${d.companyName} (${d.ticker}) ${d.filingType} (${d.section} · ${d.materiality}): ${d.summary}`,
      category: d.category,
    });
  }

  for (const b of insiders.filter((i) => i.transactionType === "Buy" && i.totalValue >= 0.5).slice(0, 20)) {
    const pub = new Date(`${b.filingDate}T12:00:00Z`);
    const name = formatInsiderName(b.insiderName);
    const title = formatInsiderTitle(b.insiderTitle);
    items.push({
      title: `[${b.ticker}] Insider Buy: ${formatCurrencyCompact(b.totalValue)} by ${name}`,
      link: `${SITE_URL}/t/${b.ticker}/filings`,
      guid: `${SITE_URL}/t/${b.ticker}/filings#${encodeURIComponent(b.id)}`,
      pubDate: Number.isFinite(pub.getTime()) ? pub.toUTCString() : new Date().toUTCString(),
      description: `${name} (${title}) purchased ${Math.round(b.shares).toLocaleString()} shares of ${b.ticker} at $${b.pricePerShare.toFixed(2)} (${formatCurrencyCompact(b.totalValue)}) via SEC Form 4.`,
      category: "Insider Buy",
    });
  }

  items.sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)} — SEC Filing Diffs &amp; Insider Buys</title>
    <link>${escapeXml(`${SITE_URL}/feed`)}</link>
    <atom:link href="${escapeXml(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml" />
    <description>High-signal SEC 10-K/10-Q prose diffs, Form 8-K events, and open-market Form 4 insider purchases across 720+ Nasdaq and NYSE companies.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items
  .slice(0, 40)
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${escapeXml(item.pubDate)}</pubDate>
      <category>${escapeXml(item.category)}</category>
      <description>${escapeXml(item.description)}</description>
    </item>`
  )
  .join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
