"use client";

import { useEffect, useState } from "react";
import { readAllLocalValuationPresets, type SavedValuationPreset } from "./valuation-presets";

const EMPTY_PRESETS: Readonly<Record<string, SavedValuationPreset>> = {};

export function useSavedValuationPresets(owner: string | null) {
  const [snapshot, setSnapshot] = useState<{
    owner: string | null;
    presets: Record<string, SavedValuationPreset>;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const local = readAllLocalValuationPresets(owner);
    queueMicrotask(() => {
      if (!signal.aborted) setSnapshot({ owner, presets: local });
    });

    if (owner) {
      fetch("/api/valuation-presets", { signal })
        .then((response) => response.ok ? response.json() as Promise<{ presets?: SavedValuationPreset[] }> : null)
        .then((data) => {
          if (signal.aborted || !Array.isArray(data?.presets)) return;
          const merged: Record<string, SavedValuationPreset> = { ...local };
          for (const preset of data.presets) {
            const existing = merged[preset.ticker];
            if (!existing || Date.parse(preset.updatedAt) >= Date.parse(existing.updatedAt)) {
              merged[preset.ticker] = preset;
            }
          }
          setSnapshot({ owner, presets: merged });
        })
        .catch(() => {
          // Retain locally saved theses while the account is unavailable.
        });
    }
    return () => controller.abort();
  }, [owner]);

  return snapshot?.owner === owner ? snapshot.presets : EMPTY_PRESETS;
}
