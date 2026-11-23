import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { arenaPositions, insiderTrades, userWatchlists } from "@/db/schema";
import { getSearchIndex } from "@/data/repository";

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

// Common English words that happen to be valid stock tickers (require $ prefix or company name match)
const AMBIGUOUS_TICKERS = new Set([
  "A", "ALL", "AME", "AMP", "AN", "APP", "ARE", "ARM", "ash", "AT", "BALL",
  "BILL", "BOX", "BRO", "C", "CAT", "CF", "CG", "COKE", "COP", "COST", "D",
  "DAY", "DE", "DECK", "DG", "DIS", "DO", "DOC", "DOW", "E", "EAT", "ELF",
  "ES", "ET", "EW", "EXC", "EXP", "F", "FAST", "FI", "FIT", "FIVE", "FIX",
  "FLEX", "FLOW", "FORM", "FOX", "G", "GAP", "GE", "GEN", "GH", "GLOB", "GM",
  "GO", "GOLD", "HAL", "HAS", "HD", "HE", "HES", "HIMS", "HON", "HOOD", "HP",
  "I", "ICE", "II", "IN", "IOT", "IP", "IR", "IT", "ITT", "J", "K", "KEY",
  "KEYS", "KMI", "KO", "L", "KEYS", "LEN", "LIN", "LINE", "LIVE", "LO",
  "LOW", "LULU", "M", "MA", "MAIN", "MAN", "MAR", "MAS", "MAT", "MED",
  "MET", "MGM", "MID", "MNDY", "MO", "MOH", "MP", "MS", "MT", "MU", "N",
  "NET", "NEW", "NEXT", "NICE", "NKE", "NOW", "NU", "O", "ODFL", "ON",
  "ONE", "ONTO", "OPEN", "OR", "OUT", "OWL", "P", "PATH", "PAY", "PEG",
  "PEP", "PG", "PH", "PINS", "PKG", "PLAY", "PLUS", "PM", "POOL", "POST",
  "PPG", "PR", "PSA", "PTC", "PWR", "Q", "R", "RE", "REAL", "REG", "RF",
  "RH", "RIO", "RL", "ROAD", "ROCK", "ROL", "ROLL", "ROP", "ROST", "RS",
  "RUN", "RYAN", "S", "SAFE", "SAIA", "SAVE", "SE", "SEE", "SHOP", "SITE",
  "SK", "SM", "SNAP", "SNOW", "SO", "SON", "SPOT", "ST", "STAY", "STE",
  "STEP", "STT", "STZ", "SYM", "T", "TALK", "TAP", "TASK", "TD", "TE",
  "TECH", "TEL", "TER", "TEX", "TGT", "THC", "TM", "TOL", "TOST", "TPG",
  "TPL", "TR", "TRUE", "TT", "TTC", "TTD", "TXT", "U", "UBER", "UGI",
  "ULTA", "UNIT", "UNP", "UPS", "URI", "US", "V", "VICI", "VIEW", "VRSK",
  "VST", "VZ", "W", "WAT", "WAY", "WEC", "WELL", "WES", "WEX", "WM",
  "WMT", "WORK", "WP", "WPP", "WRB", "WSM", "WST", "WY", "X", "XYZ",
  "YUM", "Z", "ZS",
]);

const BRAND_KEYWORDS: Array<[RegExp, string]> = [
  [/\bnvidia\b/i, "NVDA"],
  [/\bapple\b/i, "AAPL"],
  [/\bmicrosoft\b/i, "MSFT"],
  [/\bamazon\b/i, "AMZN"],
  [/\b(alphabet|google)\b/i, "GOOGL"],
  [/\bmeta platforms|\bmeta's\b|\bzuckerberg\b/i, "META"],
  [/\btesla\b/i, "TSLA"],
  [/\bpalantir\b/i, "PLTR"],
  [/\bbroadcom\b/i, "AVGO"],
  [/\bnetflix\b/i, "NFLX"],
  [/\bmicron\b/i, "MU"],
  [/\b(advanced micro devices|\bamd\b)/i, "AMD"],
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
  [/\bamerican express\b/i, "AXP"],
  [/\bvisa\b/i, "V"],
  [/\bmastercard\b/i, "MA"],
  [/\bpaypal\b/i, "PYPL"],
  [/\bcoinbase\b/i, "COIN"],
  [/\brobinhood\b/i, "HOOD"],
  [/\bsofi\b/i, "SOFI"],
  [/\beli lilly\b/i, "LLY"],
  [/\bunitedhealth\b/i, "UNH"],
  [/\bjohnson & johnson\b/i, "JNJ"],
  [/\babbvie\b/i, "ABBV"],
  [/\bmerck\b/i, "MRK"],
  [/\bpfizer\b/i, "PFE"],
  [/\bmoderna\b/i, "MRNA"],
  [/\bvertex pharma/i, "VRTX"],
  [/\bhims & hers\b/i, "HIMS"],
  [/\bcostco\b/i, "COST"],
  [/\bwalmart\b/i, "WMT"],
  [/\bhome depot\b/i, "HD"],
  [/\blowe's\b/i, "LOW"],
  [/\btarget\b/i, "TGT"],
  [/\bmcdonald's\b/i, "MCD"],
  [/\bstarbucks\b/i, "SBUX"],
  [/\bchipotle\b/i, "CMG"],
  [/\bcava\b/i, "CAVA"],
  [/\bnike\b/i, "NKE"],
  [/\blululemon\b/i, "LULU"],
  [/\bcoca-cola\b/i, "KO"],
  [/\bpepsico|\bpepsi\b/i, "PEP"],
  [/\bprocter & gamble\b/i, "PG"],
  [/\bexxon\b/i, "XOM"],
  [/\bchevron\b/i, "CVX"],
  [/\bconocophillips\b/i, "COP"],
  [/\bshell\b/i, "SHEL"],
  [/\bge vernova\b/i, "GEV"],
  [/\bvistra\b/i, "VST"],
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
  [/\bdisney\b/i, "DIS"],
  [/\bcomcast\b/i, "CMCSA"],
  [/\bt-mobile\b/i, "TMUS"],
  [/\bverizon\b/i, "VZ"],
  [/\bat&t\b/i, "T"],
  [/\bboeing\b/i, "BA"],
  [/\bcaterpillar\b/i, "CAT"],
  [/\bdeere\b/i, "DE"],
  [/\balibaba\b/i, "BABA"],
  [/\bmicrostrategy|\bstrategy's\b/i, "MSTR"],
  [/\bsuper micro\b/i, "SMCI"],
  [/\bcisco\b/i, "CSCO"],
  [/\bibm\b/i, "IBM"],
];

function detectTickersInHeadline(
  title: string,
  validTickers: Set<string>,
  hintTickers: string[] = []
): string[] {
  const matched = new Set<string>();

  // 1. Match explicit brand names
  for (const [regex, ticker] of BRAND_KEYWORDS) {
    if (validTickers.has(ticker) && regex.test(title)) {
      matched.add(ticker);
    }
  }

  // 2. Match explicit $TICKER cashtags or (TICKER) / (NASDAQ: TICKER)
  const cashtagMatches = title.matchAll(
    /(?:\$([A-Z]{1,5})\b|\((?:NASDAQ|NYSE|AMEX)?\s*:?\s*([A-Z]{1,5})\))/g
  );
  for (const m of cashtagMatches) {
    const sym = (m[1] || m[2] || "").toUpperCase();
    if (validTickers.has(sym)) matched.add(sym);
  }

  // 3. Match unambiguous uppercase tickers directly in the headline
  const upperTokens = title.match(/\b[A-Z]{2,5}\b/g) ?? [];
  for (const tok of upperTokens) {
    if (validTickers.has(tok) && !AMBIGUOUS_TICKERS.has(tok)) {
      matched.add(tok);
    }
  }

  // 4. If queried for a single specific ticker and nothing matched yet, attach that ticker
  if (matched.size === 0 && hintTickers.length === 1 && validTickers.has(hintTickers[0])) {
    matched.add(hintTickers[0]);
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
  validSet: Set<string>
): Promise<HeadlineItem[]> {
  if (tickers.length === 0) return [];
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

      if (title && link) {
        out.push({
          title,
          link,
          pubDate,
          source,
          tickers: detectTickersInHeadline(title, validSet, tickers),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchGoogleFinanceNewsRss(
  tickers: string[],
  validSet: Set<string>,
  isMarketScope: boolean
): Promise<HeadlineItem[]> {
  try {
    const query = isMarketScope
      ? `(${tickers.slice(0, 10).join(" OR ")}) (stock OR earnings OR shares OR revenue) when:2d`
      : `(${tickers.slice(0, 8).join(" OR ")}) stock when:4d`;
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

    while ((match = itemRegex.exec(xml)) !== null && out.length < 14) {
      const block = match[1];
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
      const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

      let title = titleMatch ? decodeXml(titleMatch[1]) : "";
      const link = linkMatch ? decodeXml(linkMatch[1]) : "";
      const pubDate = dateMatch ? decodeXml(dateMatch[1]) : "";
      const source = sourceMatch ? decodeXml(sourceMatch[1]) : "Financial News";

      // Google News appends " - Publisher Name" at the end of <title>; strip it cleanly
      if (source && title.endsWith(` - ${source}`)) {
        title = title.slice(0, -` - ${source}`.length).trim();
      } else {
        title = title.replace(/\s+-\s+[A-Za-z0-9 .,'&]+$/, "").trim();
      }

      if (!title || !link) continue;
      const detected = detectTickersInHeadline(title, validSet, tickers);
      if (isMarketScope && detected.length === 0) continue;

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
  entries: Awaited<ReturnType<typeof getSearchIndex>>
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

  // 3. Guarantee at least 10 trending items using recent SEC filers & bellwethers
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
  const scope = searchParams.get("scope") ?? (rawTickers ? "custom" : "market");

  const entries = await getSearchIndex();
  const validSet = new Set(entries.map((e) => e.ticker));
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
  const isMarketScope = scope === "market";

  const [yahooA, yahooB, googleNews] = await Promise.all([
    fetchYahooRssBatch(batchA, validSet),
    batchB.length > 0 ? fetchYahooRssBatch(batchB, validSet) : Promise.resolve([]),
    fetchGoogleFinanceNewsRss(targetTickers, validSet, isMarketScope),
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
