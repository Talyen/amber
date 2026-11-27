import { getCompanySnapshot, getInsiderTrades } from "@/data/repository";
import { formatCurrencyCompact } from "@/lib/finance";
import { formatInsiderName, formatInsiderTitle } from "@/lib/insider-format";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 3600;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const company = await getCompanySnapshot(ticker);
  if (!company) {
    return new Response("Ticker not found", { status: 404 });
  }
  const insiders = await getInsiderTrades(company.ticker);

  const items: Array<{
    title: string;
    link: string;
    guid: string;
    pubDate: string;
    description: string;
  }> = [];

  for (const d of company.filingDiffs.slice(0, 20)) {
    const pub = new Date(`${d.filingDate}T12:00:00Z`);
    items.push({
      title: `${d.filingType}: ${d.headline}`,
      link: `${SITE_URL}/filings/${encodeURIComponent(d.id)}`,
      guid: `${SITE_URL}/filings/${encodeURIComponent(d.id)}`,
      pubDate: Number.isFinite(pub.getTime()) ? pub.toUTCString() : new Date().toUTCString(),
      description: `${d.section} (${d.materiality}): ${d.summary}`,
    });
  }

  for (const t of insiders.slice(0, 15)) {
    const pub = new Date(`${t.filingDate}T12:00:00Z`);
    const name = formatInsiderName(t.insiderName);
    const title = formatInsiderTitle(t.insiderTitle);
    items.push({
      title: `Form 4 ${t.transactionType}: ${formatCurrencyCompact(t.totalValue)} by ${name}`,
      link: `${SITE_URL}/t/${company.ticker}/filings`,
      guid: `${SITE_URL}/t/${company.ticker}/filings#${encodeURIComponent(t.id)}`,
      pubDate: Number.isFinite(pub.getTime()) ? pub.toUTCString() : new Date().toUTCString(),
      description: `${name} (${title}) ${t.transactionType === "Buy" ? "bought" : "sold"} ${Math.round(t.shares).toLocaleString()} shares at $${t.pricePerShare.toFixed(2)}.`,
    });
  }

  items.sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${company.ticker} (${company.name}) — ${SITE_NAME} SEC Filings & Insiders`)}</title>
    <link>${escapeXml(`${SITE_URL}/t/${company.ticker}`)}</link>
    <atom:link href="${escapeXml(`${SITE_URL}/t/${company.ticker}/feed.xml`)}" rel="self" type="application/rss+xml" />
    <description>Automated SEC 10-K/10-Q prose diffs, Form 8-K events, and Form 4 insider transactions for ${escapeXml(company.name)} (${escapeXml(company.ticker)}).</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${escapeXml(item.pubDate)}</pubDate>
      <description>${escapeXml(item.description)}</description>
    </item>`
  )
  .join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
