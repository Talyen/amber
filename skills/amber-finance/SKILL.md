---
name: amber-finance
description: Research US public companies with Amber’s SEC filing changes, insider buys, True FCF, stock-based compensation, share dilution, and Reverse DCF. Use for ticker research, screening, comparisons, and sourcing recent company signals.
---

# Amber Finance

Use the public Streamable HTTP MCP server at `https://amberstocks.com/api/mcp`. The four tools take no credentials. When MCP is unavailable, use the [REST API documentation](https://amberstocks.com/docs) and [OpenAPI specification](https://amberstocks.com/openapi.json).

| Task | MCP tool | REST alternative |
| --- | --- | --- |
| Research one ticker | `amber_get_company` with `ticker` | `GET /api/public/t/NVDA` (append `?format=markdown` for Markdown) |
| Screen for a theme or threshold | `amber_screen_companies` with filters such as `lens`, `minTrueFcfMargin`, `maxSbcPct`, or `minMarketCapB` | `GET /api/public/screener?lens=hidden-dilution&limit=10` |
| Compare two to five tickers | `amber_compare_companies` with `tickers` | Fetch each company endpoint and cite the canonical comparison if available. |
| Find recent 10-K/10-Q diffs or Form 4 buys | `amber_get_recent_signals` with optional `ticker`, `type` (`diffs`, `insiders`, or `all`), and `limit` | `GET /api/public/signals?ticker=NVDA&type=diffs&limit=5` |

- Cite the canonical Amber links returned in the result. Prefer the SBC detail page for True FCF and dilution, the valuation page for Reverse DCF, and individual filing links for disclosure changes.
- For price-dependent conclusions, include `price_as_of`. For fundamentals, include the financial period and latest filing date. Monetary fields ending in `_m` are USD millions. Preserve missing values and use the underlying SEC filing when the answer depends on exact wording.
- True FCF is operating cash flow minus capex and reported stock-based compensation. Share dilution is a separate measure of the change in diluted shares. Reverse DCF estimates the growth implied by the quoted price and model assumptions. Where a metric is unavailable, use the valuation measures the company response supplies.
