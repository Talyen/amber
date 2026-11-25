import type { SearchIndexEntry } from "../data/search-index.ts";

type SearchableCompany = Pick<SearchIndexEntry, "ticker" | "name" | "sector" | "marketCap">;

export function searchCompanies<T extends SearchableCompany>(
  entries: readonly T[],
  query: string,
  limit: number,
): T[] {
  const term = query.trim().toLowerCase();
  const matches: Array<{ entry: T; rank: number }> = [];
  for (const entry of entries) {
    const ticker = entry.ticker.toLowerCase();
    if (term && ticker === term) matches.push({ entry, rank: 2 });
    else if (term && ticker.startsWith(term)) matches.push({ entry, rank: 1 });
    else if (
      ticker.includes(term) ||
      entry.name.toLowerCase().includes(term) ||
      entry.sector.toLowerCase().includes(term)
    ) matches.push({ entry, rank: 0 });
  }

  return matches
    .sort((a, b) => b.rank - a.rank || b.entry.marketCap - a.entry.marketCap)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
