# Amber Post-Launch Plan

A sequenced, high-leverage checklist for taking Amber from domain purchase through compounding organic and agentic traffic—without paid acquisition.

---

## Phase 0 — Domain Cutover & Production Readiness (Day 0)

- [x] **Connect custom domain in Vercel (`talyen-s-projects/amber`)**
  - Pick a short, memorable domain that reads cleanly as a chart watermark (`amberstocks.com`, with `www.amberstocks.com` 308-redirecting to apex).
  - Set `NEXT_PUBLIC_SITE_URL=https://amberstocks.com` in Vercel Production environment variables. This automatically updates `SITE_URL` and `SITE_HOST` across all chart watermarks, embeds, `robots.txt`, `sitemap.xml`, `/llms.txt`, `/openapi.json`, `/api/mcp`, and OG images.
- [x] **Verify Resend sending domain & alerts**
  - Verify DNS records (CNAME + DKIM) for `alerts@amberstocks.com` in Resend.
  - Confirm `RESEND_API_KEY` and `ALERT_FROM_EMAIL` are set in both Vercel Production and GitHub Actions variables.
- [x] **Release & verify production**
  - Run `pnpm lint && pnpm typecheck && pnpm test`.
  - Run `pnpm release` (applies all reviewed SQL migrations including `0014_weekly_digest_subscribers.sql` and deploys to production).
  - Run `pnpm smoke:prod -- --vercel` and inspect Vercel runtime logs.
  - Spot-check live endpoints: `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/openapi.json`, `/api/mcp`, `/feed.xml`, `/sectors/semiconductors`, `/embed/NVDA?chart=sankey`.

---

## Phase 1 — Search, AI Search (GEO) & Agentic Discovery (Week 1)

- [x] **Submit sitemaps to Search + AI Search indexes**
  - **Google Search Console:** Verify domain via DNS TXT record and submit `https://amberstocks.com/sitemap.xml` (1,527 pages discovered).
  - **Bing Webmaster Tools:** Verify domain and submit `sitemap.xml` (~1,500 URLs discovered).
- [x] **Run an Agent-Readiness Audit**
  - November 27, 2026: 100/100 on [Is Agentic](https://is-agentic.com/scan/amberstocks.com), with all eight essential checks passing. The NVDA page advertises its Markdown alternate in the HTTP Link header. Search visibility for Amber’s brand, docs, and MCP remains a follow-up.
  - Run `npx is-agentic <your-domain>` after deploy to get a 0–100 agent-readiness score and fix any remaining `essential` or `recommended` issues.
  - Verify `curl 'https://<your-domain>/api/public/t/NVDA?format=markdown'` returns Markdown with canonical Amber links and that the ticker page advertises this URL as an alternate.
- [ ] **Register Amber's public MCP server (`/api/mcp`)**
  - The repository includes a validated [registry manifest](../server.json) and [client configuration and verification notes](MCP_DISTRIBUTION.md).
  - Submit `https://<your-domain>/api/mcp` to public MCP directories:
    - Official MCP Registry
    - Smithery (`smithery.ai`)
    - Glama (`glama.ai/mcp`)
    - PulseMCP (`pulsemcp.com`)
  - Test connecting to `https://<your-domain>/api/mcp` from Claude Desktop, Cursor, and Antigravity to verify all 4 tools (`amber_get_company`, `amber_screen_companies`, `amber_compare_companies`, `amber_get_recent_signals`) return crisp responses with clickable Amber links.
- [ ] **Publish a lightweight `amber-finance` Agent Skill (`SKILL.md`)**
  - [Skill draft](../skills/amber-finance/SKILL.md).
  - Publish a minimal public GitHub repo (or directory) with a `SKILL.md` instructing coding/research agents how to query Amber's MCP server and `/api/public/*` endpoints for True FCF, SBC dilution, Reverse DCF, and SEC filing diffs, always citing canonical Amber links.

---

## Phase 2 — Content & Community Distribution Loops (Weeks 1–4)

Lead with *data insights*, never *"check out my app."* Let the watermarked charts and interactive links do the selling.

- [ ] **Launch 3–4 data-backed breakdowns using Amber visuals**
  - Post genuinely useful analyses to `r/ValueInvesting`, `r/SecurityAnalysis`, and X (FinTwit) using 1-click copied Amber PNGs:
    1. *"The 10 Mega-Caps Where Stock-Based Compensation Eats the Most Free Cash Flow"* (using `/lenses/hidden-dilution` Top 10 PNG + link).
    2. *"What 10-Year Revenue Growth Is Actually Priced Into Big Tech Right Now?"* (using Reverse DCF cards + `/compare/NVDA-vs-MSFT-vs-AAPL-vs-GOOGL-vs-META`).
    3. *"Semiconductors 2×2 Map: True FCF Margin vs. Priced-In Growth"* (using `/sectors/semiconductors` quadrant PNG).
    4. *"Fastest Share-Count Cannibals Over the Last 4 Years"* (using `/lenses/buyback-cannibals` Top 10 PNG).
- [ ] **Seed RSS feeds into investing communities**
  - Share `https://<your-domain>/feed.xml` (high-signal SEC 10-K/10-Q diffs + $500K+ open-market Form 4 buys) with investing Discord admins and Slack groups looking for a free, noise-free filings bot feed.
- [ ] **Creator & Substack outreach (20–30 mid-sized fundamental writers)**
  - Reach out to independent Substack and YouTube analysts who regularly discuss SBC, buybacks, and Reverse DCFs.
  - Highlight the 1-click **Copy PNG** and live **`<iframe>` Embed** on Revenue Sankeys, True FCF bridges, and Sector 2×2 maps—zero paywall, automatic SEC attribution.

---

## Phase 3 — Retention & Automated Flywheels (Months 1–3)

- [ ] **Wire the Sunday Signal Weekly Digest sender**
  - Implementation prepared in the checkout. Apply migration 0017 on the next authorized release. Verify the GitHub Actions test issue and production signup before sharing the digest.
- [ ] **Track which distribution loops actually drive repeat visits**
  - The checkout includes anonymous aggregate counts for landing routes, referral groups, and chart actions. Apply migration 0018 on release and review the initial counts with `pnpm analytics:report 14`. Unique visitors and repeat visits still need separate measurement.
  - Add lightweight, privacy-friendly analytics (e.g., Vercel Web Analytics or Plausible) to measure:
    - Top landing routes (`/t/[ticker]/sbc` vs. `/valuation` vs. `/sectors/*` vs. `/lenses/*` vs. `/compare/*`).
    - Chart copy/download and embed click rates.
    - Referral traffic from AI search engines (`chatgpt.com`, `perplexity.ai`, `claude.ai`, `gemini.google.com`) and MCP/public API request volume.
    - Weekly digest conversion and Arena sign-up rates.
- [ ] **Optional low-maintenance automated social signal bot**
  - Reuse the nightly EDGAR pipeline to post 1–2 high-signal cards per day (strictly filtered for mega-cap 10-K/10-Q prose diffs or $1M+ C-suite Form 4 buys—never boilerplate 8-Ks) linking directly to `/filings/[id]` or `/t/[ticker]/valuation`.

---

## Phase 4 — Next-Wave Product & Agentic Expansion (Months 3–6)

Double down based on real traffic data from Phase 3:

- [ ] **Sector-level Markdown:** Publish ranked sector and lens tables at separate Markdown URLs for agents researching a sector or screen.
- [ ] **`/llms-full.txt` or per-sector JSON benchmarks:** Expose `/api/public/sectors` so agents can answer *"How does NVDA's True FCF margin compare to the semiconductor sector median?"* directly from Amber.
- [ ] **Sortable Sector Hub tables + custom 2×2 axis toggle:** Let users switch the Sector 2×2 Quadrant between *True FCF vs. Priced-In Growth* and *Revenue Growth vs. SBC %* (and sort the sector table by any column).
- [ ] **Browser companion extension (optional):** A tiny Chrome/Safari extension that adds a 1-click *"Open in Amber (True FCF & Diffs)"* button on SEC.gov EDGAR pages and Yahoo Finance ticker pages.
- [ ] **Monetization checkpoint (only after organic pull is proven):** Keep core company pages, embeds, and read-only agent APIs free forever (they are your distribution engine). If revenue is desired later, gate only power-user workflows (unlimited real-time alerts, bulk CSV exports, custom multi-portfolio tracking, or higher-rate commercial API tiers).
