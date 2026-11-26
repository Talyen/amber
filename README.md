# Amber

High-signal fundamental analysis for long-term investors. Built for visual clarity, deterministic batch SEC EDGAR pipelines, and near-zero maintenance.

## Capabilities

- **Explore & Discovery Lenses (`/`):** Screen 700+ Nasdaq and NYSE companies by True Free Cash Flow margin, Stock-Based Compensation burden, 4-year net dilution, implied 10-year revenue growth, and curated lenses (Cash Machines, Buybacks, Underpriced, Rule of 40, High SBC, Insider Buys, Material Events) plus a composable screener drawer.
- **Company Workspace (`/t/[ticker]`):**
  - **True FCF & Dilution:** Isolates SBC from headline Free Cash Flow, tracks diluted share count expansion, and renders interactive revenue Sankeys, True FCF waterfalls, and Price vs. Fundamentals charts.
  - **Sector-Native Guardrails:** Surfaces Tangible Book Value (P/TBV) & ROTCE/ROE for banks and insurers, and Price/FFO & FFO/share for REITs.
  - **Valuation Studio (Reverse DCF & 5-Year Scenario Builder):** Real-time client-side Reverse DCF solver, 5×5 sensitivity matrix, multi-lens Scenario Builder (True FCF, EBIT, P/E), and account-synced Saved Theses with optional conviction notes.
  - **Filing Diff Radar & Insider Radar:** Structured 10-K/10-Q prose diffs, Form 8-K material events, and Form 4 open-market insider purchases with SEC accession attribution and email filing alerts.
- **Signal Feed (`/feed`):** Unified market intelligence stream combining prioritized 10-K/10-Q filing diffs, 8-K events, executive Form 4 buys, and curated watchlist news.
- **Compare Studio (`/compare`):** Side-by-side multi-company fundamental comparisons with indexed 5-year history charts and shareable URLs.
- **Portfolio Analyzer (`/portfolio`):** Weight- or dollar-based portfolio analysis showing aggregate priced-in growth, True FCF quality, SBC drag, sector concentration, and weighted expected returns from your Saved Theses.
- **Arena (`/arena`):** Time-weighted monthly and yearly paper-portfolio leaderboards with server-locked entry prices, rebalance history, and strategy benchmark bots.

## Stack

- **App & Hosting:** Next.js 15 (App Router, TypeScript) on Vercel
- **Database & Auth:** Neon Postgres (Drizzle ORM) + Better Auth
- **Styling & Visuals:** Tailwind CSS v4, custom precision SVG charts, `Inter` + `JetBrains Mono` (`tabular-nums`), adaptive light/dark tokens, 2× PNG card exports
- **Batch Pipeline:** Free SEC EDGAR XBRL, Form 4, Form 8-K, and 2-stage 10-K/10-Q prose diff pipelines scheduled nightly via GitHub Actions ([`.github/workflows/ingest-filings.yml`](.github/workflows/ingest-filings.yml)) — zero live LLM calls on user page loads

## Local Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to explore Amber locally.

Run the pull request verification suite locally:

```bash
pnpm exec playwright install chromium
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:browser
```

Set `AMBER_TEST_POSTGRES_URL` to a disposable local Postgres server and put `psql` on your PATH to include the Postgres concurrency and browser API tests.

## Company Coverage

The nightly job screens up to 900 Nasdaq and NYSE issuers from the SEC ticker directory, prioritizing tracked companies and using one listing per issuer:
- **Industrial / Tech / Consumer / Energy:** Requires recent USD financials, identifiable cash CapEx (including E&P oil & gas capital spending), shares outstanding, and a valid closing price.
- **Financials, Insurers & REITs (`SIC 6000–6799`):** Validated via stockholders' equity and net income, extracting Goodwill/Intangibles for Bank P/TBV & ROTCE and Depreciation & Amortization for REIT FFO.
- Issuer-specific filing values missing from SEC Company Facts are recorded in [`scripts/filing-supplements.ts`](scripts/filing-supplements.ts) with their source and reporting period.

## Production Releases

Set a sending-scoped `RESEND_API_KEY` in GitHub Actions for nightly dispatch and in Vercel production for subscription confirmation. Both use `alerts@amber.finance` by default. To use a different verified Resend sender, set `ALERT_FROM_EMAIL` in GitHub Actions variables and Vercel production. The scheduled workflow reports missing mail configuration and unresolved digest deliveries as failures.

`pnpm release` applies and verifies the reviewed SQL migrations in `drizzle/` using the linked Vercel project's production environment, then deploys Amber. Git pushes do not auto-deploy. When first applying `0012_company_quote_date.sql`, run a successful quote sync against production before using Arena publish or rebalance. A date is recorded only after a verified close is fetched. After deploying, run `pnpm smoke:prod -- --vercel` to verify core production routes. See [AGENTS.md](AGENTS.md) for release ownership and verification rules.

## License

Source-available for personal and educational use only. Commercial use, redistribution, or operating a competing hosted service is prohibited without written permission. See [LICENSE](./LICENSE).
