import type { CompanySnapshot } from "@/lib/finance";
import type { SearchIndexEntry } from "@/data/search-index";
import companiesJson from "@/data/generated/companies.json";
import searchIndexJson from "@/data/generated/search-index.json";

export type { SearchIndexEntry } from "@/data/search-index";

export const ALL_COMPANIES: CompanySnapshot[] =
  companiesJson as unknown as CompanySnapshot[];

export const SEARCH_INDEX: SearchIndexEntry[] =
  searchIndexJson as unknown as SearchIndexEntry[];

export const FEATURED_TICKERS = ["PLTR", "NVDA", "MSFT", "SNOW", "SHOP", "COST"];

export function getCompany(ticker: string): CompanySnapshot | undefined {
  const normalized = ticker.trim().toUpperCase();
  return ALL_COMPANIES.find((c) => c.ticker === normalized);
}
