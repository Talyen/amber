import { computeScenarioProjection, type ScenarioBasis, type ScenarioLens } from "./finance.ts";

export type SavedScenarioLens = ScenarioLens;

export const MAX_THESIS_NOTE_LENGTH = 240;

export interface SavedValuationPreset {
  ticker: string;
  lens: SavedScenarioLens;
  revGrowth: number;
  targetMargin: number;
  exitMultiple: number;
  thesisNote?: string | null;
  isPublic?: boolean;
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
    isPublic: obj.isPublic === true,
  };
}

function ownerStorageKey(owner: string | null | undefined): string {
  return owner ? `${STORAGE_KEY}:account:${owner}` : `${STORAGE_KEY}:guest`;
}

export function readLocalValuationPreset(
  ticker: string,
  owner: string | null | undefined
): LocalValuationPreset | null {
  return readAllLocalValuationPresets(owner)[ticker.toUpperCase()] ?? null;
}

export function readAllLocalValuationPresets(
  owner?: string | null
): Record<string, LocalValuationPreset> {
  if (typeof window === "undefined") return {};
  const result: Record<string, LocalValuationPreset> = {};
  // Read existing browser saves as well as new account-isolated saves.
  for (const key of [STORAGE_KEY, ownerStorageKey(owner)]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const map = JSON.parse(raw) as Record<string, LocalValuationPreset>;
      for (const [ticker, preset] of Object.entries(map)) {
        if (!preset || typeof preset !== "object") continue;
        if ((preset.owner ?? null) !== (owner ?? null)) continue;
        result[ticker.toUpperCase()] = preset;
      }
    } catch {
      // An unavailable or malformed storage entry cannot restore a thesis.
    }
  }
  return result;
}

export function writeLocalValuationPreset(preset: LocalValuationPreset): boolean {
  try {
    if (typeof window === "undefined") return false;
    const key = ownerStorageKey(preset.owner);
    const raw = window.localStorage.getItem(key);
    const map = raw ? (JSON.parse(raw) as Record<string, LocalValuationPreset>) : {};
    map[preset.ticker.toUpperCase()] = preset;
    window.localStorage.setItem(key, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export interface PresetValuationEntry {
  ticker: string;
  scenarioBasis: ScenarioBasis;
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
  const scenario = computeScenarioProjection(entry.scenarioBasis, preset);
  if (!scenario || scenario.irrPct === null) return null;

  return {
    ticker: preset.ticker,
    lens: preset.lens,
    irrPct: scenario.irrPct,
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

export interface CommunityThesisItem {
  handle: string;
  avatarIcon: string;
  lens: SavedScenarioLens;
  revGrowth: number;
  targetMargin: number;
  exitMultiple: number;
  thesisNote: string | null;
  updatedAt: string;
}

export interface ValuationTriggerCandidate extends SavedValuationPreset {
  id: string;
  lastValuationAlertAt?: Date | string | null;
}

export interface ValuationTriggerHit {
  presetId: string;
  ticker: string;
  lens: SavedScenarioLens;
  irrPct: number;
  fairValueToday: number;
  price: number;
  upsidePct: number;
  thesisNote: string | null;
}

export const VALUATION_ALERT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function evaluateValuationTriggers(
  presets: readonly ValuationTriggerCandidate[],
  entriesByTicker: ReadonlyMap<string, PresetValuationEntry>,
  irrThresholdPct: number,
  nowMs: number = Date.now()
): ValuationTriggerHit[] {
  const hits: ValuationTriggerHit[] = [];
  for (const preset of presets) {
    if (preset.lastValuationAlertAt) {
      const lastMs =
        preset.lastValuationAlertAt instanceof Date
          ? preset.lastValuationAlertAt.getTime()
          : Date.parse(preset.lastValuationAlertAt);
      if (Number.isFinite(lastMs) && nowMs - lastMs < VALUATION_ALERT_COOLDOWN_MS) {
        continue;
      }
    }
    const entry = entriesByTicker.get(preset.ticker);
    if (!entry) continue;
    const computed = computePresetExpectedReturn(preset, entry);
    if (!computed) continue;
    if (computed.irrPct >= irrThresholdPct) {
      hits.push({
        presetId: preset.id,
        ticker: preset.ticker,
        lens: preset.lens,
        irrPct: computed.irrPct,
        fairValueToday: computed.fairValueToday,
        price: entry.scenarioBasis.price,
        upsidePct: computed.upsidePct,
        thesisNote: preset.thesisNote ?? null,
      });
    }
  }
  return hits.sort((a, b) => b.irrPct - a.irrPct);
}
