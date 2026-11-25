import type { SavedScreenFiltersJson } from "../db/schema.ts";

export interface SavedScreen {
  id: string;
  name: string;
  filters: SavedScreenFiltersJson;
  updatedAt: string;
}

const FILTER_KEYS: Array<keyof SavedScreenFiltersJson> = [
  "sector",
  "fcf",
  "sbc",
  "imp",
  "dil",
  "cap",
  "minShareholderYield",
  "maxPtbv",
  "minRotce",
  "maxPffo",
  "minThesisIrr",
];

export function normalizeSavedScreenFilters(raw: unknown): SavedScreenFiltersJson {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: SavedScreenFiltersJson = {};
  for (const key of FILTER_KEYS) {
    const val = obj[key];
    if (typeof val !== "string") continue;
    const trimmed = val.trim().slice(0, 40);
    if (!trimmed) continue;
    if (key !== "sector" && !Number.isFinite(Number(trimmed))) continue;
    out[key] = trimmed;
  }
  return out;
}

export function normalizeSavedScreenName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/\s+/g, " ").slice(0, 48);
  return cleaned.length >= 2 ? cleaned : null;
}

function localStorageKey(userId?: string | null) {
  return `amber:saved-screens:${userId ?? "guest"}`;
}

export function readLocalSavedScreens(userId?: string | null): SavedScreen[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedScreen =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.filters === "object"
    );
  } catch {
    return [];
  }
}

export function writeLocalSavedScreens(screens: SavedScreen[], userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localStorageKey(userId), JSON.stringify(screens.slice(0, 15)));
  } catch {
    // Ignore storage quota failures
  }
}
