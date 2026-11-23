import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { arenaPositions, insiderTrades, userWatchlists } from "@/db/schema";
import { getSearchIndex } from "@/data/repository";
import type { SearchIndexEntry } from "@/data/universe";

export interface HeadlineItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  tickers: string[];
}

export interface TrendingTickerItem {
  ticker: string;
  name: string;
  reason: "Trending" | "Insider Buy" | "Most Watched" | "Recent Filing";
}

function decodeXml(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&apos;|&#39;|&#x27;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&lsquo;|&#8216;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
    .replace(/&mdash;|&#8212;|—/g, " - ")
    .replace(/&ndash;|&#8211;/g, "-")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s*·\s*/g, " | ")
    .trim();
}

// Tickers that are unmistakable even as standalone uppercase tokens in a headline
const UNMISTAKABLE_UPPER_TICKERS = new Set([
  "NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "GOOG", "TSLA", "PLTR", "AVGO",
  "NFLX", "AMD", "INTC", "QCOM", "ASML", "JPM", "BAC", "WFC", "AXP", "PYPL",
  "SOFI", "LLY", "ABBV", "MRNA", "VRTX", "SBUX", "CMG", "LULU", "XOM", "CVX",
  "SHEL", "ORCL", "CRWD", "PANW", "DDOG", "ADBE", "INTU", "WDAY", "HUBS",
  "DUOL", "RBLX", "RDDT", "ABNB", "BKNG", "DKNG", "CMCSA", "TMUS", "BABA",
  "MSTR", "SMCI", "CSCO", "IBM", "KLAC", "LRCX", "AMAT", "SNPS", "CDNS",
  "ANET", "FTNT", "VEEV", "CFLT", "GTLB", "TWLO", "DOCU", "OKTA", "MDB",
  "SNOW", "ZS", "MRVL", "NXPI", "MCHP", "ISRG", "DXCM", "PODD", "REGN",
  "GILD", "AMGN", "BIIB", "BMY", "SCHW", "MSCI", "SPGI", "FICO", "VRSK",
]);

// Generic first words of company names that must include the second word to avoid false matches
const GENERIC_FIRST_WORDS = new Set([
  "american", "bank", "first", "general", "global", "international", "national",
  "united", "western", "southern", "northern", "eastern", "pacific", "atlantic",
  "central", "digital", "advanced", "applied", "public", "republic", "standard",
  "universal", "premier", "select", "choice", "crown", "royal", "imperial",
  "liberty", "freedom", "enterprise", "consolidated", "associated", "allied",
  "fidelity", "citizens", "regions", "PNC", "us", "new", "old", "east", "west",
  "north", "south", "texas", "california", "new york",
]);

// Words that are too common in financial headlines to ever be used alone as a company brand match
const STOPWORD_BRANDS = new Set([
  "apple", // handled via custom rule below to avoid "apple of" idioms if needed, though Apple is safe
  "target", "gap", "visa", "block", "square", "match", "zoom", "box", "BILL",
  "bill", "nice", "fast", "five", "flex", "globe", "guardant", "brown", "waters",
  "jacobs", "ball", "pool", "rollins", "loews", "popular", "ally", "discover",
  "expand", "next", "open", "real", "step", "talk", "task", "true", "unit",
  "view", "well", "work", "on", "sea", "arm", "fox", "news",
]);

const EXPLICIT_BRAND_PATTERNS: Array<[RegExp, string]> = [
  [/\bnvidia\b/i, "NVDA"],
  [/\bapple\b/i, "AAPL"],
  [/\bmicrosoft\b/i, "MSFT"],
  [/\bamazon(?:\.com)?\b/i, "AMZN"],
  [/\b(?:alphabet|google)\b/i, "GOOGL"],
  [/\b(?:meta platforms|meta's|zuckerberg)\b/i, "META"],
  [/\btesla\b/i, "TSLA"],
  [/\bpalantir\b/i, "PLTR"],
  [/\bbroadcom\b/i, "AVGO"],
  [/\bnetflix\b/i, "NFLX"],
  [/\bmicron(?:\s+technology)?\b/i, "MU"],
  [/\b(?:advanced micro devices|amd)\b/i, "AMD"],
  [/\bintel\b/i, "INTC"],
  [/\bqualcomm\b/i, "QCOM"],
  [/\barm holdings\b/i, "ARM"],
  [/\basml\b/i, "ASML"],
  [/\bjpmorgan\b/i, "JPM"],
  [/\bgoldman sachs\b/i, "GS"],
  [/\bmorgan stanley\b/i, "MS"],
  [/\bbank of america\b/i, "BAC"],
  [/\bwells fargo\b/i, "WFC"],
  [/\bblackstone\b/i, "BX"],
  [/\bkkr\b/i, "KKR"],
  [/\bamerican express\b/i, "AXP"],
  [/\bvisa(?:\s+inc|\s+stock|\s+shares|\s+earnings|\s+network)?\b/i, "V"],
  [/\bmastercard\b/i, "MA"],
  [/\bpaypal\b/i, "PYPL"],
  [/\bcoinbase\b/i, "COIN"],
  [/\brobinhood\b/i, "HOOD"],
  [/\bsofi\b/i, "SOFI"],
  [/\beli lilly\b/i, "LLY"],
  [/\bunitedhealth\b/i, "UNH"],
  [/\belevance(?:\s+health)?\b/i, "ELV"],
  [/\bjohnson & johnson\b/i, "JNJ"],
  [/\babbvie\b/i, "ABBV"],
  [/\bmerck\b/i, "MRK"],
  [/\bpfizer\b/i, "PFE"],
  [/\bmoderna\b/i, "MRNA"],
  [/\bvertex pharmaceuticals\b/i, "VRTX"],
  [/\bhims & hers\b/i, "HIMS"],
  [/\bcostco\b/i, "COST"],
  [/\bwalmart\b/i, "WMT"],
  [/\bhome depot\b/i, "HD"],
  [/\blowe's\b/i, "LOW"],
  [/\btarget(?:\s+corp|\s+stock|\s+shares|\s+stores|\s+earnings)\b/i, "TGT"],
  [/\btjx(?:\s+companies)?\b/i, "TJX"],
  [/\bmcdonald's\b/i, "MCD"],
  [/\bstarbucks\b/i, "SBUX"],
  [/\bchipotle\b/i, "CMG"],
  [/\bcava(?:\s+group|\s+stock|\s+shares)?\b/i, "CAVA"],
  [/\bnike\b/i, "NKE"],
  [/\blululemon\b/i, "LULU"],
  [/\bcoca-cola\b/i, "KO"],
  [/\bpepsico\b/i, "PEP"],
  [/\bprocter & gamble\b/i, "PG"],
  [/\bexxon(?:\s*mobil)?\b/i, "XOM"],
  [/\bchevron\b/i, "CVX"],
  [/\bconocophillips\b/i, "COP"],
  [/\bshell(?:\s+plc|\s+stock|\s+shares|\s+oil)\b/i, "SHEL"],
  [/\bge vernova\b/i, "GEV"],
  [/\bvistra(?:\s+energy|\s+corp|\s+stock|\s+shares)?\b/i, "VST"],
  [/\bconstellation energy\b/i, "CEG"],
  [/\boracle\b/i, "ORCL"],
  [/\bsalesforce\b/i, "CRM"],
  [/\bsnowflake\b/i, "SNOW"],
  [/\bshopify\b/i, "SHOP"],
  [/\bcrowdstrike\b/i, "CRWD"],
  [/\bpalo alto networks\b/i, "PANW"],
  [/\bzscaler\b/i, "ZS"],
  [/\bcloudflare\b/i, "NET"],
  [/\bdatadog\b/i, "DDOG"],
  [/\bservicenow\b/i, "NOW"],
  [/\badobe\b/i, "ADBE"],
  [/\bintuit\b/i, "INTU"],
  [/\bworkday\b/i, "WDAY"],
  [/\batlassian\b/i, "TEAM"],
  [/\bhubspot\b/i, "HUBS"],
  [/\bakamai\b/i, "AKAM"],
  [/\bapplovin\b/i, "APP"],
  [/\btrade desk\b/i, "TTD"],
  [/\bduolingo\b/i, "DUOL"],
  [/\broblox\b/i, "RBLX"],
  [/\bspotify\b/i, "SPOT"],
  [/\breddit\b/i, "RDDT"],
  [/\buber\b/i, "UBER"],
  [/\bdoordash\b/i, "DASH"],
  [/\bairbnb\b/i, "ABNB"],
  [/\bbooking holdings\b/i, "BKNG"],
  [/\bdraftkings\b/i, "DKNG"],
  [/\b(?:walt\s+)?disney\b/i, "DIS"],
  [/\bcomcast\b/i, "CMCSA"],
  [/\bt-mobile\b/i, "TMUS"],
  [/\bverizon\b/i, "VZ"],
  [/\bat&t\b/i, "T"],
  [/\bboeing\b/i, "BA"],
  [/\bcaterpillar\b/i, "CAT"],
  [/\beaton(?:\s+corp)?\b/i, "ETN"],
  [/\bdeere(?:\s+&\s+co)?|\bjohn deere\b/i, "DE"],
  [/\balibaba\b/i, "BABA"],
  [/\bmicrostrategy\b/i, "MSTR"],
  [/\bsuper micro\b/i, "SMCI"],
  [/\bcisco\b/i, "CSCO"],
  [/\bibm\b/i, "IBM"],
  [/\bdell(?:\s+technologies)?\b/i, "DELL"],
  [/\bsandisk\b/i, "SNDK"],
  [/\bwestern digital\b/i, "WDC"],
  [/\bseagate\b/i, "STX"],
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBrandPhrase(rawName: string): string {
  const stripped = rawName
    .replace(
      /\b(Inc\.?|Corp\.?|Corporation|Company|Co\.?|Holdings?|Group|PLC|plc|Ltd\.?|Limited|N\.V\.|S\.A\.|S\.A\.B\. de C\.V\.|SE|LP|LLC|A\/S|Technologies|Technology|Pharmaceuticals|Therapeutics|Biosciences|International| Enterprises|Systems|Networks|Solutions|Platforms| Laboratories|Brands|Resources|Energy|Partners)\b/gi,
      " "
    )
    .replace(/[.,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = stripped.split(" ").filter(Boolean);
  if (words.length === 0) return rawName;
  if (words.length >= 2 && GENERIC_FIRST_WORDS.has(words[0].toLowerCase())) {
    return `${words[0]} ${words[1]}`;
  }
  return words[0];
}

function buildDynamicBrandMatchers(
  entries: SearchIndexEntry[]
): Array<[RegExp, string]> {
  const out: Array<[RegExp, string]> = [...EXPLICIT_BRAND_PATTERNS];
  const coveredTickers = new Set(EXPLICIT_BRAND_PATTERNS.map(([, t]) => t));

  for (const e of entries) {
    if (coveredTickers.has(e.ticker)) continue;
    const phrase = extractBrandPhrase(e.name);
    if (phrase.length < 4) continue;
    if (STOPWORD_BRANDS.has(phrase.toLowerCase())) continue;
    out.push([new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i"), e.ticker]);
  }
  return out;
}

function detectTickersInHeadline(
  title: string,
  validTickers: Set<string>,
  brandMatchers: Array<[RegExp, string]>
): string[] {
  const matched = new Set<string>();

  // 1. Match explicit brand names
  for (const [regex, ticker] of brandMatchers) {
    if (validTickers.has(ticker) && regex.test(title)) {
      matched.add(ticker);
    }
  }

  // 2. Match explicit ticker notation: $NVDA, (NVDA), (NASDAQ: NVDA), (NVDA.O), or "TICKER Stock / Shares"
  const explicitNotation = title.matchAll(
    /(?:\$([A-Z]{1,5})\b|\((?:NASDAQ|NYSE|AMEX)?\s*:?\s*([A-Z]{1,5})(?:\.[A-Z])?\)|\b([A-Z]{2,5})\s+(?:Stock|Shares)\b)/g
  );
  for (const m of explicitNotation) {
    const sym = (m[1] || m[2] || m[3] || "").toUpperCase();
    const norm = sym === "GOOG" ? "GOOGL" : sym;
    if (validTickers.has(norm)) matched.add(norm);
  }

  // 3. Match comma-separated ticker lists at the start of a headline (e.g. "NVDA, INTC, MU, AMD Chip Stocks...")
  const leadingListMatch = title.match(
    /^([A-Z]{2,5}(?:\s*,\s*[A-Z]{2,5})+)\b/
  );
  if (leadingListMatch) {
    for (const rawSym of leadingListMatch[1].split(",")) {
      const sym = rawSym.trim();
      const norm = sym === "GOOG" ? "GOOGL" : sym;
      if (validTickers.has(norm)) matched.add(norm);
    }
  }

  // 4. Match unmistakable multi-letter tickers (e.g. NVDA, MSFT, TSLA, PLTR)
  const upperTokens = title.match(/\b[A-Z]{3,5}\b/g) ?? [];
  for (const tok of upperTokens) {
    const norm = tok === "GOOG" ? "GOOGL" : tok;
    if (UNMISTAKABLE_UPPER_TICKERS.has(norm) && validTickers.has(norm)) {
      matched.add(norm);
    }
  }

  return [...matched].slice(0, 4);
}

function inferSourceFromUrl(link: string, fallback = "Yahoo Finance"): string {
  try {
    const host = new URL(link).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("reuters")) return "Reuters";
    if (host.includes("wsj.com")) return "WSJ";
    if (host.includes("bloomberg")) return "Bloomberg";
    if (host.includes("cnbc")) return "CNBC";
    if (host.includes("barrons")) return "Barron's";
    if (host.includes("marketwatch")) return "MarketWatch";
    if (host.includes("ft.com")) return "Financial Times";
    if (host.includes("seekingalpha")) return "Seeking Alpha";
    if (host.includes("fool.com")) return "Motley Fool";
    if (host.includes("investopedia")) return "Investopedia";
    if (host.includes("benzinga")) return "Benzinga";
    if (host.includes("thestreet")) return "TheStreet";
    if (host.includes("forbes")) return "Forbes";
    if (host.includes("fortune")) return "Fortune";
    if (host.includes("businessinsider")) return "Business Insider";
    if (host.includes("techcrunch")) return "TechCrunch";
    if (host.includes("theverge")) return "The Verge";
    if (host.includes("yahoo")) return "Yahoo Finance";
    return fallback;
  } catch {
    return fallback;
  }
}

async function fetchYahooRssBatch(
  tickers: string[],
  validSet: Set<string>,
  brandMatchers: Array<[RegExp, string]>
): Promise<HeadlineItem[]> {
  if (tickers.length === 0) return [];
  const requestedSet = new Set(tickers);
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
      tickers.join(",")
    )}&region=US&lang=en-US`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AmberFinance/1.0)" },
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const out: HeadlineItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null && out.length < 14) {
      const block = match[1];
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
      const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

      const title = titleMatch ? decodeXml(titleMatch[1]) : "";
      const link = linkMatch ? decodeXml(linkMatch[1]) : "";
      const pubDate = dateMatch ? decodeXml(dateMatch[1]) : "";
      const source = sourceMatch
        ? decodeXml(sourceMatch[1])
        : inferSourceFromUrl(link, "Yahoo Finance");

      if (!title || !link) continue;

      // Require the headline itself to genuinely mention at least one of the requested companies
      const detected = detectTickersInHeadline(title, validSet, brandMatchers);
      const relevant = detected.filter((t) => requestedSet.has(t));
      if (relevant.length === 0) continue;

      out.push({
        title,
        link,
        pubDate,
        source,
        tickers: detected,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchGoogleFinanceNewsRss(
  tickers: string[],
  byTicker: Map<string, SearchIndexEntry>,
  validSet: Set<string>,
  brandMatchers: Array<[RegExp, string]>
): Promise<HeadlineItem[]> {
  if (tickers.length === 0) return [];
  const requestedSet = new Set(tickers);
  try {
    // Build query terms combining brand names and tickers for high precision
    const terms = tickers.slice(0, 8).map((t) => {
      const entry = byTicker.get(t);
      const brand = entry ? extractBrandPhrase(entry.name) : "";
      if (brand && brand.length >= 4 && brand.toLowerCase() !== t.toLowerCase()) {
        return `"${brand}" OR ${t}`;
      }
      return `${t} stock`;
    });
    const whenWindow = tickers.length <= 2 ? "when:14d" : "when:3d";
    const query = `(${terms.join(" OR ")}) (stock OR shares OR earnings OR revenue) ${whenWindow}`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AmberFinance/1.0)" },
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const out: HeadlineItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null && out.length < 16) {
      const block = match[1];
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
      const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

      let title = titleMatch ? decodeXml(titleMatch[1]) : "";
      const link = linkMatch ? decodeXml(linkMatch[1]) : "";
      const pubDate = dateMatch ? decodeXml(dateMatch[1]) : "";
      const source = sourceMatch ? decodeXml(sourceMatch[1]) : "Financial News";

      // Strip trailing " - Publisher Name" from Google News titles
      if (source && title.endsWith(` - ${source}`)) {
        title = title.slice(0, -` - ${source}`.length).trim();
      } else {
        title = title.replace(/\s+-\s+[A-Za-z0-9 .,'&]+$/, "").trim();
      }

      if (!title || !link) continue;
      const detected = detectTickersInHeadline(title, validSet, brandMatchers);
      const relevant = detected.filter((t) => requestedSet.has(t));
      if (relevant.length === 0) continue;

      out.push({
        title,
        link,
        pubDate,
        source,
        tickers: detected,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function computeTrendingTickers(
  entries: SearchIndexEntry[]
): Promise<TrendingTickerItem[]> {
  const byTicker = new Map(entries.map((e) => [e.ticker, e]));
  const trending: TrendingTickerItem[] = [];
  const seen = new Set<string>();

  const pushIfValid = (
    rawSym: string,
    reason: TrendingTickerItem["reason"]
  ) => {
    const sym = rawSym === "GOOG" ? "GOOGL" : rawSym.toUpperCase();
    const entry = byTicker.get(sym);
    if (!entry || seen.has(sym)) return;
    seen.add(sym);
    trending.push({
      ticker: sym,
      name: entry.name,
      reason,
    });
  };

  // 1. Live Yahoo Finance US Market Trending Tickers
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/trending/US?count=25",
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 900 },
      }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        finance?: { result?: Array<{ quotes?: Array<{ symbol?: string }> }> };
      };
      const quotes = data.finance?.result?.[0]?.quotes ?? [];
      for (const q of quotes) {
        if (q.symbol) pushIfValid(q.symbol, "Trending");
        if (trending.length >= 6) break;
      }
    }
  } catch {
    // Fallback gracefully
  }

  // 2. Recent High-Value Open-Market Insider Buys & Community Watchlist/Arena Signals from Neon
  const db = getDb();
  if (db) {
    try {
      const [recentBuys, topWatched, topArena] = await Promise.all([
        db
          .select({ ticker: insiderTrades.ticker })
          .from(insiderTrades)
          .where(eq(insiderTrades.transactionType, "Buy"))
          .orderBy(desc(insiderTrades.filingDate), desc(insiderTrades.totalValue))
          .limit(12),
        db
          .select({
            ticker: userWatchlists.ticker,
            cnt: sql<number>`count(*)`,
          })
          .from(userWatchlists)
          .groupBy(userWatchlists.ticker)
          .orderBy(desc(sql`count(*)`))
          .limit(6),
        db
          .select({
            ticker: arenaPositions.ticker,
            cnt: sql<number>`count(*)`,
          })
          .from(arenaPositions)
          .groupBy(arenaPositions.ticker)
          .orderBy(desc(sql`count(*)`))
          .limit(6),
      ]);

      for (const b of recentBuys) {
        if (trending.length >= 9) break;
        pushIfValid(b.ticker, "Insider Buy");
      }
      for (const w of [...topWatched, ...topArena]) {
        if (trending.length >= 11) break;
        pushIfValid(w.ticker, "Most Watched");
      }
    } catch {
      // Fallback gracefully
    }
  }

  // 3. Guarantee at least 10 trending items using bellwethers
  const fallbacks = [
    "NVDA",
    "AAPL",
    "MSFT",
    "AMZN",
    "TSLA",
    "META",
    "PLTR",
    "GOOGL",
    "AMD",
    "AVGO",
    "JPM",
    "NFLX",
  ];
  for (const f of fallbacks) {
    if (trending.length >= 10) break;
    pushIfValid(f, "Trending");
  }

  return trending.slice(0, 10);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawTickers = searchParams.get("tickers");

  const entries = await getSearchIndex();
  const byTicker = new Map(entries.map((e) => [e.ticker, e]));
  const validSet = new Set(entries.map((e) => e.ticker));
  const brandMatchers = buildDynamicBrandMatchers(entries);
  const trending = await computeTrendingTickers(entries);

  let targetTickers: string[];
  if (rawTickers && rawTickers.trim().length > 0) {
    targetTickers = rawTickers
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => /^[A-Z0-9.-]{1,10}$/.test(t))
      .slice(0, 14);
  } else {
    const trendingSyms = trending.map((t) => t.ticker);
    const core = [
      "NVDA",
      "AAPL",
      "MSFT",
      "AMZN",
      "GOOGL",
      "META",
      "TSLA",
      "PLTR",
      "AMD",
      "AVGO",
      "JPM",
      "LLY",
      "NFLX",
      "XOM",
    ];
    targetTickers = [...new Set([...trendingSyms, ...core])].slice(0, 16);
  }

  if (targetTickers.length === 0) {
    return NextResponse.json({ items: [], trending });
  }

  const batchA = targetTickers.slice(0, 8);
  const batchB = targetTickers.slice(8, 16);

  const [yahooA, yahooB, googleNews] = await Promise.all([
    fetchYahooRssBatch(batchA, validSet, brandMatchers),
    batchB.length > 0
      ? fetchYahooRssBatch(batchB, validSet, brandMatchers)
      : Promise.resolve([]),
    fetchGoogleFinanceNewsRss(targetTickers, byTicker, validSet, brandMatchers),
  ]);

  // Deduplicate by normalized title prefix and sort newest first
  const seenKeys = new Set<string>();
  const merged: HeadlineItem[] = [];

  for (const item of [...googleNews, ...yahooA, ...yahooB]) {
    const normKey = item.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 55);
    if (!normKey || seenKeys.has(normKey)) continue;
    seenKeys.add(normKey);
    merged.push(item);
  }

  merged.sort((a, b) => {
    const ta = Date.parse(a.pubDate);
    const tb = Date.parse(b.pubDate);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
    return 0;
  });

  return NextResponse.json(
    {
      items: merged.slice(0, 20),
      trending,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    }
  );
}
