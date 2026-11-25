"use client";

import { useState } from "react";
import { Bookmark, Check, Layers, Link2, Sparkles, Trash2, X } from "lucide-react";
import type { SavedScreen } from "@/lib/saved-screens";

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
    minShareholderYield?: string;
    maxPtbv?: string;
    minRotce?: string;
    maxPffo?: string;
    minThesisIrr?: string;
  };
}

export const SCREENER_PRESETS: ScreenerPreset[] = [
  {
    id: "garp-compounders",
    label: "GARP Compounders",
    description: "True FCF >= 20%, Stock Comp <= 4%, Priced-In Growth <= 10%",
    values: { fcf: "20", sbc: "4", imp: "10", dil: "", cap: "", sector: "All" },
  },
  {
    id: "clean-cannibals",
    label: "Clean Cannibals",
    description: "True FCF >= 15%, shrinking share count (<= -1.5%/yr)",
    values: { fcf: "15", sbc: "3", imp: "", dil: "-1.5", cap: "", sector: "All" },
  },
  {
    id: "total-yield-leaders",
    label: "Shareholder Yield",
    description: "Buybacks + Dividends − SBC >= 4% of Market Cap",
    values: { fcf: "10", sbc: "3", minShareholderYield: "4", sector: "All" },
  },
  {
    id: "quality-banks",
    label: "Quality Banks",
    description: "Financials with ROTCE >= 14% and P/TBV <= 2.5x",
    values: { sector: "Financials", minRotce: "14", maxPtbv: "2.5" },
  },
  {
    id: "value-reits",
    label: "Value REITs",
    description: "Real Estate & REITs with P/FFO <= 16x",
    values: { sector: "Real Estate & REITs", maxPffo: "16" },
  },
  {
    id: "disciplined-saas",
    label: "Disciplined Software",
    description: "Cloud & Software, True FCF >= 15%, Stock Comp <= 10%",
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
  minShareholderYield: string;
  maxPtbv: string;
  minRotce: string;
  maxPffo: string;
  minThesisIrr: string;
  groupBySector: boolean;
  hasCustomScreen: boolean;
  savedScreens: SavedScreen[];
  onSaveScreen: (name: string) => Promise<boolean>;
  onDeleteScreen: (id: string) => void;
  onApplySavedScreen: (screen: SavedScreen) => void;
  onChangeSector: (value: string) => void;
  onChangeMinFcf: (value: string) => void;
  onChangeMaxSbc: (value: string) => void;
  onChangeMaxImplied: (value: string) => void;
  onChangeMaxDilution: (value: string) => void;
  onChangeMinCapB: (value: string) => void;
  onChangeMinShareholderYield: (value: string) => void;
  onChangeMaxPtbv: (value: string) => void;
  onChangeMinRotce: (value: string) => void;
  onChangeMaxPffo: (value: string) => void;
  onChangeMinThesisIrr: (value: string) => void;
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
  minShareholderYield,
  maxPtbv,
  minRotce,
  maxPffo,
  minThesisIrr,
  groupBySector,
  hasCustomScreen,
  savedScreens,
  onSaveScreen,
  onDeleteScreen,
  onApplySavedScreen,
  onChangeSector,
  onChangeMinFcf,
  onChangeMaxSbc,
  onChangeMaxImplied,
  onChangeMaxDilution,
  onChangeMinCapB,
  onChangeMinShareholderYield,
  onChangeMaxPtbv,
  onChangeMinRotce,
  onChangeMaxPffo,
  onChangeMinThesisIrr,
  onToggleGroupBySector,
  onApplyPreset,
  onResetAll,
}: ExploreScreenerDrawerProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [screenName, setScreenName] = useState("");
  const [saving, setSaving] = useState(false);

  const activeChips: Array<{ label: string; onClear: () => void }> = [];
  if (selectedSector !== "All") {
    activeChips.push({ label: `Sector: ${selectedSector}`, onClear: () => onChangeSector("All") });
  }
  if (minFcfMargin.trim()) {
    activeChips.push({ label: `True FCF >= ${minFcfMargin}%`, onClear: () => onChangeMinFcf("") });
  }
  if (maxSbcPct.trim()) {
    activeChips.push({ label: `Stock Comp <= ${maxSbcPct}%`, onClear: () => onChangeMaxSbc("") });
  }
  if (maxImplied.trim()) {
    activeChips.push({ label: `Priced-In Growth <= ${maxImplied}%`, onClear: () => onChangeMaxImplied("") });
  }
  if (maxDilution.trim()) {
    activeChips.push({ label: `Share Chg <= ${maxDilution}%`, onClear: () => onChangeMaxDilution("") });
  }
  if (minMarketCapB.trim()) {
    activeChips.push({ label: `Mkt Cap >= $${minMarketCapB}B`, onClear: () => onChangeMinCapB("") });
  }
  if (minShareholderYield.trim()) {
    activeChips.push({
      label: `Sh. Yield >= ${minShareholderYield}%`,
      onClear: () => onChangeMinShareholderYield(""),
    });
  }
  if (maxPtbv.trim()) {
    activeChips.push({ label: `P/TBV <= ${maxPtbv}x`, onClear: () => onChangeMaxPtbv("") });
  }
  if (minRotce.trim()) {
    activeChips.push({ label: `ROTCE >= ${minRotce}%`, onClear: () => onChangeMinRotce("") });
  }
  if (maxPffo.trim()) {
    activeChips.push({ label: `P/FFO <= ${maxPffo}x`, onClear: () => onChangeMaxPffo("") });
  }
  if (minThesisIrr.trim()) {
    activeChips.push({
      label: `Saved Thesis IRR >= ${minThesisIrr}%`,
      onClear: () => onChangeMinThesisIrr(""),
    });
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

  async function handleSubmitSave(e: React.FormEvent) {
    e.preventDefault();
    if (!screenName.trim() || saving) return;
    setSaving(true);
    const ok = await onSaveScreen(screenName.trim());
    setSaving(false);
    if (ok) {
      setScreenName("");
      setSaveOpen(false);
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

      {savedScreens.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] mr-1">
            <Bookmark className="h-3 w-3 text-[var(--amber)]" aria-hidden="true" />
            Saved:
          </span>
          {savedScreens.map((screen) => (
            <span
              key={screen.id}
              className="inline-flex items-center overflow-hidden rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] text-[11px]"
            >
              <button
                type="button"
                onClick={() => onApplySavedScreen(screen)}
                className="px-2 py-1 font-medium text-[var(--amber)] hover:opacity-85 cursor-pointer"
              >
                {screen.name}
              </button>
              <button
                type="button"
                aria-label={`Delete saved screen ${screen.name}`}
                onClick={() => onDeleteScreen(screen.id)}
                className="border-l border-[var(--amber-border)] px-1.5 py-1 text-[var(--amber)]/70 hover:text-[var(--negative)] cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

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
            Max Stock Comp %
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
            Max Priced-In Growth %
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
            Max Share Chg %
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

      {/* Sector-Native, Yield & Saved Thesis Filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Min Sh. Yield %
          </span>
          <input
            type="number"
            step="0.5"
            value={minShareholderYield}
            onChange={(e) => onChangeMinShareholderYield(e.target.value)}
            placeholder="e.g. 3"
            className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Max P/TBV (Banks)
          </span>
          <input
            type="number"
            step="0.2"
            min="0"
            value={maxPtbv}
            onChange={(e) => onChangeMaxPtbv(e.target.value)}
            placeholder="e.g. 2.5"
            className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Min ROTCE % (Banks)
          </span>
          <input
            type="number"
            step="1"
            value={minRotce}
            onChange={(e) => onChangeMinRotce(e.target.value)}
            placeholder="e.g. 14"
            className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Max P/FFO (REITs)
          </span>
          <input
            type="number"
            step="1"
            min="0"
            value={maxPffo}
            onChange={(e) => onChangeMaxPffo(e.target.value)}
            placeholder="e.g. 16"
            className="font-mono-num h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Min Thesis IRR %
          </span>
          <input
            type="number"
            step="1"
            value={minThesisIrr}
            onChange={(e) => onChangeMinThesisIrr(e.target.value)}
            placeholder="e.g. 15"
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

        <div className="flex flex-wrap items-center gap-3">
          {hasCustomScreen && (
            <>
              {saveOpen ? (
                <form onSubmit={handleSubmitSave} className="inline-flex items-center gap-1.5">
                  <input
                    type="text"
                    value={screenName}
                    onChange={(e) => setScreenName(e.target.value)}
                    placeholder="Screen name..."
                    maxLength={48}
                    autoFocus
                    className="h-7 w-36 rounded-md border border-[var(--amber-border)] bg-[var(--bg)] px-2 text-xs text-[var(--text-primary)] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={saving || screenName.trim().length < 2}
                    className="h-7 rounded-md bg-[var(--amber)] px-2.5 text-[11px] font-semibold text-white disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveOpen(false)}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setSaveOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--amber)] cursor-pointer"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  Save screen
                </button>
              )}

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
