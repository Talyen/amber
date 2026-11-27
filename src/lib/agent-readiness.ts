import { SITE_URL } from "./site";

export const AMBER_PRODUCT_TERMS = ["stock screener", "SEC filings", "fundamental stock research"];
export const AMBER_HOME_TITLE = "Amber Stock Screener & SEC Filings";

export const AGENT_DISCOVERY_LINKS = [
  '</llms.txt>; rel="describedby"; type="text/markdown"',
  '</openapi.json>; rel="service-desc"; type="application/json"',
  '</docs>; rel="service-doc"',
  '</api/mcp>; rel="service"; title="Amber MCP Server"',
].join(", ");

export const AMBER_HOME_MARKDOWN = `# ${AMBER_HOME_TITLE}

Amber is a free stock screener for fundamental research on US-listed companies. Search by ticker to read financial statements, compare stock-based compensation and dilution, and see the revenue growth implied by a company's current valuation.

- [Stock screener](${SITE_URL}/): Filter by sector, market capitalization, cash flow, or dilution.
- [SEC filings](${SITE_URL}/filings): Review changes to risk factors and management discussions, plus recent filing events.
- [Signal feed](${SITE_URL}/feed): Follow filing changes and open-market insider purchases.
- [Company comparisons](${SITE_URL}/compare): Compare up to five companies on the same financial metrics.
- [Amber developer portal](${SITE_URL}/developers): Start with REST or MCP using read-only company data.
- [Agent instructions](${SITE_URL}/llms.txt): Learn when to use Amber and which endpoint to call.
`;

export const AMBER_NOT_FOUND_MARKDOWN = `# 404 — Page not found

The requested page does not exist on Amber. Use the links below to find public pages or the correct API endpoint.

- [Sitemap](${SITE_URL}/sitemap.xml)
- [Amber API documentation](${SITE_URL}/docs)
- [Agent instructions](${SITE_URL}/llms.txt)
`;
