import { sql, type SQLWrapper } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
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

export interface QuarterlyFinancialJson {
  fiscalYear: string; // e.g. "25Q4"
  revenue: number;
  operatingCashFlow: number;
  capex: number;
  sbc: number;
  buybacks: number;
  dilutedShares: number;
}

export const companies = pgTable("companies", {
  ticker: text("ticker").primaryKey(),
  cik: text("cik").notNull(),
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
  quarterlyFinancials: jsonb("quarterly_financials").$type<QuarterlyFinancialJson[]>(),
  isActive: boolean("is_active").notNull().default(true),
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
    periodEndDate: text("period_end_date"), // e.g. "2025-09-27"
    cashAndEquiv: doublePrecision("cash_and_equiv"), // $M historical cash
    totalDebt: doublePrecision("total_debt"), // $M historical debt
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
    index("diffs_ticker_date_idx").on(table.ticker, table.filingDate),
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
    lastNotifiedAccession: text("last_notified_accession"),
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
  (table) => [
    index("insider_ticker_idx").on(table.ticker),
    index("insider_ticker_date_idx").on(table.ticker, table.filingDate),
    index("insider_type_date_idx").on(table.transactionType, table.filingDate),
  ]
);

/* Better Auth core tables (stored directly in Neon Postgres — $0/mo) */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  handle: text("handle"),
  avatarIcon: text("avatar_icon").notNull().default("compass"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export function arenaEntryPeriodKey({ periodKey, lockedAt }: { periodKey: SQLWrapper; lockedAt: SQLWrapper }) {
  // Use immutable date parts so the index also covers older entries without a period key.
  const utc = sql`${lockedAt} at time zone 'UTC'`;
  return sql`coalesce(${periodKey},
    lpad(extract(year from ${utc})::int::text, 4, '0') || '-' ||
    lpad(extract(month from ${utc})::int::text, 2, '0'))`;
}

export const arenaPortfolios = pgTable(
  "arena_portfolios",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    title: text("title").notNull(),
    thesis: text("thesis").notNull(),
    isBot: integer("is_bot").notNull().default(0), // 1 = Strategy Bot, 0 = Community
    botTheme: text("bot_theme"),
    avatarIcon: text("avatar_icon").notNull().default("compass"),
    periodKey: text("period_key"), // e.g. "2026-11" (monthly) or "2025" (yearly)
    nav: doublePrecision("nav").notNull().default(100), // Time-Weighted NAV (starts at 100.0)
    finalReturnPct: doublePrecision("final_return_pct"), // Set when a past period closes; null = live
    lockedAt: timestamp("locked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastRebalancedAt: timestamp("last_rebalanced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("arena_user_idx").on(table.userId),
    index("arena_period_idx").on(table.periodKey),
    uniqueIndex("arena_open_user_period_idx")
      .on(table.userId, arenaEntryPeriodKey(table))
      .where(sql`${table.isBot} = 0 and ${table.finalReturnPct} is null`),
  ]
);

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
    entryPrice: doublePrecision("entry_price").notNull(), // Server-locked EOD price at entry/rebalance
  },
  (table) => [index("arena_pos_portfolio_idx").on(table.portfolioId)]
);

export const arenaRebalances = pgTable(
  "arena_rebalances",
  {
    id: text("id").primaryKey(),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => arenaPortfolios.id, { onDelete: "cascade" }),
    navAtRebalance: doublePrecision("nav_at_rebalance").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("arena_reb_portfolio_idx").on(table.portfolioId)]
);

export const userWatchlists = pgTable(
  "user_watchlists",
  {
    id: text("id").primaryKey(), // `${userId}:${ticker}`
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ticker: text("ticker")
      .notNull()
      .references(() => companies.ticker, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("user_watchlist_user_idx").on(table.userId)]
);
