import { NextResponse } from "next/server";
import { getCompanySnapshot, getInsiderTradesForTickers, getSearchIndex } from "@/data/repository";
import { getPublicLensContext, getPublicSignals, isPublicSignalType } from "@/data/public-market";
import { MAX_COMPARE_TICKERS, toComparisonEntry } from "@/lib/compare";
import { mediaTypeQuality } from "@/lib/http-accept";
import {
  buildPublicCompanyPayload,
  formatCompanyMarkdown,
  parseAgentScreenerFilters,
  screenCompaniesForAgent,
} from "@/lib/agentic-data";
import { formatInsiderName, formatInsiderTitle } from "@/lib/insider-format";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const MCP_PROTOCOL_VERSION = "2025-03-26";

const TOOLS = [
  {
    name: "amber_get_company",
    description:
      "Get SEC EDGAR-verified fundamentals for a public US company: True Free Cash Flow (FCF minus Stock-Based Compensation), SBC % of revenue, 4-year share dilution, Reverse DCF implied 10-year revenue growth, balance sheet, recent 10-K/10-Q filing diffs, and Form 4 insider buys. Includes canonical Amber links.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: {
          type: "string",
          description: "Stock ticker symbol (e.g. NVDA, AAPL, MSFT, PLTR).",
        },
      },
      required: ["ticker"],
    },
  },
  {
    name: "amber_screen_companies",
    description:
      "Screen 720+ Nasdaq and NYSE companies by True Free Cash Flow margin, Stock-Based Compensation burden, 4-year net share dilution, Reverse DCF implied growth, sector, or curated Amber discovery lenses (cash-machines, buyback-cannibals, underpriced, rule-of-40, hidden-dilution, insider-buys, material-events).",
    inputSchema: {
      type: "object",
      properties: {
        lens: { type: "string", description: "Optional lens slug." },
        sector: { type: "string", description: "Optional sector name or slug (e.g. technology, healthcare)." },
        minTrueFcfMargin: { type: "number", description: "Minimum True FCF margin %." },
        maxSbcPct: { type: "number", description: "Maximum SBC % of revenue." },
        maxImpliedCagr: { type: "number", description: "Maximum priced-in 10Y revenue CAGR %." },
        maxDilution: { type: "number", description: "Maximum 4Y annual share count change % (negative = buybacks)." },
        minMarketCapB: { type: "number", description: "Minimum market cap in billions USD." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max companies to return (default 15)." },
      },
    },
  },
  {
    name: "amber_compare_companies",
    description:
      "Compare 2 to 5 public companies side-by-side on Market Cap, True FCF Margin, Stock-Based Compensation %, 4Y share dilution, and Reverse DCF priced-in growth, returning a shareable Amber comparison URL.",
    inputSchema: {
      type: "object",
      properties: {
        tickers: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          uniqueItems: true,
          maxItems: MAX_COMPARE_TICKERS,
          description: "Array of 2 to 5 ticker symbols.",
        },
      },
      required: ["tickers"],
    },
  },
  {
    name: "amber_get_recent_signals",
    description:
      "Fetch recent high-signal SEC 10-K/10-Q filing prose diffs, Form 8-K events, and open-market Form 4 insider purchases across the market or for a specific ticker.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Optional ticker to filter by." },
        type: {
          type: "string",
          enum: ["all", "diffs", "insiders"],
          description: "Signal category (default: all).",
        },
        limit: { type: "number", description: "Max items per category (1-25, default 10)." },
      },
    },
  },
];

type RpcId = string | number | null;
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };
const HTTP_HEADERS = { ...CORS_HEADERS, Vary: "Accept, Origin" };

function rpcOk(id: RpcId, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: RpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(SITE_URL).origin || origin === new URL(request.url).origin;
}

export function OPTIONS(request: Request) {
  if (!isAllowedOrigin(request)) return new Response(null, { status: 403, headers: HTTP_HEADERS });
  return new Response(null, {
    status: 204,
    headers: {
      ...HTTP_HEADERS,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id",
    },
  });
}

export function GET(request: Request) {
  if (!isAllowedOrigin(request)) return new Response(null, { status: 403, headers: HTTP_HEADERS });
  if (mediaTypeQuality(request.headers.get("accept"), "text/event-stream") > 0) {
    return new Response(null, { status: 405, headers: { ...HTTP_HEADERS, Allow: "POST, OPTIONS" } });
  }
  return NextResponse.json(
    {
      name: `${SITE_NAME} MCP Server`,
      protocolVersion: MCP_PROTOCOL_VERSION,
      transport: "streamable-http",
      endpoint: `${SITE_URL}/api/mcp`,
      documentation: `${SITE_URL}/llms.txt`,
      openapi: `${SITE_URL}/openapi.json`,
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    },
    { headers: { ...HTTP_HEADERS, "Cache-Control": "public, s-maxage=3600" } }
  );
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return new Response(null, { status: 403, headers: HTTP_HEADERS });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error: invalid JSON."), { status: 400, headers: HTTP_HEADERS });
  }

  if (Array.isArray(body) && !body.length) {
    return NextResponse.json(rpcError(null, -32600, "Invalid request."), { status: 400, headers: HTTP_HEADERS });
  }
  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map(handleMessage))).filter((reply) => reply !== undefined);
  return replies.length
    ? NextResponse.json(Array.isArray(body) ? replies : replies[0], { headers: HTTP_HEADERS })
    : new Response(null, { status: 202, headers: HTTP_HEADERS });
}

async function handleMessage(body: unknown) {
  if (!isRecord(body) || body.jsonrpc !== "2.0") return rpcError(null, -32600, "Invalid request.");
  const { id, method, params } = body;
  if (!(typeof id === "string" || typeof id === "number" || id === null || id === undefined)) {
    return rpcError(null, -32600, "Invalid request ID.");
  }
  if (typeof method !== "string") {
    if (id !== undefined && ("result" in body || "error" in body)) return;
    return rpcError(id ?? null, -32600, "Invalid request.");
  }
  if (id === undefined) return;

  try {
    return await callMethod(id, method, isRecord(params) ? params : undefined);
  } catch (error) {
    console.error("[amber-mcp] Request failed:", error);
    return rpcError(id, -32603, "Internal error.");
  }
}

async function callMethod(id: RpcId, method: string, params: Record<string, unknown> | undefined) {
  if (method === "initialize") {
    return rpcOk(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: {
        name: "amber-finance",
        version: "1.0.0",
      },
    });
  }

  if (method === "ping") {
    return rpcOk(id, {});
  }

  if (method === "tools/list") {
    return rpcOk(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const toolName = typeof params?.name === "string" ? params.name : "";
    const args = isRecord(params?.arguments) ? params.arguments : {};

    if (toolName === "amber_get_company") {
      const ticker = typeof args.ticker === "string" ? args.ticker.trim().toUpperCase() : "";
      if (!ticker) {
        return rpcError(id, -32602, "Missing required argument: ticker");
      }
      const company = await getCompanySnapshot(ticker);
      if (!company) {
        return rpcOk(id, {
          isError: true,
          content: [{ type: "text", text: `Ticker ${ticker} not found in Amber coverage.` }],
        });
      }
      const insiders = await getInsiderTradesForTickers([company.ticker], 5, true);
      const payload = buildPublicCompanyPayload(company, insiders);
      return rpcOk(id, {
        content: [{ type: "text", text: formatCompanyMarkdown(payload) }],
      });
    }

    if (toolName === "amber_screen_companies") {
      const parsed = parseAgentScreenerFilters((key) => args[key], "json");
      if ("error" in parsed) return rpcError(id, -32602, parsed.error);
      const { filters } = parsed;
      const [entries, lensContext] = await Promise.all([getSearchIndex(), getPublicLensContext(filters.lens)]);
      const result = screenCompaniesForAgent(entries, { limit: 15, ...filters }, lensContext);
      return rpcOk(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    }

    if (toolName === "amber_compare_companies") {
      const rawTickers = Array.isArray(args.tickers) ? args.tickers : [];
      if (rawTickers.length < 2 || rawTickers.length > MAX_COMPARE_TICKERS ||
          rawTickers.some((ticker) => typeof ticker !== "string" || !ticker.trim())) {
        return rpcError(id, -32602, `Provide 2 to ${MAX_COMPARE_TICKERS} ticker symbols.`);
      }
      const tickers = rawTickers.map((ticker: string) => ticker.trim().toUpperCase());
      if (new Set(tickers).size !== tickers.length) return rpcError(id, -32602, "Provide distinct tickers.");
      const entries = await getSearchIndex();
      const byTicker = new Map(entries.map((entry) => [entry.ticker, entry]));
      const missing = tickers.filter((ticker) => !byTicker.has(ticker));
      if (missing.length) return rpcError(id, -32602, `Ticker coverage unavailable for ${missing.join(", ")}.`);
      const matched = tickers.map((ticker) => toComparisonEntry(byTicker.get(ticker)!));
      const compareUrl = `${SITE_URL}/compare/${tickers.join("-vs-")}`;

      return rpcOk(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                compare_url: compareUrl,
                companies: matched.map((c) => ({
                  ticker: c.ticker,
                  name: c.name,
                  sector: c.sector,
                  market_cap_m: Math.round(c.marketCap),
                  true_fcf_margin_pct: c.trueFcfMargin,
                  sbc_pct_revenue: Number(c.sbcPctRevenue.toFixed(2)),
                  net_dilution_4y_cagr_pct: Number(c.netDilutionCagr.toFixed(2)),
                  implied_10y_revenue_cagr_pct: c.impliedCagr !== null ? Number(c.impliedCagr.toFixed(2)) : null,
                  url: `${SITE_URL}/t/${c.ticker}`,
                })),
              },
              null,
              2
            ),
          },
        ],
      });
    }

    if (toolName === "amber_get_recent_signals") {
      const ticker = typeof args.ticker === "string" ? args.ticker.trim().toUpperCase() : undefined;
      const type = args.type ?? "all";
      const limit = args.limit ?? 10;
      if (!isPublicSignalType(type) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 25) {
        return rpcError(id, -32602, "Select all, diffs, or insiders and a whole-number limit between 1 and 25.");
      }
      const { diffs, buys } = await getPublicSignals({ ticker, type, limit });

      return rpcOk(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                feed_url: `${SITE_URL}/feed`,
                filing_diffs: diffs.map((d) => ({
                  id: d.id,
                  ticker: d.ticker,
                  filing_type: d.filingType,
                  filing_date: d.filingDate,
                  materiality: d.materiality,
                  headline: d.headline,
                  summary: d.summary,
                  url: `${SITE_URL}/filings/${encodeURIComponent(d.id)}`,
                })),
                insider_buys: buys.map((i) => ({
                    ticker: i.ticker,
                    filing_date: i.filingDate,
                    insider_name: formatInsiderName(i.insiderName),
                    insider_title: formatInsiderTitle(i.insiderTitle),
                    total_value_m: Number(i.totalValue.toFixed(2)),
                    url: `${SITE_URL}/t/${i.ticker}/filings`,
                  })),
              },
              null,
              2
            ),
          },
        ],
      });
    }

    return rpcError(id, -32601, `Unknown tool: ${toolName}`);
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}
