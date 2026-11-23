import { NextResponse } from "next/server";

interface HeadlineItem {
  title: string;
  link: string;
  pubDate: string;
}

function decodeXml(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("tickers") ?? "NVDA,MSFT,AAPL,META,COST";
  const tickers = raw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-Z0-9.-]{1,10}$/.test(t))
    .slice(0, 10);

  if (tickers.length === 0) {
    return NextResponse.json({ items: [] });
  }

  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
      tickers.join(",")
    )}&region=US&lang=en-US`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AmberFinance/1.0)" },
      next: { revalidate: 900 },
    });

    if (!res.ok) {
      return NextResponse.json({ items: [] });
    }

    const xml = await res.text();
    const items: HeadlineItem[] = [];
    const seen = new Set<string>();
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
      const block = match[1];
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
      const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

      const title = titleMatch ? decodeXml(titleMatch[1]) : "";
      const link = linkMatch ? decodeXml(linkMatch[1]) : "";
      const pubDate = dateMatch ? decodeXml(dateMatch[1]) : "";

      if (title && link && !seen.has(title)) {
        seen.add(title);
        items.push({ title, link, pubDate });
      }
    }

    return NextResponse.json(
      { items },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      }
    );
  } catch {
    return NextResponse.json({ items: [] });
  }
}
