"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowRight,
  Compass,
  FileDiff,
  Flame,
  Landmark,
  SlidersHorizontal,
  Star,
  TrendingUp,
  UserCheck,
  X,
} from "lucide-react";
import type { SearchIndexEntry } from "@/data/search-index";
import type {
  InsiderBuySummary,
  MarketFilingDiffItem,
  MarketInsiderFeedItem,
  MaterialEventSummary,
} from "@/data/repository";
import { useWatchlist } from "@/lib/watchlist";
import { authClient } from "@/lib/auth-client";
import {
  computePresetExpectedReturn,
  readAllLocalValuationPresets,
  type SavedValuationPreset,
} from "@/lib/valuation-presets";
import {
  readLocalSavedScreens,
  writeLocalSavedScreens,
  type SavedScreen,
} from "@/lib/saved-screens";
import { TopNav } from "@/components/TopNav";
import { CommandSearch } from "@/components/CommandSearch";
import { ExploreScreenerDrawer } from "@/components/ExploreScreenerDrawer";
import { ExploreSignalStrip } from "@/components/ExploreSignalStrip";
import { selectFeaturedSignals } from "@/lib/featured-signals";
import { MethodologyModal } from "@/components/MethodologyModal";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";
import {
  computeRuleOf40Score,
  DISCOVERY_LENSES,
  type IndexSortKey,
} from "@/lib/insights";

import { readExploreLink, writeExploreLink } from "@/lib/explore-link";

type SortKey = IndexSortKey;

const LENS_STYLES: Record<
  string,
  { icon: typeof Landmark; badge: string }
> = {
  "cash-machines": {
    icon: Landmark,
    badge: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400",
  },
  "buyback-cannibals": {
    icon: Flame,
    badge: "bg-orange-500/12 text-orange-600 ring-orange-500/25 dark:text-orange-400",
  },
  underpriced: {
    icon: Compass,
    badge: "bg-teal-500/12 text-teal-600 ring-teal-500/25 dark:text-teal-400",
  },
  "rule-of-40": {
    icon: TrendingUp,
    badge: "bg-indigo-500/12 text-indigo-600 ring-indigo-500/25 dark:text-indigo-400",
  },
  "hidden-dilution": {
    icon: AlertTriangle,
    badge: "bg-rose-500/12 text-rose-600 ring-rose-500/25 dark:text-rose-400",
  },
  "insider-buys": {
    icon: UserCheck,
    badge: "bg-green-500/12 text-green-600 ring-green-500/25 dark:text-green-400",
  },
  "material-events": {
    icon: FileDiff,
    badge: "bg-sky-500/12 text-sky-600 ring-sky-500/25 dark:text-sky-400",
  },
};

function getSortColumns(lensId: string | null) {
  const isInsiderLens = lensId === "insider-buys";
  const isEventLens = lensId === "material-events";
  const isUnderpricedLens = lensId === "underpriced";
  const isRuleOf40Lens = lensId === "rule-of-40";

  const columns: Array<{
    key?: SortKey;
    label: string;
    tip?: string;
    alignLeft?: boolean;
  }> = isInsiderLens
    ? [
        { key: "marketCap", label: "Mkt Cap", tip: "Latest market capitalization" },
        {
          key: "insiderBuyValue",
          label: "Insider Buys",
          tip: "Total recent open-market Form 4 purchase value",
        },
        { label: "Latest Buyer", alignLeft: true },
        {
          key: "insiderBuyDate",
          label: "Filed",
          tip: "Most recent Form 4 open-market buy date",
        },
        { key: "trueFcfMargin", label: "True FCF %", tip: "True Free Cash Flow as % of Revenue" },
        {
          key: "impliedCagr",
          label: "Priced-In Growth",
          tip: "10-year annual revenue growth rate already priced into today's stock price (Reverse DCF)",
        },
      ]
    : isEventLens
      ? [
          { key: "marketCap", label: "Mkt Cap", tip: "Latest market capitalization" },
          { label: "Form 8-K Event", alignLeft: true },
          { label: "Items" },
          {
            key: "eventDate",
            label: "Filed",
            tip: "Most recent high-signal Form 8-K filing date",
          },
          {
            key: "trueFcf",
            label: "True FCF",
            tip: "Free Cash Flow minus Stock-Based Compensation (real cash after equity dilution)",
          },
        ]
      : isUnderpricedLens
        ? [
            { key: "marketCap", label: "Mkt Cap", tip: "Latest market capitalization" },
            { label: "Price", tip: "Latest share price" },
            {
              label: "Fair Value",
              tip: "Amber's 5-year Base Case DCF fair value per share (10% hurdle rate)",
            },
            {
              key: "fairValueUpsidePct",
              label: "Est. Upside",
              tip: "Estimated upside/downside vs. Amber's 5-year Base Case DCF fair value",
            },
            {
              key: "trueFcfMargin",
              label: "True FCF %",
              tip: "True Free Cash Flow as a percentage of Revenue",
            },
            {
              key: "impliedCagr",
              label: "Priced-In Growth",
              tip: "10-year annual revenue growth rate already priced into today's stock price (Reverse DCF)",
            },
          ]
        : isRuleOf40Lens
          ? [
              { key: "marketCap", label: "Mkt Cap", tip: "Latest market capitalization" },
              {
                key: "ruleOf40",
                label: "Rule of 40",
                tip: "Annualized revenue growth % + True FCF % (after stock-based compensation)",
              },
              {
                key: "revenueCagr",
                label: "Rev Growth",
                tip: "Annualized multi-year revenue growth rate",
              },
              {
                key: "trueFcfMargin",
                label: "True FCF %",
                tip: "True Free Cash Flow as a percentage of Revenue",
              },
              {
                key: "sbcPctRevenue",
                label: "Stock Comp %",
                tip: "Employee stock-based compensation as a % of Revenue",
              },
              {
                key: "impliedCagr",
                label: "Priced-In Growth",
                tip: "10-year annual revenue growth rate already priced into today's stock price (Reverse DCF)",
              },
            ]
          : [
            { key: "marketCap", label: "Mkt Cap", tip: "Latest market capitalization" },
            {
              key: "trueFcf",
              label: "True FCF",
              tip: "Free Cash Flow minus Stock-Based Compensation (real cash after equity dilution)",
            },
            {
              key: "trueFcfMargin",
              label: "True FCF %",
              tip: "True Free Cash Flow as a percentage of Revenue",
            },
            {
              key: "sbcPctRevenue",
              label: "Stock Comp %",
              tip: "Employee stock-based compensation as a % of Revenue",
            },
            {
              key: "netDilutionCagr",
              label: "Share Chg (4Y)",
              tip: "Annualized 4-year change in diluted share count (negative = buyback shrinkage)",
            },
            {
              key: "impliedCagr",
              label: "Priced-In Growth",
              tip: "10-year annual revenue growth rate already priced into today's stock price (Reverse DCF)",
            },
          ];

  return columns;
}

function sortableKeys(lensId: string | null) {
  return getSortColumns(lensId).flatMap(({ key }) => key ? [key] : []);
}

export function SignalIndex({
  entries = [],
  initialLensId = null,
  recentDiffs = [],
  recentInsiders = [],
  trendingTickers = [],
  insiderBuySummaries = {},
  materialEventSummaries = {},
}: {
  entries?: SearchIndexEntry[];
  initialLensId?: string | null;
  recentDiffs?: MarketFilingDiffItem[];
  recentInsiders?: MarketInsiderFeedItem[];
  trendingTickers?: string[];
  insiderBuySummaries?: Record<string, InsiderBuySummary>;
  materialEventSummaries?: Record<string, MaterialEventSummary>;
}) {
  const initialLens = initialLensId
    ? DISCOVERY_LENSES.find((l) => l.id === initialLensId) ?? null
    : null;
  const [sortKey, setSortKey] = useState<SortKey>(
    initialLens?.defaultSortKey ?? "marketCap"
  );
  const [sortDir, setSortDir] = useState<"desc" | "asc">(
    initialLens?.defaultSortDir ?? "desc"
  );
  const [filter, setFilter] = useState("");
  const [selectedSector, setSelectedSector] = useState<string>("All");
  const [activeLensId, setActiveLensId] = useState<string | null>(
    initialLens?.id ?? null
  );
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [groupBySector, setGroupBySector] = useState(false);
  const [screenerOpen, setScreenerOpen] = useState(false);
  const [minFcfMargin, setMinFcfMargin] = useState("");
  const [maxSbcPct, setMaxSbcPct] = useState("");
  const [maxImplied, setMaxImplied] = useState("");
  const [maxDilution, setMaxDilution] = useState("");
  const [minMarketCapB, setMinMarketCapB] = useState("");
  const [minShareholderYield, setMinShareholderYield] = useState("");
  const [maxPtbv, setMaxPtbv] = useState("");
  const [minRotce, setMinRotce] = useState("");
  const [maxPffo, setMaxPffo] = useState("");
  const [minThesisIrr, setMinThesisIrr] = useState("");
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(30);
  const watchlist = useWatchlist();
  const { data: session } = authClient.useSession();
  const sessionUserId = session?.user?.id ?? null;
  const [savedTheses, setSavedTheses] = useState<Record<string, SavedValuationPreset>>({});

  useEffect(() => {
    let active = true;
    const local = readAllLocalValuationPresets(sessionUserId);
    queueMicrotask(() => {
      if (active) setSavedTheses(local);
    });
    if (!sessionUserId) {
      return () => {
        active = false;
      };
    }
    const controller = new AbortController();
    fetch("/api/valuation-presets", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { presets?: SavedValuationPreset[] } | null) => {
        if (!active || !data?.presets) return;
        const merged: Record<string, SavedValuationPreset> = { ...local };
        for (const preset of data.presets) {
          const existing = merged[preset.ticker];
          if (
            !existing ||
            Date.parse(preset.updatedAt) >= Date.parse(existing.updatedAt)
          ) {
            merged[preset.ticker] = preset;
          }
        }
        setSavedTheses(merged);
      })
      .catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, [sessionUserId]);

  useEffect(() => {
    let active = true;
    const local = readLocalSavedScreens(sessionUserId);
    queueMicrotask(() => {
      if (active) setSavedScreens(local);
    });
    if (!sessionUserId) {
      return () => {
        active = false;
      };
    }
    const controller = new AbortController();
    fetch("/api/saved-screens", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { screens?: SavedScreen[] } | null) => {
        if (active && Array.isArray(data?.screens)) {
          setSavedScreens(data.screens);
          writeLocalSavedScreens(data.screens, sessionUserId);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, [sessionUserId]);

  const sectors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of entries) {
      counts.set(c.sector, (counts.get(c.sector) ?? 0) + 1);
    }
    return [
      "All",
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7)
        .map(([sector]) => sector),
    ];
  }, [entries]);

  const [hydratedLens, setHydratedLens] = useState<string | null>();
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const state = readExploreLink(
        new URLSearchParams(window.location.search),
        initialLens,
        DISCOVERY_LENSES,
        sectors,
        sortableKeys,
      );
      setActiveLensId(state.lensId);
      setSelectedSector(state.sector);
      setSortKey(state.sortKey);
      setSortDir(state.sortDir);
      setMinFcfMargin(state.fcf);
      setMaxSbcPct(state.sbc);
      setMaxImplied(state.imp);
      setMaxDilution(state.dil);
      setMinMarketCapB(state.cap);
      setMinShareholderYield(state.shy);
      setMaxPtbv(state.ptbv);
      setMinRotce(state.rotce);
      setMaxPffo(state.pffo);
      setMinThesisIrr(state.irr);
      setScreenerOpen(
        Boolean(
          state.fcf ||
            state.sbc ||
            state.imp ||
            state.dil ||
            state.cap ||
            state.shy ||
            state.ptbv ||
            state.rotce ||
            state.pffo ||
            state.irr ||
            state.sector !== "All"
        )
      );
      setHydratedLens(initialLens?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, [initialLens, sectors]);

  const activeFilterCount =
    (minFcfMargin.trim() ? 1 : 0) +
    (maxSbcPct.trim() ? 1 : 0) +
    (maxImplied.trim() ? 1 : 0) +
    (maxDilution.trim() ? 1 : 0) +
    (minMarketCapB.trim() ? 1 : 0) +
    (minShareholderYield.trim() ? 1 : 0) +
    (maxPtbv.trim() ? 1 : 0) +
    (minRotce.trim() ? 1 : 0) +
    (maxPffo.trim() ? 1 : 0) +
    (minThesisIrr.trim() ? 1 : 0) +
    (selectedSector !== "All" ? 1 : 0) +
    (groupBySector ? 1 : 0);

  const hasCustomScreen = activeFilterCount > 0;

  const activeLens = DISCOVERY_LENSES.find((l) => l.id === activeLensId) ?? null;

  useEffect(() => {
    if (hydratedLens !== (initialLens?.id ?? null)) return;
    const url = new URL(window.location.href);
    writeExploreLink(url.searchParams, {
      sector: selectedSector,
      sortKey,
      sortDir,
      fcf: minFcfMargin,
      sbc: maxSbcPct,
      imp: maxImplied,
      dil: maxDilution,
      cap: minMarketCapB,
      shy: minShareholderYield,
      ptbv: maxPtbv,
      rotce: minRotce,
      pffo: maxPffo,
      irr: minThesisIrr,
    }, activeLens, initialLens);
    if (url.href !== window.location.href) {
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, [
    activeLens,
    initialLens,
    hydratedLens,
    minFcfMargin,
    maxSbcPct,
    maxImplied,
    maxDilution,
    minMarketCapB,
    minShareholderYield,
    maxPtbv,
    minRotce,
    maxPffo,
    minThesisIrr,
    selectedSector,
    sortKey,
    sortDir,
  ]);

  const lensCtx = useMemo(
    () => ({
      insiderBuyTickers: new Set(Object.keys(insiderBuySummaries)),
      materialEventTickers: new Set(Object.keys(materialEventSummaries)),
    }),
    [insiderBuySummaries, materialEventSummaries]
  );

  const lensCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const lens of DISCOVERY_LENSES) {
      map.set(lens.id, entries.filter((e) => lens.filter(e, lensCtx)).length);
    }
    return map;
  }, [entries, lensCtx]);

  function selectLens(lensId: string | null) {
    if (!lensId || lensId === activeLensId) {
      setActiveLensId(null);
      setSortKey("marketCap");
      setSortDir("desc");
    } else {
      const found = DISCOVERY_LENSES.find((l) => l.id === lensId);
      setActiveLensId(lensId);
      if (found) {
        setSortKey(found.defaultSortKey);
        setSortDir(found.defaultSortDir);
      }
    }
    setVisibleLimit(30);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Guardrails: exclude extreme XBRL anomalies & banks from FCF margin leaderboards
  const leaderboardEligible = useMemo(
    () =>
      entries.filter(
        (c) =>
          c.revenue >= 250 &&
          c.trueFcfMargin <= 75 &&
          c.trueFcfMargin >= -120 &&
          c.sbcPctRevenue <= 85
      ),
    [entries]
  );

  const steepestSbc = useMemo(
    () =>
      [...leaderboardEligible]
        .filter((c) => c.sbcPctRevenue > 0)
        .sort((a, b) => b.sbcPctRevenue - a.sbcPctRevenue)
        .slice(0, 5),
    [leaderboardEligible]
  );

  const cleanestCash = useMemo(
    () =>
      [...leaderboardEligible]
        .filter((c) => c.trueFcfMargin > 0 && c.sbcPctRevenue <= 10)
        .sort((a, b) => b.trueFcfMargin - a.trueFcfMargin)
        .slice(0, 5),
    [leaderboardEligible]
  );

  const steepestImplied = useMemo(
    () =>
      [...leaderboardEligible]
        .filter((c) => c.impliedCagr > 0 && c.impliedCagr < 60)
        .sort((a, b) => b.impliedCagr - a.impliedCagr)
        .slice(0, 5),
    [leaderboardEligible]
  );

  const rows = useMemo<SearchIndexEntry[]>(() => {
    const q = filter.trim().toLowerCase();
    const minFcfVal = minFcfMargin.trim() !== "" ? Number(minFcfMargin) : null;
    const maxSbcVal = maxSbcPct.trim() !== "" ? Number(maxSbcPct) : null;
    const maxImpVal = maxImplied.trim() !== "" ? Number(maxImplied) : null;
    const maxDilVal = maxDilution.trim() !== "" ? Number(maxDilution) : null;
    const minCapVal = minMarketCapB.trim() !== "" ? Number(minMarketCapB) * 1000 : null;
    const minShyVal = minShareholderYield.trim() !== "" ? Number(minShareholderYield) : null;
    const maxPtbvVal = maxPtbv.trim() !== "" ? Number(maxPtbv) : null;
    const minRotceVal = minRotce.trim() !== "" ? Number(minRotce) : null;
    const maxPffoVal = maxPffo.trim() !== "" ? Number(maxPffo) : null;
    const minIrrVal = minThesisIrr.trim() !== "" ? Number(minThesisIrr) : null;

    const filtered = entries.filter((c) => {
      if (watchlistOnly && !watchlist.has(c.ticker)) return false;
      if (activeLens && !activeLens.filter(c, lensCtx)) return false;
      if (selectedSector !== "All" && c.sector !== selectedSector) return false;
      if (minFcfVal !== null && Number.isFinite(minFcfVal) && c.trueFcfMargin < minFcfVal) return false;
      if (maxSbcVal !== null && Number.isFinite(maxSbcVal) && c.sbcPctRevenue > maxSbcVal) return false;
      if (maxImpVal !== null && Number.isFinite(maxImpVal) && c.impliedCagr > maxImpVal) return false;
      if (maxDilVal !== null && Number.isFinite(maxDilVal) && c.netDilutionCagr > maxDilVal) return false;
      if (minCapVal !== null && Number.isFinite(minCapVal) && c.marketCap < minCapVal) return false;
      if (
        minShyVal !== null &&
        Number.isFinite(minShyVal) &&
        (typeof c.shareholderYieldPct !== "number" || c.shareholderYieldPct < minShyVal)
      ) {
        return false;
      }
      if (
        maxPtbvVal !== null &&
        Number.isFinite(maxPtbvVal) &&
        (typeof c.priceToTbv !== "number" || c.priceToTbv > maxPtbvVal)
      ) {
        return false;
      }
      if (
        minRotceVal !== null &&
        Number.isFinite(minRotceVal) &&
        (typeof c.rotcePct !== "number" || c.rotcePct < minRotceVal)
      ) {
        return false;
      }
      if (
        maxPffoVal !== null &&
        Number.isFinite(maxPffoVal) &&
        (typeof c.priceToFfo !== "number" || c.priceToFfo > maxPffoVal)
      ) {
        return false;
      }
      if (minIrrVal !== null && Number.isFinite(minIrrVal)) {
        const preset = savedTheses[c.ticker];
        if (!preset) return false;
        const proj = computePresetExpectedReturn(preset, c);
        if (!proj || proj.irrPct < minIrrVal) return false;
      }
      if (!q) return true;
      return (
        c.ticker.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.sector.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortKey === "insiderBuyValue") {
        diff =
          (insiderBuySummaries[a.ticker]?.totalBuyValue ?? 0) -
          (insiderBuySummaries[b.ticker]?.totalBuyValue ?? 0);
      } else if (sortKey === "insiderBuyDate") {
        const da = insiderBuySummaries[a.ticker]?.latestDate ?? "";
        const db = insiderBuySummaries[b.ticker]?.latestDate ?? "";
        diff = da.localeCompare(db) ||
          (insiderBuySummaries[a.ticker]?.totalBuyValue ?? 0) -
          (insiderBuySummaries[b.ticker]?.totalBuyValue ?? 0);
      } else if (sortKey === "eventDate") {
        const da = materialEventSummaries[a.ticker]?.filingDate ?? "";
        const db = materialEventSummaries[b.ticker]?.filingDate ?? "";
        diff = da.localeCompare(db) || a.marketCap - b.marketCap;
      } else if (sortKey === "fairValueUpsidePct") {
        diff = (a.fairValueUpsidePct ?? -999) - (b.fairValueUpsidePct ?? -999);
      } else if (sortKey === "revenueCagr") {
        diff = (a.revenueCagr ?? -999) - (b.revenueCagr ?? -999);
      } else if (sortKey === "ruleOf40") {
        diff = computeRuleOf40Score(a) - computeRuleOf40Score(b);
      } else {
        diff = a[sortKey] - b[sortKey];
      }
      return sortDir === "desc" ? -diff : diff;
    });
  }, [
    entries,
    filter,
    selectedSector,
    activeLens,
    watchlistOnly,
    watchlist,
    lensCtx,
    insiderBuySummaries,
    materialEventSummaries,
    minFcfMargin,
    maxSbcPct,
    maxImplied,
    maxDilution,
    minMarketCapB,
    minShareholderYield,
    maxPtbv,
    minRotce,
    maxPffo,
    minThesisIrr,
    savedTheses,
    sortKey,
    sortDir,
  ]);

  const visibleRows = rows.slice(0, visibleLimit);

  const groupedBySector = useMemo(() => {
    if (!groupBySector) return [];
    const map = new Map<string, SearchIndexEntry[]>();
    // Cap per-sector DOM rows when viewing the full universe so toggling Group by Sector stays instant
    for (const c of visibleRows) {
      const list = map.get(c.sector) ?? [];
      list.push(c);
      map.set(c.sector, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [groupBySector, visibleRows]);

  const isInsiderLens = activeLensId === "insider-buys";
  const isEventLens = activeLensId === "material-events";
  const isUnderpricedLens = activeLensId === "underpriced";
  const isRuleOf40Lens = activeLensId === "rule-of-40";

  const sortColumns = getSortColumns(activeLensId);

  const colCount = sortColumns.length + 1;

  function renderRow(c: SearchIndexEntry) {
    const starred = watchlist.has(c.ticker);
    const href = isInsiderLens
      ? `/t/${c.ticker}?tab=insiders`
      : isEventLens
        ? `/t/${c.ticker}?tab=diffs`
        : isUnderpricedLens
          ? `/t/${c.ticker}?tab=dcf`
          : `/t/${c.ticker}`;
    const buyInfo = insiderBuySummaries[c.ticker];
    const eventInfo = materialEventSummaries[c.ticker];

    return (
      <tr key={c.ticker}>
        <th scope="row">
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              disabled={!watchlist.canEdit}
              onClick={() => watchlist.toggle(c.ticker)}
              aria-label={
                starred
                  ? `Remove ${c.ticker} from watchlist`
                  : `Add ${c.ticker} to watchlist`
              }
              className={`transition-colors cursor-pointer disabled:cursor-wait ${
                starred
                  ? "text-[var(--amber)]"
                  : "text-[var(--border-strong)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <Star
                className="h-3.5 w-3.5"
                fill={starred ? "currentColor" : "none"}
              />
            </button>
            <Link
              href={href}
              className="group inline-flex items-center gap-2 hover:text-[var(--amber)]"
            >
              <span className="font-mono-num w-12 font-semibold text-[var(--amber)]">
                {c.ticker}
              </span>
              <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                {c.name}
              </span>
            </Link>
            {watchlistOnly && savedTheses[c.ticker] && (
              <Link
                href={`/t/${c.ticker}?tab=dcf&model=scenario`}
                title={
                  savedTheses[c.ticker].thesisNote ??
                  `Saved ${savedTheses[c.ticker].lens.toUpperCase()} thesis`
                }
                className="rounded border border-[var(--amber-border)] bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--amber)] hover:opacity-90"
              >
                Thesis
              </Link>
            )}
          </div>
        </th>
        <td data-label="Mkt Cap" className="font-mono-num">
          {formatCurrencyCompact(c.marketCap)}
        </td>

        {isInsiderLens ? (
          <>
            <td
              data-label="Insider Buys"
              className="font-mono-num font-semibold text-[var(--positive)]"
            >
              {buyInfo ? formatCurrencyCompact(buyInfo.totalBuyValue) : "—"}
              {buyInfo && buyInfo.buyCount > 1 && (
                <span className="ml-1 text-[11px] font-normal text-[var(--text-muted)]">
                  ({buyInfo.buyCount})
                </span>
              )}
            </td>
            <td data-label="Latest Buyer" className="!text-left">
              <div className="max-w-[200px] truncate text-xs text-[var(--text-primary)]">
                {buyInfo?.latestBuyer ?? "—"}
              </div>
              {buyInfo?.latestTitle && (
                <div className="max-w-[200px] truncate text-[11px] text-[var(--text-muted)]">
                  {buyInfo.latestTitle}
                </div>
              )}
            </td>
            <td data-label="Filed" className="font-mono-num text-[var(--text-secondary)]">
              {buyInfo?.latestDate ?? "—"}
            </td>
            <td data-label="True FCF %" className="font-mono-num">
              {formatPct(c.trueFcfMargin)}
            </td>
            <td data-label="Priced-In Growth" className="font-mono-num font-medium">
              {formatPct(c.impliedCagr)}
            </td>
          </>
        ) : isEventLens ? (
          <>
            <td data-label="Form 8-K Event" className="!text-left">
              <Link
                href={href}
                className="block max-w-[240px] truncate text-xs font-medium text-[var(--text-primary)] hover:text-[var(--amber)]"
              >
                {eventInfo?.headline ?? "—"}
              </Link>
              {eventInfo && eventInfo.eventCount > 1 && (
                <span className="text-[11px] text-[var(--text-muted)]">
                  +{eventInfo.eventCount - 1} more recent 8-K
                </span>
              )}
            </td>
            <td data-label="Items" className="font-mono-num text-xs text-[var(--amber)]">
              {eventInfo?.section ?? "—"}
            </td>
            <td data-label="Filed" className="font-mono-num text-[var(--text-secondary)]">
              {eventInfo?.filingDate ?? "—"}
            </td>
            <td
              data-label="True FCF"
              className={`font-mono-num font-semibold ${
                c.trueFcf >= 0
                  ? "text-[var(--amber)]"
                  : "text-[var(--negative)]"
              }`}
            >
              {formatCurrencyCompact(c.trueFcf)}
            </td>
          </>
        ) : isUnderpricedLens ? (
          <>
            <td data-label="Price" className="font-mono-num text-[var(--text-secondary)]">
              {typeof c.price === "number" ? `$${c.price.toFixed(2)}` : "—"}
            </td>
            <td data-label="Fair Value" className="font-mono-num font-medium text-[var(--text-primary)]">
              {typeof c.fairValue === "number" ? `$${c.fairValue.toFixed(2)}` : "—"}
            </td>
            <td
              data-label="Est. Upside"
              className={`font-mono-num font-semibold ${
                (c.fairValueUpsidePct ?? 0) >= 0
                  ? "text-[var(--positive)]"
                  : "text-[var(--negative)]"
              }`}
            >
              {typeof c.fairValueUpsidePct === "number"
                ? formatPct(c.fairValueUpsidePct, true)
                : "—"}
            </td>
            <td data-label="True FCF %" className="font-mono-num">
              {formatPct(c.trueFcfMargin)}
            </td>
            <td data-label="Priced-In Growth" className="font-mono-num font-medium">
              {formatPct(c.impliedCagr)}
            </td>
          </>
        ) : isRuleOf40Lens ? (
          <>
            <td
              data-label="Rule of 40"
              className="font-mono-num font-semibold text-[var(--amber)]"
            >
              {computeRuleOf40Score(c).toFixed(1)}
            </td>
            <td
              data-label="Rev Growth"
              className="font-mono-num text-[var(--positive)]"
            >
              {typeof c.revenueCagr === "number"
                ? formatPct(c.revenueCagr, true)
                : "—"}
            </td>
            <td data-label="True FCF %" className="font-mono-num">
              {formatPct(c.trueFcfMargin)}
            </td>
            <td
              data-label="Stock Comp %"
              className="font-mono-num text-[var(--sbc)]"
            >
              {formatPct(c.sbcPctRevenue)}
            </td>
            <td
              data-label="Priced-In Growth"
              className="font-mono-num font-medium"
            >
              {formatPct(c.impliedCagr)}
            </td>
          </>
        ) : (
          <>
            <td
              data-label="True FCF"
              className={`font-mono-num font-semibold ${
                c.trueFcf >= 0
                  ? "text-[var(--amber)]"
                  : "text-[var(--negative)]"
              }`}
            >
              {formatCurrencyCompact(c.trueFcf)}
            </td>
            <td data-label="True FCF %" className="font-mono-num">
              {formatPct(c.trueFcfMargin)}
            </td>
            <td
              data-label="Stock Comp %"
              className="font-mono-num text-[var(--sbc)]"
            >
              {formatPct(c.sbcPctRevenue)}
            </td>
            <td
              data-label="Share Chg (4Y)"
              className={`font-mono-num ${
                c.netDilutionCagr > 1.5
                  ? "text-[var(--negative)]"
                  : c.netDilutionCagr < -0.5
                    ? "text-[var(--positive)]"
                    : "text-[var(--text-secondary)]"
              }`}
            >
              {formatPct(c.netDilutionCagr, true)}
            </td>
            <td
              data-label="Priced-In Growth"
              className="font-mono-num font-medium"
            >
              {formatPct(c.impliedCagr)}
            </td>
          </>
        )}
      </tr>
    );
  }

  const { featuredDiffs, featuredInsiderBuy } = useMemo(
    () =>
      selectFeaturedSignals({
        diffs: recentDiffs,
        insiders: recentInsiders,
        entries,
        trendingTickers,
      }),
    [recentDiffs, recentInsiders, entries, trendingTickers]
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        {/* Quiet Tool Header */}
        <section className="border-b border-[var(--border)] pb-8">
          <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] sm:text-4xl">
            Understand any public company in 60 seconds.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
            Financials, SEC filing changes, implied growth, and Form 4 insider trades across {entries.length} public companies.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <CommandSearch variant="hero" initialEntries={entries} />
            <Link
              href="/t/NVDA"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)]"
            >
              Explore NVDA
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Trending Filings & Insider Activity */}
        {!initialLensId && (
          <ExploreSignalStrip
            entries={entries}
            featuredDiffs={featuredDiffs}
            featuredInsiderBuy={featuredInsiderBuy}
            hasInWatchlist={watchlist.has}
            onToggleWatchlist={watchlist.toggle}
          />
        )}

        {/* Companies Table + Integrated Lens Filters */}
        <section className="mt-8 @container/explore">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2
                id="coverage-caption"
                className="flex items-baseline gap-2 text-sm font-semibold text-[var(--text-primary)]"
              >
                <span>Companies</span>
                <span className="font-mono-num text-xs font-normal text-[var(--text-muted)]">
                  {rows.length}
                </span>
              </h2>

              <button
                type="button"
                onClick={() => {
                  setWatchlistOnly((prev) => !prev);
                  setVisibleLimit(30);
                }}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors cursor-pointer ${
                  watchlistOnly
                    ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Star
                  className="h-3.5 w-3.5"
                  fill={watchlistOnly ? "currentColor" : "none"}
                />
                Watchlist
                {watchlist.tickers.length > 0 && (
                  <span className="font-mono-num opacity-75">
                    ({watchlist.tickers.length})
                  </span>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setVisibleLimit(30);
                }}
                placeholder="Filter table…"
                aria-label="Filter companies table"
                className="h-8 w-44 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber-border)]"
              />

              <select
                aria-label="Sort companies"
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(":") as [IndexSortKey, "asc" | "desc"];
                  setSortKey(k);
                  setSortDir(d);
                }}
                className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-secondary)] focus:border-[var(--amber-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber-border)] @min-[642px]/explore:hidden"
              >
                {sortColumns.flatMap(({ key, label }) => key ? (
                  (["desc", "asc"] as const).map((direction) => (
                    <option key={`${key}:${direction}`} value={`${key}:${direction}`}>
                      {label} ({key.endsWith("Date")
                        ? direction === "desc" ? "Newest first" : "Oldest first"
                        : direction === "desc" ? "High to low" : "Low to high"})
                    </option>
                  ))
                ) : [])}
              </select>

              <button
                type="button"
                onClick={() => setScreenerOpen((prev) => !prev)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors cursor-pointer ${
                  screenerOpen || hasCustomScreen
                    ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="font-mono-num rounded-full bg-[var(--cta-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--cta-fg)]">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Integrated Discovery Lens Strip */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {DISCOVERY_LENSES.map((lens) => {
              const isSelected = activeLensId === lens.id;
              const matchCount = lensCounts.get(lens.id) ?? 0;
              const style = LENS_STYLES[lens.id] ?? {
                icon: Compass,
                badge: "bg-amber-500/12 text-amber-600 ring-amber-500/25 dark:text-amber-400",
              };
              const LensIcon = style.icon;
              return (
                <button
                  key={lens.id}
                  type="button"
                  onClick={() => selectLens(lens.id)}
                  title={isSelected ? `Clear ${lens.title} filter` : lens.subtitle}
                  className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${style.badge}`}
                  >
                    <LensIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className={isSelected ? "font-semibold text-[var(--amber)]" : ""}>
                    {lens.title}
                  </span>
                  {isSelected ? (
                    <X className="h-3.5 w-3.5 text-[var(--amber)] opacity-80" aria-hidden="true" />
                  ) : (
                    <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                      {matchCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Consolidated Filters Drawer (Presets, Sector, Fundamentals, Grouping) */}
          {screenerOpen && (
            <ExploreScreenerDrawer
              sectors={sectors}
              selectedSector={selectedSector}
              minFcfMargin={minFcfMargin}
              maxSbcPct={maxSbcPct}
              maxImplied={maxImplied}
              maxDilution={maxDilution}
              minMarketCapB={minMarketCapB}
              minShareholderYield={minShareholderYield}
              maxPtbv={maxPtbv}
              minRotce={minRotce}
              maxPffo={maxPffo}
              minThesisIrr={minThesisIrr}
              groupBySector={groupBySector}
              hasCustomScreen={hasCustomScreen}
              savedScreens={savedScreens}
              onSaveScreen={async (name) => {
                const filters = {
                  ...(selectedSector !== "All" ? { sector: selectedSector } : {}),
                  ...(minFcfMargin.trim() ? { fcf: minFcfMargin.trim() } : {}),
                  ...(maxSbcPct.trim() ? { sbc: maxSbcPct.trim() } : {}),
                  ...(maxImplied.trim() ? { imp: maxImplied.trim() } : {}),
                  ...(maxDilution.trim() ? { dil: maxDilution.trim() } : {}),
                  ...(minMarketCapB.trim() ? { cap: minMarketCapB.trim() } : {}),
                  ...(minShareholderYield.trim() ? { minShareholderYield: minShareholderYield.trim() } : {}),
                  ...(maxPtbv.trim() ? { maxPtbv: maxPtbv.trim() } : {}),
                  ...(minRotce.trim() ? { minRotce: minRotce.trim() } : {}),
                  ...(maxPffo.trim() ? { maxPffo: maxPffo.trim() } : {}),
                  ...(minThesisIrr.trim() ? { minThesisIrr: minThesisIrr.trim() } : {}),
                };
                if (Object.keys(filters).length === 0) return false;
                if (sessionUserId) {
                  try {
                    const res = await fetch("/api/saved-screens", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name, filters }),
                    });
                    if (!res.ok) return false;
                    const data = (await res.json()) as { screen?: SavedScreen };
                    if (data.screen) {
                      const next = [data.screen, ...savedScreens].slice(0, 15);
                      setSavedScreens(next);
                      writeLocalSavedScreens(next, sessionUserId);
                      return true;
                    }
                    return false;
                  } catch {
                    return false;
                  }
                }
                const localScreen: SavedScreen = {
                  id: `local_${Date.now()}`,
                  name,
                  filters,
                  updatedAt: new Date().toISOString(),
                };
                const next = [localScreen, ...savedScreens].slice(0, 15);
                setSavedScreens(next);
                writeLocalSavedScreens(next, sessionUserId);
                return true;
              }}
              onDeleteScreen={(id) => {
                const next = savedScreens.filter((s) => s.id !== id);
                setSavedScreens(next);
                writeLocalSavedScreens(next, sessionUserId);
                if (sessionUserId && !id.startsWith("local_")) {
                  fetch(`/api/saved-screens?id=${encodeURIComponent(id)}`, {
                    method: "DELETE",
                  }).catch(() => {});
                }
              }}
              onApplySavedScreen={(screen) => {
                setSelectedSector(screen.filters.sector ?? "All");
                setMinFcfMargin(screen.filters.fcf ?? "");
                setMaxSbcPct(screen.filters.sbc ?? "");
                setMaxImplied(screen.filters.imp ?? "");
                setMaxDilution(screen.filters.dil ?? "");
                setMinMarketCapB(screen.filters.cap ?? "");
                setMinShareholderYield(screen.filters.minShareholderYield ?? "");
                setMaxPtbv(screen.filters.maxPtbv ?? "");
                setMinRotce(screen.filters.minRotce ?? "");
                setMaxPffo(screen.filters.maxPffo ?? "");
                setMinThesisIrr(screen.filters.minThesisIrr ?? "");
                setVisibleLimit(30);
              }}
              onChangeSector={(value) => {
                setSelectedSector(value);
                setVisibleLimit(30);
              }}
              onChangeMinFcf={(value) => {
                setMinFcfMargin(value);
                setVisibleLimit(30);
              }}
              onChangeMaxSbc={(value) => {
                setMaxSbcPct(value);
                setVisibleLimit(30);
              }}
              onChangeMaxImplied={(value) => {
                setMaxImplied(value);
                setVisibleLimit(30);
              }}
              onChangeMaxDilution={(value) => {
                setMaxDilution(value);
                setVisibleLimit(30);
              }}
              onChangeMinCapB={(value) => {
                setMinMarketCapB(value);
                setVisibleLimit(30);
              }}
              onChangeMinShareholderYield={(value) => {
                setMinShareholderYield(value);
                setVisibleLimit(30);
              }}
              onChangeMaxPtbv={(value) => {
                setMaxPtbv(value);
                setVisibleLimit(30);
              }}
              onChangeMinRotce={(value) => {
                setMinRotce(value);
                setVisibleLimit(30);
              }}
              onChangeMaxPffo={(value) => {
                setMaxPffo(value);
                setVisibleLimit(30);
              }}
              onChangeMinThesisIrr={(value) => {
                setMinThesisIrr(value);
                setVisibleLimit(30);
              }}
              onToggleGroupBySector={() => setGroupBySector((prev) => !prev)}
              onApplyPreset={(preset) => {
                setSelectedSector(preset.values.sector ?? "All");
                setMinFcfMargin(preset.values.fcf ?? "");
                setMaxSbcPct(preset.values.sbc ?? "");
                setMaxImplied(preset.values.imp ?? "");
                setMaxDilution(preset.values.dil ?? "");
                setMinMarketCapB(preset.values.cap ?? "");
                setMinShareholderYield(preset.values.minShareholderYield ?? "");
                setMaxPtbv(preset.values.maxPtbv ?? "");
                setMinRotce(preset.values.minRotce ?? "");
                setMaxPffo(preset.values.maxPffo ?? "");
                setMinThesisIrr(preset.values.minThesisIrr ?? "");
                setVisibleLimit(30);
              }}
              onResetAll={() => {
                setSelectedSector("All");
                setGroupBySector(false);
                setMinFcfMargin("");
                setMaxSbcPct("");
                setMaxImplied("");
                setMaxDilution("");
                setMinMarketCapB("");
                setMinShareholderYield("");
                setMaxPtbv("");
                setMinRotce("");
                setMaxPffo("");
                setMinThesisIrr("");
              }}
            />
          )}

          <div
            tabIndex={0}
            role="region"
            aria-labelledby="coverage-caption"
            className="amber-table-wrapper"
          >
            <table className="amber-table">
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  {sortColumns.map((col) => {
                    const isSorted = Boolean(col.key) && sortKey === col.key;
                    return (
                      <th
                        key={col.label}
                        scope="col"
                        className={col.alignLeft ? "!text-left" : undefined}
                        aria-sort={
                          col.key
                            ? isSorted
                              ? sortDir === "desc"
                                ? "descending"
                                : "ascending"
                              : "none"
                            : undefined
                        }
                      >
                        {col.key ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key!)}
                            title={col.tip}
                            className={`inline-flex items-center gap-1 transition-colors cursor-pointer ${
                              isSorted
                                ? "font-semibold text-[var(--amber)]"
                                : "hover:text-[var(--text-primary)]"
                            }`}
                          >
                            {col.label}
                            {isSorted ? (
                              sortDir === "desc" ? (
                                <ArrowDown className="h-3 w-3 text-[var(--amber)]" />
                              ) : (
                                <ArrowUp className="h-3 w-3 text-[var(--amber)]" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-45" />
                            )}
                          </button>
                        ) : (
                          <span>{col.label}</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="!py-12 !text-center text-sm text-[var(--text-secondary)]"
                    >
                      <p>
                        {watchlistOnly && watchlist.tickers.length === 0
                          ? "Your watchlist is empty. Star any company to track it here."
                          : "No companies match the active filters."}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setFilter("");
                          setWatchlistOnly(false);
                          setActiveLensId(null);
                          setSelectedSector("All");
                          setGroupBySector(false);
                          setMinFcfMargin("");
                          setMaxSbcPct("");
                          setMaxImplied("");
                          setMaxDilution("");
                        }}
                        className="mt-3 inline-flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--amber)] hover:border-[var(--amber-border)] cursor-pointer"
                      >
                        Reset filters
                      </button>
                    </td>
                  </tr>
                ) : groupBySector
                  ? groupedBySector.map(([sector, sectorRows]) => (
                      <Fragment key={sector}>
                        <tr>
                          <td
                            colSpan={colCount}
                            className="!bg-[var(--surface-subtle)] !py-2 !text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]"
                          >
                            {sector}{" "}
                            <span className="font-mono-num ml-1 opacity-75">
                              ({sectorRows.length})
                            </span>
                          </td>
                        </tr>
                        {sectorRows.map((c) => renderRow(c))}
                      </Fragment>
                    ))
                  : visibleRows.map((c) => renderRow(c))}
              </tbody>
            </table>
          </div>

          {!groupBySector && rows.length > visibleLimit && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 40)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
              >
                Show more ({rows.length - visibleLimit} remaining)
              </button>
            </div>
          )}
        </section>

        {/* Market Extremes & Leaderboards */}
        <section aria-label="High-signal leaderboards" className="mt-12">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Market Extremes &amp; Leaderboards
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Top 5 standouts across stock compensation, real cash margins, and priced-in growth.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Card 1: Steepest SBC Burden */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  Steepest SBC Burden
                </h3>
                <span className="font-mono-num text-[11px] text-[var(--sbc)]">
                  SBC / Rev
                </span>
              </div>
              <ul className="mt-3.5 divide-y divide-[var(--border)]">
                {steepestSbc.map((c) => (
                  <li key={c.ticker}>
                    <Link
                      href={`/t/${c.ticker}`}
                      className="flex items-center justify-between py-2.5 text-xs transition-colors hover:text-[var(--amber)]"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-mono-num w-12 shrink-0 font-semibold text-[var(--amber)]">
                          {c.ticker}
                        </span>
                        <span className="truncate text-[var(--text-secondary)]">
                          {c.name}
                        </span>
                      </span>
                      <span className="font-mono-num shrink-0 font-semibold text-[var(--sbc)]">
                        {formatPct(c.sbcPctRevenue)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 2: Cleanest True FCF Margins */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  Cleanest True FCF Margins
                </h3>
                <span className="font-mono-num text-[11px] text-[var(--amber)]">
                  True FCF %
                </span>
              </div>
              <ul className="mt-3.5 divide-y divide-[var(--border)]">
                {cleanestCash.map((c) => (
                  <li key={c.ticker}>
                    <Link
                      href={`/t/${c.ticker}`}
                      className="flex items-center justify-between py-2.5 text-xs transition-colors hover:text-[var(--amber)]"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-mono-num w-12 shrink-0 font-semibold text-[var(--amber)]">
                          {c.ticker}
                        </span>
                        <span className="truncate text-[var(--text-secondary)]">
                          {c.name}
                        </span>
                      </span>
                      <span className="font-mono-num shrink-0 font-semibold text-[var(--positive)]">
                        {formatPct(c.trueFcfMargin)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 3: Steepest Implied Growth */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  Highest Implied 10Y Growth
                </h3>
                <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                  Reverse DCF
                </span>
              </div>
              <ul className="mt-3.5 divide-y divide-[var(--border)]">
                {steepestImplied.map((c) => (
                  <li key={c.ticker}>
                    <Link
                      href={`/t/${c.ticker}`}
                      className="flex items-center justify-between py-2.5 text-xs transition-colors hover:text-[var(--amber)]"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-mono-num w-12 shrink-0 font-semibold text-[var(--amber)]">
                          {c.ticker}
                        </span>
                        <span className="truncate text-[var(--text-secondary)]">
                          {c.name}
                        </span>
                      </span>
                      <span className="font-mono-num shrink-0 font-semibold text-[var(--text-primary)]">
                        {formatPct(c.impliedCagr)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <footer className="mt-14 flex flex-col items-start justify-between gap-2 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-4">
            <span>© {new Date().getFullYear()} Amber</span>
            <Link href="/privacy" className="hover:text-[var(--text-primary)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--text-primary)]">
              Terms
            </Link>
            <span>Not investment advice.</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <MethodologyModal />
          </div>
        </footer>
      </main>
    </div>
  );
}
