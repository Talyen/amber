import type { CompanySnapshot } from "@/lib/finance";

/**
 * Curated 6-ticker pilot grounded in SEC EDGAR 10-K/10-Q filings.
 * In production, `scripts/ingest-edgar.ts` refreshes these snapshots on a nightly GitHub Actions cron.
 */
export const PILOT_TICKERS: CompanySnapshot[] = [
  {
    ticker: "PLTR",
    cik: "0001321655",
    name: "Palantir Technologies",
    exchange: "NASDAQ",
    sector: "Cloud & Software",
    tagline: "High-margin FCF inflection vs. persistent SBC & share count expansion",
    price: 78.4,
    marketCap: 181_500,
    cashAndEquiv: 5_230,
    totalDebt: 240,
    lastFiling: {
      type: "10-K",
      date: "2025-02-18",
      periodEnd: "2024-12-31",
      accessionNumber: "0001321655-25-000018",
    },
    annuals: [
      {
        fiscalYear: "FY20",
        revenue: 1_093,
        operatingCashFlow: -297,
        capex: 12,
        sbc: 1_271,
        buybacks: 0,
        dilutedShares: 1_745,
      },
      {
        fiscalYear: "FY21",
        revenue: 1_542,
        operatingCashFlow: 334,
        capex: 13,
        sbc: 778,
        buybacks: 0,
        dilutedShares: 1_924,
      },
      {
        fiscalYear: "FY22",
        revenue: 1_906,
        operatingCashFlow: 224,
        capex: 40,
        sbc: 565,
        buybacks: 0,
        dilutedShares: 2_064,
      },
      {
        fiscalYear: "FY23",
        revenue: 2_225,
        operatingCashFlow: 712,
        capex: 15,
        sbc: 476,
        buybacks: 0,
        dilutedShares: 2_278,
      },
      {
        fiscalYear: "FY24",
        revenue: 2_866,
        operatingCashFlow: 1_154,
        capex: 13,
        sbc: 692,
        buybacks: 64,
        dilutedShares: 2_394,
      },
    ],
    defaultDcf: {
      wacc: 10.5,
      terminalMultiple: 28,
      targetFcfMargin: 36,
      sbcDragPct: 12,
    },
    filingDiffs: [
      {
        id: "pltr-sbc-sar",
        filingType: "10-K",
        filingDate: "2025-02-18",
        accessionNumber: "0001321655-25-000018",
        section: "Note 12: Stock-Based Compensation",
        category: "Executive Comp",
        materiality: "High",
        headline: "SAR acceleration lifted FY24 SBC by +45% YoY to $692M",
        summary:
          "Market-price vesting triggers on Stock Appreciation Rights (SARs) caused SBC to re-accelerate from 21.4% to 24.1% of revenue, absorbing 60.6% of reported Free Cash Flow.",
        priorExcerpt:
          "We expect stock-based compensation expense as a percentage of revenue to continue moderating as legacy direct-listing grants roll off.",
        currentExcerpt:
          "During the fourth quarter, stock price appreciation triggered accelerated recognition of $131.5M in SAR expense; additional tranches vest at $50 and $70 thresholds.",
        signalNote:
          "True FCF ($449M) is 61% lower than headline Adjusted FCF ($1,141M). Watch SAR overhang in FY25.",
      },
      {
        id: "pltr-gov-concentration",
        filingType: "10-K",
        filingDate: "2025-02-18",
        accessionNumber: "0001321655-25-000018",
        section: "Item 1A: Risk Factors",
        category: "Customer Concentration",
        materiality: "Medium",
        headline: "Top-3 customer concentration edged down from 18% to 16% of revenue",
        summary:
          "US Commercial AIP adoption broadened the customer base, reducing reliance on top three government contracts, though federal budget appropriations remain a highlighted risk.",
        priorExcerpt:
          "Our top three customers together accounted for 18% of our revenue for the year ended December 31, 2023.",
        currentExcerpt:
          "Our top three customers together accounted for 16% of our revenue for the year ended December 31, 2024; federal procurement efficiency reviews may delay renewals.",
        signalNote:
          "Diversification trend is constructive; newly added language around federal procurement reviews warrants monitoring.",
      },
      {
        id: "pltr-buyback-pace",
        filingType: "10-K",
        filingDate: "2025-02-18",
        accessionNumber: "0001321655-25-000018",
        section: "Item 7: Liquidity & Capital Resources",
        category: "Capital Allocation",
        materiality: "Watch",
        headline: "$1B buyback authorization remains 93% unspent despite $5.2B cash pile",
        summary:
          "Only $64M was deployed toward repurchases in FY24 while diluted share count expanded 5.1% YoY.",
        priorExcerpt:
          "In August 2023, our Board of Directors authorized a stock repurchase program of up to $1.0 billion.",
        currentExcerpt:
          "As of December 31, 2024, $935.8 million remained available under the repurchase authorization.",
        signalNote:
          "Buybacks are not yet offsetting employee equity issuance; net dilution remains a ~5% annual headwind.",
      },
    ],
  },
  {
    ticker: "NVDA",
    cik: "0001045810",
    name: "NVIDIA Corporation",
    exchange: "NASDAQ",
    sector: "Semiconductors",
    tagline: "Extraordinary cash conversion with rising hyperscaler concentration",
    price: 134.2,
    marketCap: 3_285_000,
    cashAndEquiv: 43_210,
    totalDebt: 10_270,
    lastFiling: {
      type: "10-K",
      date: "2025-02-26",
      periodEnd: "2025-01-26",
      accessionNumber: "0001045810-25-000023",
    },
    annuals: [
      {
        fiscalYear: "FY21",
        revenue: 16_675,
        operatingCashFlow: 5_822,
        capex: 1_128,
        sbc: 1_397,
        buybacks: 0,
        dilutedShares: 25_120,
      },
      {
        fiscalYear: "FY22",
        revenue: 26_914,
        operatingCashFlow: 9_108,
        capex: 976,
        sbc: 2_004,
        buybacks: 0,
        dilutedShares: 25_350,
      },
      {
        fiscalYear: "FY23",
        revenue: 26_974,
        operatingCashFlow: 5_641,
        capex: 1_833,
        sbc: 2_709,
        buybacks: 10_039,
        dilutedShares: 25_070,
      },
      {
        fiscalYear: "FY24",
        revenue: 60_922,
        operatingCashFlow: 28_090,
        capex: 1_069,
        sbc: 3_549,
        buybacks: 9_533,
        dilutedShares: 24_940,
      },
      {
        fiscalYear: "FY25",
        revenue: 130_497,
        operatingCashFlow: 64_089,
        capex: 3_236,
        sbc: 4_737,
        buybacks: 33_706,
        dilutedShares: 24_620,
      },
    ],
    defaultDcf: {
      wacc: 10.0,
      terminalMultiple: 22,
      targetFcfMargin: 42,
      sbcDragPct: 4,
    },
    filingDiffs: [
      {
        id: "nvda-customer-conc",
        filingType: "10-K",
        filingDate: "2025-02-26",
        accessionNumber: "0001045810-25-000023",
        section: "Note 17: Segment & Customer Concentration",
        category: "Customer Concentration",
        materiality: "High",
        headline: "Three direct customers now represent 34% of total revenue (up from 13%)",
        summary:
          "Customer A (12%), Customer B (11%), and Customer C (11%) each crossed the 10% disclosure threshold in FY25, highlighting acute dependence on hyperscaler CapEx cycles.",
        priorExcerpt:
          "One customer represented 13% of total revenue for fiscal year 2024; no other direct customer exceeded 10%.",
        currentExcerpt:
          "Sales to three direct customers represented 12%, 11%, and 11% of total revenue in fiscal year 2025, primarily attributable to the Compute & Networking segment.",
        signalNote:
          "Highest direct customer concentration in NVIDIA's public history, raising model sensitivity to hyperscaler CapEx digestion.",
      },
      {
        id: "nvda-export-controls",
        filingType: "10-K",
        filingDate: "2025-02-26",
        accessionNumber: "0001045810-25-000023",
        section: "Item 1A: Risk Factors",
        category: "Risk Factors",
        materiality: "High",
        headline: "Added AI Diffusion framework & Singapore billing-location scrutiny",
        summary:
          "Expanded risk language detailing US AI Diffusion tiering rules and clarifying that Singapore represents 18% of billed revenue though physical shipments go elsewhere.",
        priorExcerpt:
          "Export controls on China have reduced our Data Center revenue in the region to mid-single-digit percentages.",
        currentExcerpt:
          "Interim Final Rules on AI Diffusion impose tiered compute caps across non-allied jurisdictions; Singapore accounted for 18% of FY25 revenue by billing location.",
        signalNote:
          "Explicitly separates billing vs. ship-to geography in response to regulatory focus on transshipment.",
      },
      {
        id: "nvda-buyback-machine",
        filingType: "10-K",
        filingDate: "2025-02-26",
        accessionNumber: "0001045810-25-000023",
        section: "Item 7: Capital Return",
        category: "Capital Allocation",
        materiality: "Watch",
        headline: "$33.7B in FY25 buybacks fully absorbed SBC and shrank share count by 1.3%",
        summary:
          "SBC fell to just 3.6% of revenue (7.8% of FCF), making NVIDIA's True FCF ($56.1B) nearly identical to reported FCF.",
        priorExcerpt:
          "We repurchased $9.5 billion of common stock during fiscal year 2024.",
        currentExcerpt:
          "We repurchased $33.7 billion of common stock during fiscal year 2025, reducing weighted-average diluted shares by 320 million.",
        signalNote:
          "Cleanest cash-flow quality among mega-cap AI leaders; SBC drag is minimal relative to operating cash flow.",
      },
    ],
  },
  {
    ticker: "MSFT",
    cik: "0000789019",
    name: "Microsoft Corporation",
    exchange: "NASDAQ",
    sector: "Cloud & Software",
    tagline: "AI datacenter CapEx surge compressing near-term FCF conversion",
    price: 416.8,
    marketCap: 3_098_000,
    cashAndEquiv: 75_543,
    totalDebt: 51_621,
    lastFiling: {
      type: "10-K",
      date: "2024-07-30",
      periodEnd: "2024-06-30",
      accessionNumber: "0000950170-24-087843",
    },
    annuals: [
      {
        fiscalYear: "FY20",
        revenue: 143_015,
        operatingCashFlow: 60_675,
        capex: 15_441,
        sbc: 5_289,
        buybacks: 22_968,
        dilutedShares: 7_683,
      },
      {
        fiscalYear: "FY21",
        revenue: 168_088,
        operatingCashFlow: 76_740,
        capex: 20_622,
        sbc: 6_118,
        buybacks: 27_385,
        dilutedShares: 7_608,
      },
      {
        fiscalYear: "FY22",
        revenue: 198_270,
        operatingCashFlow: 89_035,
        capex: 23_886,
        sbc: 7_502,
        buybacks: 32_696,
        dilutedShares: 7_540,
      },
      {
        fiscalYear: "FY23",
        revenue: 211_915,
        operatingCashFlow: 87_582,
        capex: 28_107,
        sbc: 9_611,
        buybacks: 22_245,
        dilutedShares: 7_472,
      },
      {
        fiscalYear: "FY24",
        revenue: 245_122,
        operatingCashFlow: 118_548,
        capex: 44_477,
        sbc: 10_734,
        buybacks: 17_254,
        dilutedShares: 7_469,
      },
    ],
    defaultDcf: {
      wacc: 9.0,
      terminalMultiple: 24,
      targetFcfMargin: 31,
      sbcDragPct: 4.5,
    },
    filingDiffs: [
      {
        id: "msft-capex-leases",
        filingType: "10-K",
        filingDate: "2024-07-30",
        accessionNumber: "0000950170-24-087843",
        section: "Note 14: Leases & Datacenter Commitments",
        category: "Capital Allocation",
        materiality: "High",
        headline: "Uncommenced datacenter lease obligations jumped to $108.4B",
        summary:
          "Beyond $44.5B in cash CapEx, Microsoft disclosed $108.4B of additional finance leases for AI datacenters that have not yet commenced (up from $44.2B a year ago).",
        priorExcerpt:
          "We have additional operating and finance leases, primarily for datacenters, that have not yet commenced of $44.2 billion.",
        currentExcerpt:
          "We have additional operating and finance leases, primarily for datacenters, that have not yet commenced of $108.4 billion, with terms of 1 to 20 years.",
        signalNote:
          "Off-balance-sheet datacenter commitments more than doubled; depreciation drag will weigh on GAAP margins through FY28.",
      },
      {
        id: "msft-openai-risk",
        filingType: "10-K",
        filingDate: "2024-07-30",
        accessionNumber: "0000950170-24-087843",
        section: "Item 1: Competition",
        category: "Risk Factors",
        materiality: "Medium",
        headline: "Added OpenAI explicitly to list of competitive AI & search rivals",
        summary:
          "For the first time, Microsoft named its strategic partner OpenAI as a direct competitor in AI offerings and search/news advertising.",
        priorExcerpt:
          "Our competitors include Amazon, Apple, Google, Meta, Oracle, and Salesforce across cloud and productivity.",
        currentExcerpt:
          "In AI and search, we compete with Google, Meta, Anthropic, and OpenAI, including in commercial AI assistants and developer APIs.",
        signalNote:
          "Subtle but notable governance and strategic alignment shift in the partnership disclosure.",
      },
    ],
  },
  {
    ticker: "SNOW",
    cik: "0001640147",
    name: "Snowflake Inc.",
    exchange: "NYSE",
    sector: "Cloud & Software",
    tagline: "Classic SBC-to-FCF gap: strong headline cash flow vs. negative True FCF",
    price: 168.5,
    marketCap: 56_100,
    cashAndEquiv: 4_620,
    totalDebt: 2_300,
    lastFiling: {
      type: "10-K",
      date: "2025-03-26",
      periodEnd: "2025-01-31",
      accessionNumber: "0001640147-25-000031",
    },
    annuals: [
      {
        fiscalYear: "FY21",
        revenue: 592,
        operatingCashFlow: -45,
        capex: 39,
        sbc: 301,
        buybacks: 0,
        dilutedShares: 288,
      },
      {
        fiscalYear: "FY22",
        revenue: 1_219,
        operatingCashFlow: 110,
        capex: 54,
        sbc: 605,
        buybacks: 0,
        dilutedShares: 312,
      },
      {
        fiscalYear: "FY23",
        revenue: 2_066,
        operatingCashFlow: 546,
        capex: 49,
        sbc: 862,
        buybacks: 0,
        dilutedShares: 325,
      },
      {
        fiscalYear: "FY24",
        revenue: 2_806,
        operatingCashFlow: 848,
        capex: 69,
        sbc: 1_170,
        buybacks: 592,
        dilutedShares: 332,
      },
      {
        fiscalYear: "FY25",
        revenue: 3_626,
        operatingCashFlow: 960,
        capex: 76,
        sbc: 1_471,
        buybacks: 1_916,
        dilutedShares: 334,
      },
    ],
    defaultDcf: {
      wacc: 10.5,
      terminalMultiple: 24,
      targetFcfMargin: 24,
      sbcDragPct: 18,
    },
    filingDiffs: [
      {
        id: "snow-sbc-40pct",
        filingType: "10-K",
        filingDate: "2025-03-26",
        accessionNumber: "0001640147-25-000031",
        section: "Item 7: Non-GAAP Reconciliation",
        category: "Executive Comp",
        materiality: "High",
        headline: "SBC rose to 40.6% of revenue ($1.47B), exceeding total Operating Cash Flow",
        summary:
          "While Snowflake reported $884M in headline FCF (24.4% margin), deducting $1.47B of SBC leaves True FCF deeply negative at -$587M (-16.2% margin).",
        priorExcerpt:
          "Stock-based compensation expense was $1,170.2 million, or 41.7% of revenue, for fiscal 2024.",
        currentExcerpt:
          "Stock-based compensation expense was $1,471.4 million, or 40.6% of revenue, for fiscal 2025; we issued $2.3B in convertible notes partly to fund share repurchases.",
        signalNote:
          "Debt-funded buybacks kept share count flat, but economic cash generation after SBC remains negative.",
      },
      {
        id: "snow-iceberg-risk",
        filingType: "10-K",
        filingDate: "2025-03-26",
        accessionNumber: "0001640147-25-000031",
        section: "Item 1A: Risk Factors",
        category: "Risk Factors",
        materiality: "Medium",
        headline: "Flagged open table formats (Apache Iceberg) as potential storage revenue headwind",
        summary:
          "Management acknowledged that customer adoption of open Iceberg tables allows storage outside Snowflake's proprietary tier, shifting monetization toward compute.",
        priorExcerpt:
          "Customers store large volumes of structured and semi-structured data natively within our platform.",
        currentExcerpt:
          "Growing adoption of Apache Iceberg open table formats may reduce our storage revenue and lower switching costs to competing compute engines.",
        signalNote:
          "Key moat watchpoint: track compute consumption growth vs. storage attach rates in FY26.",
      },
    ],
  },
  {
    ticker: "SHOP",
    cik: "0001594805",
    name: "Shopify Inc.",
    exchange: "NYSE",
    sector: "Cloud & Software",
    tagline: "Post-logistics operating leverage with disciplined SBC compression",
    price: 109.6,
    marketCap: 141_800,
    cashAndEquiv: 5_480,
    totalDebt: 918,
    lastFiling: {
      type: "10-K",
      date: "2025-02-11",
      periodEnd: "2024-12-31",
      accessionNumber: "0001594805-25-000012",
    },
    annuals: [
      {
        fiscalYear: "FY20",
        revenue: 2_929,
        operatingCashFlow: 425,
        capex: 42,
        sbc: 247,
        buybacks: 0,
        dilutedShares: 1_220,
      },
      {
        fiscalYear: "FY21",
        revenue: 4_612,
        operatingCashFlow: 504,
        capex: 51,
        sbc: 331,
        buybacks: 0,
        dilutedShares: 1_268,
      },
      {
        fiscalYear: "FY22",
        revenue: 5_600,
        operatingCashFlow: -136,
        capex: 50,
        sbc: 549,
        buybacks: 0,
        dilutedShares: 1_272,
      },
      {
        fiscalYear: "FY23",
        revenue: 7_060,
        operatingCashFlow: 944,
        capex: 39,
        sbc: 615,
        buybacks: 0,
        dilutedShares: 1_284,
      },
      {
        fiscalYear: "FY24",
        revenue: 8_880,
        operatingCashFlow: 1_616,
        capex: 19,
        sbc: 438,
        buybacks: 0,
        dilutedShares: 1_295,
      },
    ],
    defaultDcf: {
      wacc: 10.0,
      terminalMultiple: 26,
      targetFcfMargin: 26,
      sbcDragPct: 5,
    },
    filingDiffs: [
      {
        id: "shop-sbc-drop",
        filingType: "10-K",
        filingDate: "2025-02-11",
        accessionNumber: "0001594805-25-000012",
        section: "Item 7: Operating Expenses",
        category: "Executive Comp",
        materiality: "High",
        headline: "SBC dropped 29% YoY to 4.9% of revenue, driving an inflection in True FCF",
        summary:
          "Following headcount discipline and Flex Comp restructuring, SBC fell from 8.7% to 4.9% of revenue, propelling True FCF nearly 4x YoY from $290M to $1,159M.",
        priorExcerpt:
          "Stock-based compensation was $615 million, representing 8.7% of total revenue in fiscal 2023.",
        currentExcerpt:
          "Stock-based compensation declined to $438 million, or 4.9% of total revenue, as employees elected higher cash mixes under our Flex Comp framework.",
        signalNote:
          "Rare SaaS example of genuine SBC discipline; True FCF margin expanded +890 bps YoY to 13.1%.",
      },
      {
        id: "shop-payments-take",
        filingType: "10-K",
        filingDate: "2025-02-11",
        accessionNumber: "0001594805-25-000012",
        section: "Item 7: Merchant Solutions",
        category: "Customer Concentration",
        materiality: "Watch",
        headline: "Shopify Payments penetration reached 62% of GMV; enterprise mix rising",
        summary:
          "Merchant Solutions gross margin compressed slightly from enterprise onboarding but drove durable gross profit dollar expansion.",
        priorExcerpt:
          "Gross Payments Volume accounted for 58% of GMV in fiscal 2023.",
        currentExcerpt:
          "Gross Payments Volume accounted for 62% of GMV in fiscal 2024, led by Shop Pay and international enterprise merchants.",
        signalNote:
          "Higher payment attach strengthens retention, though payment processing carries lower incremental gross margin than subscriptions.",
      },
    ],
  },
  {
    ticker: "COST",
    cik: "0000909832",
    name: "Costco Wholesale",
    exchange: "NASDAQ",
    sector: "Consumer & Retail",
    tagline: "Ultra-clean cash flow and minimal SBC; stress-test the 50x+ valuation",
    price: 964.5,
    marketCap: 428_200,
    cashAndEquiv: 11_090,
    totalDebt: 5_810,
    lastFiling: {
      type: "10-K",
      date: "2024-10-09",
      periodEnd: "2024-09-01",
      accessionNumber: "0000909832-24-000049",
    },
    annuals: [
      {
        fiscalYear: "FY20",
        revenue: 166_761,
        operatingCashFlow: 8_861,
        capex: 2_810,
        sbc: 619,
        buybacks: 196,
        dilutedShares: 444,
      },
      {
        fiscalYear: "FY21",
        revenue: 195_929,
        operatingCashFlow: 8_958,
        capex: 3_588,
        sbc: 665,
        buybacks: 495,
        dilutedShares: 444,
      },
      {
        fiscalYear: "FY22",
        revenue: 226_954,
        operatingCashFlow: 7_392,
        capex: 3_891,
        sbc: 724,
        buybacks: 439,
        dilutedShares: 445,
      },
      {
        fiscalYear: "FY23",
        revenue: 242_290,
        operatingCashFlow: 11_068,
        capex: 4_323,
        sbc: 774,
        buybacks: 676,
        dilutedShares: 444,
      },
      {
        fiscalYear: "FY24",
        revenue: 254_453,
        operatingCashFlow: 11_339,
        capex: 4_710,
        sbc: 818,
        buybacks: 700,
        dilutedShares: 444,
      },
    ],
    defaultDcf: {
      wacc: 8.5,
      terminalMultiple: 26,
      targetFcfMargin: 3.1,
      sbcDragPct: 0.3,
    },
    filingDiffs: [
      {
        id: "cost-membership-hike",
        filingType: "10-K",
        filingDate: "2024-10-09",
        accessionNumber: "0000909832-24-000049",
        section: "Item 7: Membership Fees",
        category: "Capital Allocation",
        materiality: "High",
        headline: "First membership fee hike since 2017 takes effect Sept 2024 (+8.3%)",
        summary:
          "Gold Star rose from $60 to $65 and Executive from $120 to $130, flowing directly to high-margin operating income over the next 18 months.",
        priorExcerpt:
          "Membership fees were $4.58 billion in fiscal 2023, with US & Canada renewal rates at 92.7%.",
        currentExcerpt:
          "Effective September 1, 2024, US and Canada annual membership fees increased by $5 for Gold Star and $10 for Executive; renewal rates reached 92.9%.",
        signalNote:
          "Pure margin tailwind, though Reverse DCF shows the market already prices in double-digit 10Y revenue growth.",
      },
      {
        id: "cost-zero-dilution",
        filingType: "10-K",
        filingDate: "2024-10-09",
        accessionNumber: "0000909832-24-000049",
        section: "Item 8: Shareholders' Equity",
        category: "Executive Comp",
        materiality: "Watch",
        headline: "Zero net dilution over 5 years: SBC sits at just 0.32% of revenue",
        summary:
          "Costco serves as the gold-standard baseline for cash-flow cleanliness: diluted shares have held steady at 444M since FY20.",
        priorExcerpt:
          "Weighted-average diluted shares outstanding were 444.5 million for fiscal 2023.",
        currentExcerpt:
          "Weighted-average diluted shares outstanding were 444.4 million for fiscal 2024.",
        signalNote:
          "Benchmark contrast: pristine earnings quality, leaving valuation multiple risk as the primary debate.",
      },
    ],
  },
];

export function getCompanyByTicker(ticker: string): CompanySnapshot | undefined {
  const normalized = ticker.trim().toUpperCase();
  return PILOT_TICKERS.find((c) => c.ticker === normalized);
}
