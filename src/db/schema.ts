import {
  pgTable,
  text,
  doublePrecision,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export interface DefaultDcfJson {
  wacc: number;
  terminalMultiple: number;
  targetFcfMargin: number;
  sbcDragPct: number;
}

export interface AnnualPricePointJson {
  fiscalYear: string;
  price: number;
}

export const companies = pgTable("companies", {
  ticker: text("ticker").primaryKey(),
  cik: text("cik").notNull().unique(),
  name: text("name").notNull(),
  exchange: text("exchange").notNull(), // "NASDAQ" | "NYSE"
  sector: text("sector").notNull(),
  tagline: text("tagline").notNull(),
  price: doublePrecision("price").notNull(),
  marketCap: doublePrecision("market_cap").notNull(), // $M
  cashAndEquiv: doublePrecision("cash_and_equiv").notNull(), // $M
  totalDebt: doublePrecision("total_debt").notNull(), // $M
  lastFilingType: text("last_filing_type").notNull(), // "10-K" | "10-Q"
  lastFilingDate: text("last_filing_date").notNull(),
  lastFilingPeriodEnd: text("last_filing_period_end").notNull(),
  lastFilingAccession: text("last_filing_accession").notNull(),
  defaultDcf: jsonb("default_dcf").$type<DefaultDcfJson>().notNull(),
  priceHistory: jsonb("price_history").$type<AnnualPricePointJson[]>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const annualFinancials = pgTable(
  "annual_financials",
  {
    id: text("id").primaryKey(), // e.g. "NVDA:FY25"
    ticker: text("ticker")
      .notNull()
      .references(() => companies.ticker, { onDelete: "cascade" }),
    fiscalYear: text("fiscal_year").notNull(),
    sortOrder: integer("sort_order").notNull(),
    revenue: doublePrecision("revenue").notNull(), // $M
    operatingCashFlow: doublePrecision("operating_cash_flow").notNull(), // $M
    capex: doublePrecision("capex").notNull(), // $M
    sbc: doublePrecision("sbc").notNull(), // $M
    buybacks: doublePrecision("buybacks").notNull(), // $M
    dilutedShares: doublePrecision("diluted_shares").notNull(), // Millions
    grossProfit: doublePrecision("gross_profit"), // $M (optional)
    rdExpense: doublePrecision("rd_expense"), // $M (optional)
    sgaExpense: doublePrecision("sga_expense"), // $M (optional)
    operatingIncome: doublePrecision("operating_income"), // $M (optional)
    netIncome: doublePrecision("net_income"), // $M (optional)
    stockholdersEquity: doublePrecision("stockholders_equity"), // $M (optional, for ROIC)
  },
  (table) => [
    uniqueIndex("annual_ticker_fy_idx").on(table.ticker, table.fiscalYear),
    index("annual_ticker_idx").on(table.ticker),
  ]
);

export const filingDiffs = pgTable(
  "filing_diffs",
  {
    id: text("id").primaryKey(),
    ticker: text("ticker")
      .notNull()
      .references(() => companies.ticker, { onDelete: "cascade" }),
    filingType: text("filing_type").notNull(), // "10-K" | "10-Q" | "DEF 14A" | "Form 4"
    filingDate: text("filing_date").notNull(),
    accessionNumber: text("accession_number").notNull(),
    section: text("section").notNull(),
    category: text("category").notNull(),
    materiality: text("materiality").notNull(), // "High" | "Medium" | "Watch"
    headline: text("headline").notNull(),
    summary: text("summary").notNull(),
    priorExcerpt: text("prior_excerpt").notNull(),
    currentExcerpt: text("current_excerpt").notNull(),
    signalNote: text("signal_note").notNull(),
    source: text("source").notNull().default("xbrl"), // "curated" | "llm" | "text-diff" | "xbrl"
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("diffs_ticker_idx").on(table.ticker),
    index("diffs_accession_idx").on(table.accessionNumber),
  ]
);

export const alertSubscriptions = pgTable(
  "alert_subscriptions",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    ticker: text("ticker")
      .notNull()
      .references(() => companies.ticker, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("alert_email_ticker_idx").on(table.email, table.ticker),
  ]
);

export const insiderTrades = pgTable(
  "insider_trades",
  {
    id: text("id").primaryKey(),
    ticker: text("ticker")
      .notNull()
      .references(() => companies.ticker, { onDelete: "cascade" }),
    filingDate: text("filing_date").notNull(),
    insiderName: text("insider_name").notNull(),
    insiderTitle: text("insider_title").notNull(),
    transactionType: text("transaction_type").notNull(), // "Buy" | "Sell"
    shares: doublePrecision("shares").notNull(),
    pricePerShare: doublePrecision("price_per_share").notNull(),
    totalValue: doublePrecision("total_value").notNull(), // $M
    accessionNumber: text("accession_number").notNull(),
  },
  (table) => [index("insider_ticker_idx").on(table.ticker)]
);

export const arenaPortfolios = pgTable("arena_portfolios", {
  id: text("id").primaryKey(),
  handle: text("handle").notNull(),
  title: text("title").notNull(),
  thesis: text("thesis").notNull(),
  isBot: integer("is_bot").notNull().default(0), // 1 = Strategy Bot, 0 = Community
  botTheme: text("bot_theme"),
  lockedAt: timestamp("locked_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const arenaPositions = pgTable(
  "arena_positions",
  {
    id: text("id").primaryKey(),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => arenaPortfolios.id, { onDelete: "cascade" }),
    ticker: text("ticker")
      .notNull()
      .references(() => companies.ticker, { onDelete: "cascade" }),
    weightPct: doublePrecision("weight_pct").notNull(), // Normalized 0..100
    entryPrice: doublePrecision("entry_price").notNull(), // Server-locked EOD price
  },
  (table) => [index("arena_pos_portfolio_idx").on(table.portfolioId)]
);
