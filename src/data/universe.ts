import type { CompanySnapshot } from "@/lib/finance";
import { buildSearchIndexEntry } from "@/data/search-index";
import companiesJson from "@/data/generated/companies.json";

export type { SearchIndexEntry } from "@/data/search-index";

export const ALL_COMPANIES: CompanySnapshot[] =
  companiesJson as unknown as CompanySnapshot[];

export const FEATURED_TICKERS = ["PLTR", "NVDA", "MSFT", "SNOW", "SHOP", "COST"];
let companiesByTicker: Map<string, CompanySnapshot> | undefined;

export function getCompany(ticker: string): CompanySnapshot | undefined {
  companiesByTicker ??= new Map(ALL_COMPANIES.map((company) => [company.ticker, company]));
  const normalized = ticker.trim().toUpperCase();
  return companiesByTicker.get(normalized);
}

export const SEARCH_INDEX = ALL_COMPANIES.map(buildSearchIndexEntry);
