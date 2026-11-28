import type { CompanySnapshot } from "@/lib/finance";
import { reconcileFilingInputs } from "@/data/filing-supplements";
import { buildSearchIndexEntry } from "@/data/search-index";
import companiesJson from "@/data/generated/companies.json";
import { withValuationBusinessFacts } from "@/data/valuation-business-facts";

export type { SearchIndexEntry } from "@/data/search-index";

export const ALL_COMPANIES: CompanySnapshot[] =
  (companiesJson as unknown as CompanySnapshot[]).map((company) =>
    reconcileFilingInputs(withValuationBusinessFacts(company)));

export const FEATURED_TICKERS = ["PLTR", "NVDA", "MSFT", "SNOW", "SHOP", "COST"];
let companiesByTicker: Map<string, CompanySnapshot> | undefined;

export function getCompany(ticker: string): CompanySnapshot | undefined {
  companiesByTicker ??= new Map(ALL_COMPANIES.map((company) => [company.ticker, company]));
  const normalized = ticker.trim().toUpperCase();
  return companiesByTicker.get(normalized);
}

let searchIndex: ReturnType<typeof buildSearchIndexEntry>[] | undefined;

export function getStaticSearchIndex() {
  return searchIndex ??= ALL_COMPANIES.map((company) => buildSearchIndexEntry(company));
}
