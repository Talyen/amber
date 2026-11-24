export type SavedScenarioLens = "fcf" | "ebit" | "pe";

export interface SavedValuationPreset {
  ticker: string;
  lens: SavedScenarioLens;
  revGrowth: number;
  targetMargin: number;
  exitMultiple: number;
  updatedAt: string;
}

const STORAGE_KEY = "amber-valuation-presets-v1";

export function normalizeValuationPresetInput(raw: unknown): Omit<SavedValuationPreset, "updatedAt"> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const ticker = typeof obj.ticker === "string" ? obj.ticker.trim().toUpperCase() : "";
  if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) return null;
  const lens = obj.lens === "fcf" || obj.lens === "ebit" || obj.lens === "pe" ? obj.lens : "fcf";
  const revGrowth = Number(obj.revGrowth);
  const targetMargin = Number(obj.targetMargin);
  const exitMultiple = Number(obj.exitMultiple);
  if (
    !Number.isFinite(revGrowth) || revGrowth < -10 || revGrowth > 45 ||
    !Number.isFinite(targetMargin) || targetMargin < 1 || targetMargin > 75 ||
    !Number.isFinite(exitMultiple) || exitMultiple < 5 || exitMultiple > 50
  ) {
    return null;
  }
  return {
    ticker,
    lens,
    revGrowth: Number(revGrowth.toFixed(1)),
    targetMargin: Number(targetMargin.toFixed(1)),
    exitMultiple: Number(exitMultiple.toFixed(1)),
  };
}

export function readLocalValuationPreset(ticker: string): SavedValuationPreset | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, SavedValuationPreset>;
    return map[ticker.toUpperCase()] ?? null;
  } catch {
    return null;
  }
}

export function writeLocalValuationPreset(preset: SavedValuationPreset): void {
  try {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, SavedValuationPreset>) : {};
    map[preset.ticker.toUpperCase()] = preset;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function removeLocalValuationPreset(ticker: string): void {
  try {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, SavedValuationPreset>;
    delete map[ticker.toUpperCase()];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}
