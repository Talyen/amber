"use client";

import { useState } from "react";
import { Check, Layers, Link2, Sparkles, X } from "lucide-react";

export interface ScreenerPreset {
  id: string;
  label: string;
  description: string;
  values: {
    sector?: string;
    fcf?: string;
    sbc?: string;
    imp?: string;
    dil?: string;
    cap?: string;
  };
}

export const SCREENER_PRESETS: ScreenerPreset[] = [
  {
    id: "garp-compounders",
    label: "GARP Compounders",
    description: "True FCF >= 20%, SBC <= 4%, Implied 10Y <= 10%",
    values: { fcf: "20", sbc: "4", imp: "10", dil: "", cap: "", sector: "All" },
  },
  {
    id: "clean-cannibals",
    label: "Clean Cannibals",
    description: "True FCF >= 15%, shrinking share count (<= -1.5%/yr)",
    values: { fcf: "15", sbc: "3", imp: "", dil: "-1.5", cap: "", sector: "All" },
  },
  {
    id: "large-cap-value",
    label: "Large-Cap Value",
    description: "Mkt Cap >= $50B, True FCF >= 15%, Implied 10Y <= 8%",
    values: { fcf: "15", sbc: "", imp: "8", dil: "", cap: "50", sector: "All" },
  },
  {
    id: "disciplined-saas",
    label: "Disciplined Software",
    description: "Cloud & Software, True FCF >= 15%, SBC <= 10%",
    values: { fcf: "15", sbc: "10", imp: "", dil: "", cap: "", sector: "Cloud & Software" },
  },
];

interface ExploreScreenerDrawerProps {
  sectors: string[];
  selectedSector: string;
  minFcfMargin: string;
  maxSbcPct: string;
  maxImplied: string;
  maxDilution: string;
  minMarketCapB: string;
  groupBySector: boolean;
  hasCustomScreen: boolean;
  onChangeSector: (value: string) => void;
  onChangeMinFcf: (value: string) => void;
  onChangeMaxSbc: (value: string) => void;
  onChangeMaxImplied: (value: string) => void;
  onChangeMaxDilution: (value: string) => void;
  onChangeMinCapB: (value: string) => void;
  onToggleGroupBySector: () => void;
  onApplyPreset: (preset: ScreenerPreset) => void;
  onResetAll: () => void;
}

export function ExploreScreenerDrawer({
  sectors,
  selectedSector,
  minFcfMargin,
  maxSbcPct,
  maxImplied,
  maxDilution,
  minMarketCapB,
  groupBySector,
  hasCustomScreen,
  onChangeSector,
  onChangeMinFcf,
  onChangeMaxSbc,
  onChangeMaxImplied,
  onChangeMaxDilution,
  onChangeMinCapB,
  onToggleGroupBySector,
  onApplyPreset,
  onResetAll,
}: ExploreScreenerDrawerProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const activeChips: Array<{ label: string; onClear: () => void }> = [];
  if (selectedSector !== "All") {
    activeChips.push({ label: `Sector: ${selectedSector}`, onClear: () => onChangeSector("All") });
  }
  if (minFcfMargin.trim()) {
    activeChips.push({ label: `True FCF >= ${minFcfMargin}%`, onClear: () => onChangeMinFcf("") });
  }
  if (maxSbcPct.trim()) {
    activeChips.push({ label: `SBC/Rev <= ${maxSbcPct}%`, onClear: () => onChangeMaxSbc("") });
  }
  if (maxImplied.trim()) {
    activeChips.push({ label: `Implied 10Y <= ${maxImplied}%`, onClear: () => onChangeMaxImplied("") });
  }
  if (maxDilution.trim()) {
    activeChips.push({ label: `Dilution <= ${maxDilution}%`, onClear: () => onChangeMaxDilution("") });
  }
  if (minMarketCapB.trim()) {
    activeChips.push({ label: `Mkt Cap >= $${minMarketCapB}B`, onClear: () => onChangeMinCapB("") });
  }

  async function handleCopyScreenUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      // Clipboard may be unavailable
    }
  }

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] mr-1">
          <Sparkles className="h-3 w-3 text-[var(--amber)]" aria-hidden="true" />
          Presets:
        </span>
        {SCREENER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.description}
            onClick={() => onApplyPreset(preset)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="col-span-2 block sm:col-span-1">
          <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Sector
          </span>
          <select
            value={selectedSector}
            onChange={(e) => onChangeSector(e.target.value)}
            className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--amber-border)] focus:outline-none"
          >
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All Sectors" : s}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Min True FCF %
          </span>
          <input
            type="number"
            step="1"
            value={minFcfMargin}
            onChange={(e) => onChangeMinFcf(e.target.value)}
            placeholder="e.g. 20"
            className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Max SBC / Rev %
          </span>
          <input
            type="number"
            step="1"
            value={maxSbcPct}
            onChange={(e) => onChangeMaxSbc(e.target.value)}
            placeholder="e.g. 5"
            className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Max Implied 10Y %
          </span>
          <input
            type="number"
            step="1"
            value={maxImplied}
            onChange={(e) => onChangeMaxImplied(e.target.value)}
            placeholder="e.g. 10"
            className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Max Dilution %
          </span>
          <input
            type="number"
            step="0.5"
            value={maxDilution}
            onChange={(e) => onChangeMaxDilution(e.target.value)}
            placeholder="e.g. 0"
            className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Min Mkt Cap ($B)
          </span>
          <input
            type="number"
            step="5"
            min="0"
            value={minMarketCapB}
            onChange={(e) => onChangeMinCapB(e.target.value)}
            placeholder="e.g. 10"
            className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
          />
        </label>
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.onClear}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--amber-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)] hover:opacity-85 cursor-pointer"
            >
              <span>{chip.label}</span>
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <button
          type="button"
          onClick={onToggleGroupBySector}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors cursor-pointer ${
            groupBySector
              ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Group by Sector
        </button>

        <div className="flex items-center gap-3">
          {hasCustomScreen && (
            <>
              <button
                type="button"
                onClick={handleCopyScreenUrl}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {copiedUrl ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[var(--positive)]" />
                    Copied link
                  </>
                ) : (
                  <>
                    <Link2 className="h-3.5 w-3.5" />
                    Share screen
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onResetAll}
                className="text-xs font-medium text-[var(--amber)] hover:underline cursor-pointer"
              >
                Reset all filters
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
