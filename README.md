# Amber

High-signal fundamental analysis for long-term investors. Built for exceptional visual craft, deterministic batch SEC EDGAR pipelines, and near-zero maintenance.

## Core Capabilities (v1 Vertical Slice)

- **True Free Cash Flow & Dilution:** Isolates Stock-Based Compensation (SBC) from headline Free Cash Flow and tracks diluted share count expansion across fiscal years.
- **Interactive Reverse DCF Studio:** Real-time client-side solver and 5×5 sensitivity matrix revealing the exact 10-year revenue CAGR priced into a stock's Enterprise Value.
- **Filing Diff Radar:** Structured extraction of material SEC 10-K/10-Q changes (Risk Factors, Customer Concentration, Executive Comp, Capital Allocation) with side-by-side filing language.
- **Screenshot-Worthy Artifacts:** One-click 2× retina PNG exports with a subtle Amber watermark and SEC accession attribution.

## Stack

- **App & Hosting:** Next.js 15 (App Router, TypeScript) on Vercel
- **Styling & Visuals:** Tailwind CSS v4, custom precision SVG charts, `Inter` + `JetBrains Mono` (`tabular-nums`), adaptive light/dark tokens
- **Batch Pipeline:** Free SEC EDGAR XBRL API (`scripts/ingest-edgar.ts`) scheduled via GitHub Actions (`.github/workflows/ingest-filings.yml`) — zero live LLM calls on user page loads

## Local Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to explore Amber locally.

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` to match the pull request checks.

## Company Coverage

The nightly job screens up to 900 Nasdaq and NYSE issuers from the SEC ticker
directory. It prioritizes tracked companies and uses one listing per issuer.
New coverage requires recent USD financials, identifiable cash CapEx and
shares outstanding, and a valid closing price. Expansion defers companies in the
SEC's finance, insurance, and real estate classification and crude oil and gas
producers pending reliable sector-specific inputs.
Issuer-specific filing values missing from SEC Company Facts are recorded in
[`scripts/filing-supplements.ts`](scripts/filing-supplements.ts) with their source
and reporting period.

## Production Releases

`pnpm release` applies and verifies the reviewed SQL migrations using the linked
Vercel project's production environment, then deploys Amber. Git pushes do not
deploy automatically. [AGENTS.md](AGENTS.md) describes release ownership and verification.

## License

Source-available for personal and educational use only. Commercial use, redistribution, or operating a competing hosted service is prohibited without written permission. See [LICENSE](./LICENSE).
