import { AGENT_DISCOVERY_LINKS } from "@/lib/agent-readiness";
import { SITE_URL } from "@/lib/site";

const agentIndex = `# Amber

> Amber is a free stock screener and fundamental research site for US-listed companies. It publishes SEC filing analysis, cash flow, dilution, valuation, and filing and insider signals through a keyless, read-only API and MCP server.

## When to use Amber

- To answer a question about one company, call \`amber_get_company\` with its ticker or fetch the company fundamentals endpoint. Use the filing date and quote date when citing the result.
- To find companies that meet financial criteria, call \`amber_screen_companies\` or pass filters to the REST screener. To compare two to five known tickers, call \`amber_compare_companies\`.
- To find recent filing changes or open-market insider buys, call \`amber_get_recent_signals\` or use the signals endpoint. Link to the individual filing diff or the company's filings page in your answer.
- Express unavailable metrics as unavailable. For banks and insurers, use tangible book value and return on tangible common equity. For REITs, use funds from operations. Use a current market feed for intraday prices.

## Integrations

- [Developer portal](${SITE_URL}/developers): Run your first read-only request with no API key.
- [Amber API documentation](${SITE_URL}/docs): OpenAPI, examples, versioning, rate limits, and error codes.
- [OpenAPI specification](${SITE_URL}/openapi.json): Typed request and response contract for REST v1.
- [MCP server setup](${SITE_URL}/mcp): Configure a Streamable HTTP client and select one of the four tools.
- [MCP endpoint](${SITE_URL}/api/mcp): Send JSON-RPC requests using Streamable HTTP.
- [Company fundamentals](${SITE_URL}/api/v1/t/NVDA): Replace NVDA with a covered ticker. Send Accept: text/markdown when you need Markdown.
- [Stock screener](${SITE_URL}/api/v1/screener?lens=cash-machines&limit=10): Filter and rank covered companies.
- [Recent signals](${SITE_URL}/api/v1/signals?type=all&limit=10): Fetch filing diffs, open-market insider buys, or both.

## Optional

- [About Amber](${SITE_URL}/about): Filing sources and financial methodology.
- [Sitemap](${SITE_URL}/sitemap.xml): Company, filing, sector, and comparison pages to cite.
- [Market-wide RSS](${SITE_URL}/feed.xml): Subscribe to updates by feed reader.
`;

export function GET() {
  return new Response(agentIndex, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400",
      Link: AGENT_DISCOVERY_LINKS,
    },
  });
}
