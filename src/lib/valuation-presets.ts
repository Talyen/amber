import { computeFiveYearScenario } from "./finance.ts";

export type SavedScenarioLens = "fcf" | "ebit" | "pe";

export const MAX_THESIS_NOTE_LENGTH = 240;

export interface SavedValuationPreset {
  ticker: string;
  lens: SavedScenarioLens;
  revGrowth: number;
  targetMargin: number;
  exitMultiple: number;
  thesisNote?: string | null;
  updatedAt: string;
}

export type LocalValuationPreset = SavedValuationPreset & { owner?: string };

const STORAGE_KEY = "amber-valuation-presets-v1";

function readNumber(value: unknown): number {
  if (typeof value === "number") return value;
  return typeof value === "string" && value.trim() ? Number(value) : NaN;
}

export function normalizeThesisNote(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_THESIS_NOTE_LENGTH) return undefined;
  return trimmed;
}

export function normalizeValuationPresetInput(raw: unknown): Omit<SavedValuationPreset, "updatedAt"> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const ticker = typeof obj.ticker === "string" ? obj.ticker.trim().toUpperCase() : "";
  if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) return null;
  const lens = obj.lens === "fcf" || obj.lens === "ebit" || obj.lens === "pe" ? obj.lens : "fcf";
  const revGrowth = readNumber(obj.revGrowth);
  const targetMargin = readNumber(obj.targetMargin);
  const exitMultiple = readNumber(obj.exitMultiple);
  if (
    !Number.isFinite(revGrowth) || revGrowth < -10 || revGrowth > 45 ||
    !Number.isFinite(targetMargin) || targetMargin < 1 || targetMargin > 75 ||
    !Number.isFinite(exitMultiple) || exitMultiple < 5 || exitMultiple > 50
  ) {
    return null;
  }
  const thesisNote = normalizeThesisNote(obj.thesisNote);
  if (thesisNote === undefined) return null;

  return {
    ticker,
    lens,
    revGrowth: Number(revGrowth.toFixed(1)),
    targetMargin: Number(targetMargin.toFixed(1)),
    exitMultiple: Number(exitMultiple.toFixed(1)),
    thesisNote,
  };
}

export function readLocalValuationPreset(ticker: string): LocalValuationPreset | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, LocalValuationPreset>;
    return map[ticker.toUpperCase()] ?? null;
  } catch {
    return null;
  }
}

export function readAllLocalValuationPresets(
  owner?: string | null
): Record<string, LocalValuationPreset> {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const map = JSON.parse(raw) as Record<string, LocalValuationPreset>;
    const result: Record<string, LocalValuationPreset> = {};
    for (const [key, preset] of Object.entries(map)) {
      if (!preset || typeof preset !== "object") continue;
      if (owner && preset.owner && preset.owner !== owner) continue;
      if (!owner && preset.owner) continue;
      result[key.toUpperCase()] = preset;
    }
    return result;
  } catch {
    return {};
  }
}

export function writeLocalValuationPreset(preset: LocalValuationPreset): boolean {
  try {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, LocalValuationPreset>) : {};
    map[preset.ticker.toUpperCase()] = preset;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export function removeLocalValuationPreset(ticker: string): void {
  try {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, LocalValuationPreset>;
    delete map[ticker.toUpperCase()];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export interface PresetValuationEntry {
  ticker: string;
  price?: number;
  marketCap: number;
  netCash?: number;
  revenue: number;
  trueFcfMargin: number;
  operatingMargin?: number | null;
  netMargin?: number | null;
}

export interface PresetExpectedReturn {
  ticker: string;
  lens: SavedScenarioLens;
  irrPct: number;
  upsidePct: number;
  fairValueToday: number;
  yr5TargetPrice: number;
  thesisNote: string | null;
}

export function computePresetExpectedReturn(
  preset: SavedValuationPreset,
  entry: PresetValuationEntry
): PresetExpectedReturn | null {
  const price = entry.price ?? 0;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(entry.marketCap) || entry.marketCap <= 0) {
    return null;
  }
  if (!Number.isFinite(entry.revenue) || entry.revenue <= 0) return null;

  const dilutedShares = entry.marketCap / price;
  const currentMargin =
    preset.lens === "ebit" && typeof entry.operatingMargin === "number"
      ? entry.operatingMargin
      : preset.lens === "pe" && typeof entry.netMargin === "number"
        ? entry.netMargin
        : entry.trueFcfMargin;

  const scenario = computeFiveYearScenario({
    currentPrice: price,
    dilutedShares,
    baseRevenue: entry.revenue,
    currentTrueFcfMarginPct: currentMargin,
    netCash: preset.lens === "pe" ? 0 : (entry.netCash ?? 0),
    revGrowthPct: preset.revGrowth,
    targetTrueFcfMarginPct: preset.targetMargin,
    exitMultiple: preset.exitMultiple,
    hurdleRatePct: 10,
  });

  return {
    ticker: preset.ticker,
    lens: preset.lens,
    irrPct: Number(scenario.irrPct.toFixed(1)),
    upsidePct: Number(scenario.upsidePct.toFixed(1)),
    fairValueToday: Number(scenario.fairValueToday.toFixed(2)),
    yr5TargetPrice: Number(scenario.yr5TargetPrice.toFixed(2)),
    thesisNote: preset.thesisNote ?? null,
  };
}

export interface PortfolioThesisSummary {
  coveredCount: number;
  totalAllocatedCount: number;
  coveredWeightPct: number;
  weightedIrrPct: number | null;
  weightedUpsidePct: number | null;
  byTicker: Record<string, PresetExpectedReturn>;
}

export function computePortfolioThesisSummary(
  holdings: readonly PresetValuationEntry[],
  normalizedWeights: ReadonlyMap<string, number>,
  presetsByTicker: Readonly<Record<string, SavedValuationPreset>>
): PortfolioThesisSummary {
  let totalAllocatedCount = 0;
  let coveredCount = 0;
  let coveredWeight = 0;
  let weightedIrrSum = 0;
  let weightedUpsideSum = 0;
  const byTicker: Record<string, PresetExpectedReturn> = {};

  for (const h of holdings) {
    const w = normalizedWeights.get(h.ticker) ?? 0;
    const preset = presetsByTicker[h.ticker];
    const computed = preset ? computePresetExpectedReturn(preset, h) : null;
    if (computed) {
      byTicker[h.ticker] = computed;
    }
    if (w <= 0) continue;
    totalAllocatedCount++;
    if (computed) {
      coveredCount++;
      coveredWeight += w;
      weightedIrrSum += computed.irrPct * w;
      weightedUpsideSum += computed.upsidePct * w;
    }
  }

  return {
    coveredCount,
    totalAllocatedCount,
    coveredWeightPct: Number((coveredWeight * 100).toFixed(0)),
    weightedIrrPct:
      coveredWeight > 0 ? Number((weightedIrrSum / coveredWeight).toFixed(1)) : null,
    weightedUpsidePct:
      coveredWeight > 0 ? Number((weightedUpsideSum / coveredWeight).toFixed(1)) : null,
    byTicker,
  };
}
