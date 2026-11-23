import type { DiscoveryLens, IndexSortKey } from "./insights.ts";

type SortDirection = "asc" | "desc";
type LensSort = Pick<DiscoveryLens, "id" | "defaultSortKey" | "defaultSortDir">;

const numericFilters = ["fcf", "sbc", "imp", "dil"] as const;

export function exploreSortDefaults(lens: LensSort | null) {
  return {
    sortKey: lens?.defaultSortKey ?? "marketCap",
    sortDir: lens?.defaultSortDir ?? "desc",
  };
}

export function readExploreLink(
  params: URLSearchParams,
  initialLens: LensSort | null,
  lenses: readonly LensSort[],
  sectors: readonly string[],
  sortableKeys: (lensId: string | null) => readonly IndexSortKey[],
) {
  const lensParam = params.get("lens");
  const lens = lensParam === "all" ? null : lenses.find(({ id }) => id === lensParam) ?? initialLens;
  const { sortKey: defaultKey, sortDir: defaultDir } = exploreSortDefaults(lens);
  const sortKey = sortableKeys(lens?.id ?? null).find((key) => key === params.get("sort"));
  const direction = params.get("dir");
  const sector = sectors.find((value) => value === params.get("sector")) ?? "All";

  return {
    lensId: lens?.id ?? null,
    sector,
    sortKey: sortKey ?? defaultKey,
    // Older links omitted the direction when it was descending.
    sortDir: direction === "asc" || direction === "desc" ? direction : sortKey ? "desc" : defaultDir,
    fcf: numericFilter(params.get("fcf")),
    sbc: numericFilter(params.get("sbc")),
    imp: numericFilter(params.get("imp")),
    dil: numericFilter(params.get("dil")),
  };
}

function numericFilter(raw: string | null) {
  const value = raw?.trim() ?? "";
  return value && Number.isFinite(Number(value)) ? value : "";
}

export function writeExploreLink(
  params: URLSearchParams,
  state: Record<typeof numericFilters[number], string> & {
    sector: string;
    sortKey: IndexSortKey;
    sortDir: SortDirection;
  },
  lens: LensSort | null,
  initialLens: LensSort | null,
) {
  const set = (key: string, value: string) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };
  set("lens", lens?.id ?? (initialLens ? "all" : ""));
  for (const key of numericFilters) set(key, numericFilter(state[key]));
  set("sector", state.sector === "All" ? "" : state.sector);
  const defaults = exploreSortDefaults(lens);
  const customSort = state.sortKey !== defaults.sortKey || state.sortDir !== defaults.sortDir;
  set("sort", customSort ? state.sortKey : "");
  set("dir", customSort ? state.sortDir : "");
}
