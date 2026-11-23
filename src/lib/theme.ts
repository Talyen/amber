"use client";

import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "amber-theme";
const CHANGE_EVENT = "amber-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return value === "light" || value === "dark" ? value : "system";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    if (theme === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Keep the current page's theme usable when storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeToTheme(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    if (event.storageArea !== window.localStorage) return;
    const value = event.newValue;
    applyTheme(value === "light" || value === "dark" ? value : "system");
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeToSystemTheme(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useTheme() {
  return useSyncExternalStore(subscribeToTheme, readTheme, () => null);
}

export function useSystemDark() {
  return useSyncExternalStore(subscribeToSystemTheme, () => window.matchMedia(DARK_QUERY).matches, () => false);
}
