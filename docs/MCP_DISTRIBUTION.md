# Amber MCP distribution

Amber’s public server uses Streamable HTTP at `https://amberstocks.com/api/mcp` and requires no sign-in. The [registry manifest](../server.json) uses the `com.amberstocks` namespace. Official publication uses proof of control for `amberstocks.com` as described in the [registry authentication guide](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx).

Validate the manifest with `mcp-publisher validate server.json`. After publication, verify that [the Official MCP Registry](https://registry.modelcontextprotocol.io/) returns `com.amberstocks/amber-finance` with the correct endpoint and current version. Use the same identity and endpoint for any follow-on directory submission. The companion [Amber Finance skill](../skills/amber-finance/SKILL.md) lives in the public repository’s `skills/amber-finance` directory when merged.

Use **Amber Finance** as the display name and “SEC filings, stock-based compensation, cash flow, and valuation data for US companies” as the short description. The docs URL is `https://amberstocks.com/mcp` and the source repository is `https://github.com/Talyen/amber`. Check [Glama](https://glama.ai/mcp/faq) for its automatic import after official publication. Verify discovery separately in [Smithery](https://smithery.ai/) and [PulseMCP](https://www.pulsemcp.com/).

## Client compatibility

| Client | Setup |
| --- | --- |
| Claude Desktop | In Customize → Connectors, add a custom connector named **Amber Finance** with the endpoint URL and choose **No sign in**. [Claude instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) |
| Cursor | Add `{"mcpServers":{"amber-finance":{"url":"https://amberstocks.com/api/mcp"}}}` to the project’s `.cursor/mcp.json` or merge the entry into an existing file. The CLI can discover tools with `agent mcp list-tools amber-finance`. [Cursor instructions](https://cursor.com/docs/mcp) |
| Antigravity | Use **Manage MCP Servers** or the workspace MCP configuration and add `{"mcpServers":{"amber-finance":{"serverUrl":"https://amberstocks.com/api/mcp"}}}`. [Antigravity instructions](https://antigravity.google/docs/mcp) |

For a client smoke test, run `amber_get_company` for NVDA, `amber_screen_companies` with `limit: 1`, `amber_compare_companies` for NVDA and MSFT, and `amber_get_recent_signals` with `limit: 1`. Each result should contain a clickable link under `https://amberstocks.com/`.

On November 27, 2026, all four calls succeeded in Antigravity CLI 1.5.18 and against the public endpoint directly. Cursor CLI 2026.11.22 discovered all four tool schemas in an isolated workspace. Full Cursor and Claude Desktop tests require signed-in accounts.
