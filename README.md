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

## License

Source-available for personal and educational use only. Commercial use, redistribution, or operating a competing hosted service is prohibited without written permission. See [LICENSE](./LICENSE).
