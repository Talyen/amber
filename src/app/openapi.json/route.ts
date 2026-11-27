import { NextResponse } from "next/server";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: `${SITE_NAME} Public Fundamental Data API`,
      version: "1.0.0",
      description: `${SITE_TAGLINE} Free, read-only, SEC EDGAR-verified JSON and Markdown endpoints for AI agents and researchers. Streamable HTTP MCP server available at ${SITE_URL}/api/mcp.`,
    },
    servers: [{ url: SITE_URL }],
    paths: {
      "/api/public/t/{ticker}": {
        get: {
          operationId: "getCompanyFundamentals",
          summary: "Get SEC-verified True FCF, SBC, Dilution, Reverse DCF, and Filing Diffs for a ticker",
          parameters: [
            { name: "ticker", in: "path", required: true, schema: { type: "string" } },
            {
              name: "format",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["json", "markdown"] },
            },
          ],
          responses: {
            "200": { description: "Company fundamentals in JSON or text/markdown" },
            "404": { description: "Ticker not found" },
          },
        },
      },
      "/api/public/screener": {
        get: {
          operationId: "screenCompanies",
          summary: "Screen 720+ Nasdaq/NYSE companies by True FCF, SBC, Dilution, Reverse DCF, Sector, or Lens",
          parameters: [
            { name: "lens", in: "query", schema: { type: "string" } },
            { name: "sector", in: "query", schema: { type: "string" } },
            { name: "minTrueFcfMargin", in: "query", schema: { type: "number" } },
            { name: "maxSbcPct", in: "query", schema: { type: "number" } },
            { name: "maxImpliedCagr", in: "query", schema: { type: "number" } },
            { name: "maxDilution", in: "query", schema: { type: "number" } },
            { name: "minMarketCapB", in: "query", schema: { type: "number" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 } },
          ],
          responses: {
            "200": { description: "Ranked matching companies with canonical Amber URLs" },
            "400": { description: "Invalid screener filter" },
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
          ],
          responses: {
            "200": { description: "Recent filing diffs and Form 4 open-market buys" },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=86400",
    },
  });
}
