export type SavedScenarioLens = "fcf" | "ebit" | "pe";

export interface SavedValuationPreset {
  ticker: string;
  lens: SavedScenarioLens;
  revGrowth: number;
  targetMargin: number;
  exitMultiple: number;
  updatedAt: string;
}

type LocalValuationPreset = SavedValuationPreset & { owner?: string };

const STORAGE_KEY = "amber-valuation-presets-v1";

function readNumber(value: unknown): number {
  if (typeof value === "number") return value;
  return typeof value === "string" && value.trim() ? Number(value) : NaN;
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
  return {
    ticker,
    lens,
    revGrowth: Number(revGrowth.toFixed(1)),
    targetMargin: Number(targetMargin.toFixed(1)),
    exitMultiple: Number(exitMultiple.toFixed(1)),
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
