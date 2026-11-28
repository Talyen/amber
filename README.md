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
- Issuer-specific filing values missing from SEC Company Facts are recorded in [`src/data/filing-supplements.ts`](src/data/filing-supplements.ts) with their source and reporting period.

## Valuation Backtests

Use `pnpm backtest:valuation` to compare one economic hypothesis with a frozen version of the valuation engine. Once you have a historical panel, the replay runs offline and uses the same issuer, formation date, and realized outcome for each pair of forecasts.

```bash
pnpm backtest:valuation pin revised
# Edit one valuation assumption, or pass --source to replay a separate copy of src/.
pnpm backtest:valuation run cyclical-margin --baseline revised --panel /path/to/panel.json \
  --change 'Estimate mid-cycle cash margins over a longer history for cyclical businesses' \
  --metric cash-flow-per-share
```

Each trial saves the hypothesis, primary metric, engine source hashes, changed files, panel hash, coverage and scores under `.valuation-backtest/`. Remove discarded candidates and their individual outputs after review. Retain the adopted model, its evidence, reusable input panels, and records of which validation sets have been used. Use `--store` to point at a shared ledger if more than one person is iterating. The report includes five-year fundamental forecast errors, three-, five-, and seven-year return checks, and a fixed 10% annual return forecast as a calibration baseline. It also compares the highest-ranked fifth by fair value relative to the formation price with the eligible cohort, SPY, and a sector-weighted peer comparison. Cohorts can overlap. Read their results as diagnostics and check sample size and forecast coverage by sector, industry, and business situation.

The archive used for the initial research spans June 2017 through June 2026, including outcomes, and is development data. Keep an independent set with an untouched formation-to-outcome window and have a custodian supply its date range and SHA-256 before the trial. After choosing a candidate, use the reserved panel once. The command checks overlapping date ranges, hashes, and the recorded candidate, metric, scorer and runtime. It can enforce this within the ledger. Protecting the panel and knowing whether anyone has inspected it outside the ledger depend on how the panel is handled. A result can guide development while independent validation is still pending.

```bash
pnpm backtest:valuation reserve earlier-era --sha256 "$PANEL_SHA256" --from "$FIRST_CLOSE" --through "$LAST_OUTCOME"
# Register the run before opening the validation panel.
pnpm backtest:valuation validate cyclical-margin --reservation earlier-era --panel /path/to/sealed-panel.json
```

Panels wrap observations in a `panel` array. Each observation has a `formation` date, `snapshot` with the formation quote and historical financials, and `results` keyed by horizon in years. Results include the outcome date, total-return multipliers for the stock and SPY, and optional realized fundamentals. Fiscal periods and outcomes use `YYYY-MM-DD`. Where available, include `annuals[].filedAt` so the scorer checks publication against the formation close. Supply equally treated acquisitions, bankruptcies, delistings, splits and dividends when extending the universe. Price and market capitalization support share-count reconciliation and return scoring. The replay checks for changes in forecasts when the price and capitalization double together and when a ticker is substituted. Sector and filing-based inputs remain fixed in those checks.

Optional `snapshot.filedFundamentals` accepts a `reportedAt` date before the formation quote, a filing citation in `source`, and a four-digit `sic` code. Use the same units as the annual statements for currency amounts, percentages such as `105` for 105%, and boe for production and reserves. Missing fields stay missing. The scorer reports how many observations have each input. Additional outcomes can supply net income, funds from operations or tangible common equity for per-share forecast checks. Per-share errors are scaled by formation revenue per share or, for the tangible book metric, by formation tangible book per share.

| Business | Formation data to collect | Fundamental forecast to test |
| --- | --- | --- |
| Banks | Tangible common equity, deposits, net charge-offs, CET1 capital and risk-weighted assets | Earnings and tangible book per share, with distributions constrained by capital needs |
| Early-stage companies | Revenue and gross profit, recurring revenue and retention where relevant, customer concentration, burn, cash and share issuance | Sales and sustainable cash flow per share under different funding and dilution outcomes |
| Oil and gas producers | Production, proved reserves, sustaining capex, debt and cash flow across commodity cycles | Sustainable production and cash generation after replacement spending |
| REITs | Reported funds from operations, capital spending and financing obligations | Funds from operations per share and cash available for distributions |

These are inputs and underwriting hypotheses for future trials. The historical archive has limited sector-specific inputs and early-stage or delisted coverage. Use the report to identify the coverage you need before relying on a result for any of these groups.

### Valuation references

- Use discounted cash flow to the firm for operating businesses. Project operating profit after tax and deduct the reinvestment needed to support growth. Check that terminal growth, return on new capital, and terminal cash flow agree. [CFA Institute free cash flow valuation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/free-cash-flow-valuation) · [Damodaran on the determinants of growth](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/growth.htm)
- Use residual income as a reference for banks. Start with tangible common equity, then value expected common earnings above the equity capital charge. Cross-check the outcome with free cash flow to equity after required regulatory capital reinvestment where the data supports it. [CFA Institute residual income valuation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/residual-income-valuation) · [Damodaran on financial service firms](https://stern.nyu.edu/~adamodar/pdfiles/papers/finfirm09.pdf)
- Underwrite oil and gas with mid-cycle economics and the costs of replacing production. For young businesses, model how sales, cash burn, and capital needs affect shareholder outcomes across survival and dilution scenarios. Use Nareit-defined FFO to standardize REIT operating comparisons and reconcile it to cash available for distribution. [Commodity valuation](https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/commodity.pdf) · [Young-company valuation](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/littlebook/younggrowthvaluedrivers.htm) · [Nareit FFO standard](https://www.reit.com/glossary/funds-operation-ffo)

Use these frameworks to define what a forecast needs to explain. Check forecast accuracy and realized returns separately on independent historical data.

## Production Releases

Set a sending-scoped `RESEND_API_KEY` in GitHub Actions for nightly dispatch and in Vercel production for subscription confirmation. Both use `alerts@amberstocks.com` by default. To use a different verified Resend sender, set `ALERT_FROM_EMAIL` in GitHub Actions variables and Vercel production. The scheduled workflow reports missing mail configuration and unresolved digest deliveries as failures.

Run [Verify Filing Alert Email](https://github.com/Talyen/amber/actions/workflows/check-filing-alert-email.yml) on `main` to check that Resend accepts a message from the configured sender. The workflow uses Resend's test address and can run independently of SEC ingestion.

### Sunday Signal and distribution reporting

Sunday Signal sends to confirmed subscribers on Sundays at 16:23 UTC, with two same-day attempts to finish unresolved deliveries. A manual run of the Sunday Signal workflow uses Resend’s synthetic test inbox. `pnpm send:digest --preview` renders the next issue as text with a configured database. The scheduled run freezes the issue and uses one delivery key per subscriber and issue. Reconcile delivery records and provider activity before retrying an unresolved send beyond the provider’s idempotency window.

Run `pnpm analytics:report 14` with a configured database to view aggregate landing views, in-site page views, chart copies and downloads, iframe copies, and embed clicks by route and referral group. Rates based on these counts describe actions per page view. The report contains no visitor identifiers.

`pnpm release` applies and verifies the reviewed SQL migrations in `drizzle/` using the linked Vercel project's production environment, then deploys Amber. Git pushes do not auto-deploy. When first applying `0012_company_quote_date.sql`, run a successful quote sync against production before using Arena publish or rebalance. A date is recorded only after a verified close is fetched. After deploying, run `pnpm smoke:prod -- --vercel` to verify core production routes. See [AGENTS.md](AGENTS.md) for release ownership and verification rules.

## License

Source-available for personal and educational use only. Commercial use, redistribution, or operating a competing hosted service is prohibited without written permission. See [LICENSE](./LICENSE).
