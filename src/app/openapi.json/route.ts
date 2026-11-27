import { NextResponse } from "next/server";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export function GET() {
  const versionHeaderParam = {
    name: "X-API-Version",
    in: "header",
    required: false,
    description: "Optional API version header (current: 1.0). Breaking changes are announced via RFC 8594 Deprecation and Sunset headers with at least 90 days notice.",
    schema: { type: "string", enum: ["1.0"], default: "1.0" },
  };

  const errorResponseRef = {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  };

  const rateLimitHeaders = {
    "X-API-Version": {
      description: "Active API version",
      schema: { type: "string", example: "1.0" },
    },
    "RateLimit-Policy": {
      description: "RFC RateLimit policy (requests per window in seconds)",
      schema: { type: "string", example: "120;w=60" },
    },
    "RateLimit-Limit": {
      description: "Maximum requests allowed in the current window",
      schema: { type: "integer", example: 120 },
    },
    "RateLimit-Remaining": {
      description: "Remaining requests in the current window",
      schema: { type: "integer", example: 119 },
    },
  };

  const spec = {
    openapi: "3.1.0",
    info: {
      title: `${SITE_NAME} Public Fundamental Data API`,
      version: "1.0.0",
      description: `${SITE_TAGLINE} Free, read-only, SEC EDGAR-verified JSON and Markdown endpoints for AI agents and researchers. Streamable HTTP MCP server available at ${SITE_URL}/api/mcp. Versioning & Deprecation Policy: versioned via the X-API-Version header (current 1.0); any breaking changes publish RFC 8594 Deprecation and Sunset headers at least 90 days before removal.`,
      contact: {
        name: "Amber Research",
        email: "research@amberstocks.com",
        url: `${SITE_URL}/contact`,
      },
    },
    servers: [{ url: SITE_URL, description: "Production (v1.0)" }],
    paths: {
      "/api/public/t/{ticker}": {
        get: {
          operationId: "getCompanyFundamentals",
          summary: "Get SEC-verified True FCF, SBC, Dilution, Reverse DCF, and Filing Diffs for a ticker",
          parameters: [
            { name: "ticker", in: "path", required: true, schema: { type: "string", example: "NVDA" } },
            {
              name: "format",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["json", "markdown"] },
            },
            versionHeaderParam,
          ],
          responses: {
            "200": {
              description: "Company fundamentals in JSON or text/markdown",
              headers: rateLimitHeaders,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CompanyFundamentalsResponse" },
                },
                "text/markdown": {
                  schema: { type: "string" },
                },
              },
            },
            "404": {
              description: "Ticker not found in Amber coverage",
              headers: rateLimitHeaders,
              content: errorResponseRef,
            },
            "500": {
              description: "Internal server error",
              content: errorResponseRef,
            },
          },
        },
      },
      "/api/public/screener": {
        get: {
          operationId: "screenCompanies",
          summary: "Screen 700+ Nasdaq/NYSE companies by True FCF, SBC, Dilution, Reverse DCF, Sector, or Lens",
          parameters: [
            { name: "lens", in: "query", schema: { type: "string" } },
            { name: "sector", in: "query", schema: { type: "string" } },
            { name: "minTrueFcfMargin", in: "query", schema: { type: "number" } },
            { name: "maxSbcPct", in: "query", schema: { type: "number" } },
            { name: "maxImpliedCagr", in: "query", schema: { type: "number" } },
            { name: "maxDilution", in: "query", schema: { type: "number" } },
            { name: "minMarketCapB", in: "query", schema: { type: "number" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 } },
            versionHeaderParam,
          ],
          responses: {
            "200": {
              description: "Ranked matching companies with canonical Amber URLs",
              headers: rateLimitHeaders,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ScreenerResponse" },
                },
              },
            },
            "400": {
              description: "Invalid screener filter parameter",
              headers: rateLimitHeaders,
              content: errorResponseRef,
            },
            "500": {
              description: "Internal server error",
              content: errorResponseRef,
            },
          },
        },
      },
      "/api/public/signals": {
        get: {
          operationId: "getRecentSignals",
          summary: "Get recent SEC 10-K/10-Q filing diffs and open-market Form 4 insider buys",
          parameters: [
            { name: "ticker", in: "query", schema: { type: "string" } },
            { name: "type", in: "query", schema: { type: "string", enum: ["all", "diffs", "insiders"] } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 } },
            versionHeaderParam,
          ],
          responses: {
            "200": {
              description: "Recent filing diffs and Form 4 open-market buys",
              headers: rateLimitHeaders,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SignalsResponse" },
                },
              },
            },
            "400": {
              description: "Invalid signal query parameter",
              headers: rateLimitHeaders,
              content: errorResponseRef,
            },
            "500": {
              description: "Internal server error",
              content: errorResponseRef,
            },
          },
        },
      },
    },
    components: {
      schemas: {
        ErrorResponse: {
          type: "object",
          required: ["code", "message"],
          properties: {
            code: { type: "string", example: "ticker_not_found" },
            error: { type: "string", example: "Ticker XYZ not found in Amber coverage." },
            message: { type: "string", example: "Ticker XYZ not found in Amber coverage." },
            resolution: { type: "string", example: "Query /api/public/screener to list covered tickers." },
          },
        },
        CompanyFundamentalsResponse: {
          type: "object",
          required: ["ticker", "name", "sector", "price", "market_cap_m", "urls", "attribution"],
          properties: {
            ticker: { type: "string", example: "NVDA" },
            name: { type: "string", example: "NVIDIA Corporation" },
            exchange: { type: "string", example: "Nasdaq" },
            sector: { type: "string", example: "Semiconductors" },
            cik: { type: "string" },
            price: { type: "number" },
            price_as_of: { type: ["string", "null"] },
            market_cap_m: { type: "number" },
            enterprise_value_m: { type: "number" },
            latest_period: { type: "object", additionalProperties: true },
            valuation: { type: "object", additionalProperties: true },
            annual_history: { type: "array", items: { type: "object", additionalProperties: true } },
            recent_filing_diffs: { type: "array", items: { type: "object", additionalProperties: true } },
            recent_insider_buys: { type: "array", items: { type: "object", additionalProperties: true } },
            urls: {
              type: "object",
              properties: {
                overview: { type: "string", format: "uri" },
                sbc: { type: "string", format: "uri" },
                valuation: { type: "string", format: "uri" },
                filings: { type: "string", format: "uri" },
              },
            },
            attribution: { type: "string" },
          },
        },
        ScreenerResponse: {
          type: "object",
          required: ["total_matches", "companies", "explore_url", "attribution"],
          properties: {
            total_matches: { type: "integer" },
            applied_filters: { type: "object", additionalProperties: true },
            companies: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ticker: { type: "string" },
                  name: { type: "string" },
                  sector: { type: "string" },
                  price: { type: "number" },
                  market_cap_m: { type: "number" },
                  true_fcf_margin_pct: { type: ["number", "null"] },
                  sbc_pct_revenue: { type: ["number", "null"] },
                  net_dilution_4y_cagr_pct: { type: ["number", "null"] },
                  implied_10y_rev_cagr_pct: { type: ["number", "null"] },
                  url: { type: "string", format: "uri" },
                },
              },
            },
            explore_url: { type: "string", format: "uri" },
            attribution: { type: "string" },
          },
        },
        SignalsResponse: {
          type: "object",
          required: ["filing_diffs", "insider_buys", "feed_url", "rss_url"],
          properties: {
            filing_diffs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  ticker: { type: "string" },
                  company_name: { type: "string" },
                  filing_type: { type: "string" },
                  filing_date: { type: "string" },
                  section: { type: "string" },
                  category: { type: "string" },
                  materiality: { type: "string" },
                  headline: { type: "string" },
                  summary: { type: "string" },
                  url: { type: "string", format: "uri" },
                },
              },
            },
            insider_buys: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  ticker: { type: "string" },
                  filing_date: { type: "string" },
                  insider_name: { type: "string" },
                  insider_title: { type: "string" },
                  shares: { type: "integer" },
                  price_per_share: { type: "number" },
                  total_value_m: { type: "number" },
                  url: { type: "string", format: "uri" },
                },
              },
            },
            feed_url: { type: "string", format: "uri" },
            rss_url: { type: "string", format: "uri" },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "X-API-Version": "1.0",
      "Cache-Control": "public, s-maxage=86400",
    },
  });
}
