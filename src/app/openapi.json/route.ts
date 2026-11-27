import { API_VERSION, REST_LIMIT, REST_WINDOW } from "@/lib/public-api";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 86400;

const string = { type: "string" };
const number = { type: "number" };
const integer = { type: "integer" };
const nullableNumber = { type: ["number", "null"] };
const date = { type: "string", format: "date" };
const uri = { type: "string", format: "uri" };
const nullableUri = { type: ["string", "null"], format: "uri" };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const array = (items: object) => ({ type: "array", items });
const fields = (properties: Record<string, object>) => ({
  type: "object", required: Object.keys(properties), properties,
});
const limit = { type: "integer", minimum: 1, maximum: 50, default: 20 };

const filingDiff = {
  id: string, filing_type: string, filing_date: date, section: string,
  category: string, materiality: string, headline: string, summary: string, url: uri,
};
const insiderBuy = {
  filing_date: date, insider_name: string, insider_title: string,
  shares: integer, price_per_share: number, total_value_m: number,
};
const companyMetrics = {
  sbc_pct_revenue: number, net_dilution_4y_cagr_pct: number,
  true_fcf_m: nullableNumber, true_fcf_margin_pct: nullableNumber,
  implied_10y_revenue_cagr_pct: nullableNumber,
};

const schemas = {
  ErrorResponse: fields({ code: string, error: string, message: string, resolution: string }),
  CompanyFundamentalsResponse: fields({
    ticker: string, name: string, exchange: string, sector: string, sector_slug: string, cik: string,
    price_usd: number, price_as_of: { type: ["string", "null"], format: "date" },
    market_cap_m: integer, enterprise_value_m: integer, cash_and_equiv_m: integer,
    total_debt_m: integer, net_cash_m: integer, latest_period: string,
    last_filing: fields({ type: string, date, accession_number: string }),
    metrics: fields({
      ...companyMetrics, revenue_m: integer, reported_fcf_m: nullableNumber,
      sbc_m: integer, diluted_shares_m: number,
    }),
    recent_filing_diffs: array(fields(filingDiff)),
    recent_insider_buys: array(fields(insiderBuy)),
    urls: fields({
      overview: uri, sbc_and_true_fcf: uri, valuation: uri, filings: uri, rss: uri,
      embed_sankey: nullableUri, embed_true_fcf: nullableUri,
    }),
    attribution: string,
  }),
  ScreenerResponse: fields({
    total_matches: integer, returned: integer,
    companies: array(fields({
      ticker: string, name: string, sector: string, market_cap_m: integer, ...companyMetrics, url: uri,
    })),
    explore_url: uri, attribution: string,
  }),
  SignalsResponse: fields({
    filing_diffs: array(fields({ ...filingDiff, ticker: string, company_name: string })),
    insider_buys: array(fields({ ...insiderBuy, id: string, ticker: string, url: uri })),
    feed_url: uri, rss_url: uri,
  }),
};

const responseHeaders = {
  "X-API-Version": { description: "Active version.", schema: { type: "string", const: API_VERSION } },
  "RateLimit-Policy": {
    description: "Shared quota for legacy and v1 public REST endpoints, per client IP.",
    schema: { type: "string", example: `public-api;q=${REST_LIMIT};w=${REST_WINDOW}` },
  },
  RateLimit: {
    description: "Remaining quota units (r) and seconds until the current window resets (t).",
    schema: { type: "string", example: "public-api;r=119;t=31" },
  },
  "RateLimit-Limit": { description: "Requests allowed per window.", schema: integer },
  "RateLimit-Remaining": { description: "Requests remaining in the window.", schema: integer },
  "RateLimit-Reset": { description: "Seconds until the window resets.", schema: integer },
};
const retryAfter = { "Retry-After": { description: "Seconds to wait before retrying.", schema: integer } };
const content = (name: string) => ({ "application/json": { schema: ref(name) } });
const error = (description: string, headers: object = responseHeaders) => ({
  description, headers, content: content("ErrorResponse"),
});
const version = {
  name: "X-API-Version", in: "header",
  description: "Optional compatibility header. Omit it or send 1.0 when requesting v1.",
  schema: { type: "string", enum: [API_VERSION], default: API_VERSION },
};
const query = (name: string, schema: object) => ({ name, in: "query", schema });

function responses(name: string, invalid: string, markdown = false) {
  return {
    "200": {
      description: "Successful response.",
      headers: responseHeaders,
      content: { ...content(name), ...(markdown && { "text/markdown": { schema: string } }) },
    },
    "400": error(invalid),
    "429": error("API quota exceeded.", { ...responseHeaders, ...retryAfter }),
    "500": error("Amber could not complete the request."),
    "503": error("Quota storage is temporarily unavailable.", { "X-API-Version": responseHeaders["X-API-Version"], ...retryAfter }),
  };
}

export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: `${SITE_NAME} Stock Screener and SEC Filings API`,
      version: "1.0.0",
      description: "Free, keyless, read-only US equity fundamentals, screening, and signals. Breaking contract changes use a new major version in the URL. Announced retirements use RFC 9745 Deprecation and RFC 8594 Sunset headers, with at least 90 days of notice.",
      contact: { name: "Amber Research", email: "research@amberstocks.com", url: `${SITE_URL}/contact` },
    },
    externalDocs: { description: "API quickstart, errors and deprecation policy", url: `${SITE_URL}/docs` },
    servers: [{ url: SITE_URL }],
    security: [],
    paths: {
      "/api/v1/t/{ticker}": {
        get: {
          operationId: "getCompanyFundamentals",
          summary: "Get company fundamentals, filing diffs and insider purchases",
          parameters: [
            { name: "ticker", in: "path", required: true, schema: { type: "string", example: "NVDA" } },
            query("format", { type: "string", enum: ["json", "markdown"] }),
            version,
          ],
          responses: {
            ...responses("CompanyFundamentalsResponse", "Unsupported API version.", true),
            "404": error("Ticker is outside Amber coverage."),
          },
        },
      },
      "/api/v1/screener": {
        get: {
          operationId: "screenCompanies",
          summary: "Screen companies by sector, lens, cash flow, dilution or valuation",
          parameters: [
            query("lens", string), query("sector", string),
            query("minTrueFcfMargin", number), query("maxSbcPct", number),
            query("maxImpliedCagr", number), query("maxDilution", number),
            query("minMarketCapB", number), query("limit", limit), version,
          ],
          responses: responses("ScreenerResponse", "Unsupported API version or invalid screener filter."),
        },
      },
      "/api/v1/signals": {
        get: {
          operationId: "getRecentSignals",
          summary: "Get recent 10-K and 10-Q filing diffs and open-market Form 4 purchases",
          parameters: [
            query("ticker", string), query("type", { type: "string", enum: ["all", "diffs", "insiders"], default: "all" }),
            query("limit", limit), version,
          ],
          responses: responses("SignalsResponse", "Unsupported API version or invalid signal query."),
        },
      },
    },
    components: { schemas },
  };

  return Response.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "X-API-Version": API_VERSION,
      "Cache-Control": "public, s-maxage=86400",
    },
  });
}
