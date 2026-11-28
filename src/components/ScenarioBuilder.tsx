"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Copy, Link2, Sparkles } from "lucide-react";
import {
  type CompanySnapshot,
  buildScenarioBasis,
  computeScenarioProjection,
  getScenarioDefaults,
  evaluateBaseCaseValuation,
  scenarioInputIssue,
  scenarioLensAvailable,
  scenarioPresetAssumptions,
  scenarioStartingMargin,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";
import { REVERSE_DCF_PARAMS } from "@/lib/valuation-link";
import {
  isMeaningfulThesisChange,
  mergeThesisHistory,
  readLocalThesisHistory,
  readLocalValuationPreset,
  thesisHistoryId,
  writeLocalThesisHistory,
  writeLocalValuationPreset,
  type CommunityThesisItem,
  type SavedScenarioLens as ValuationLens,
  type SavedValuationPreset,
  type ThesisHistoryEntry,
} from "@/lib/valuation-presets";
import { ThesisHistoryPanel } from "@/components/ThesisHistoryPanel";
import { authClient } from "@/lib/auth-client";

interface ScenarioBuilderProps {
  company: CompanySnapshot;
}

function progressPct(value: number, min: number, max: number): string {
  return `${(((value - min) / (max - min)) * 100).toFixed(1)}%`;
}

const GROWTH_RANGE = { min: -10, max: 45 };
const MARGIN_RANGE = { min: 1, max: 55 };
const MULTIPLE_RANGE = { min: 5, max: 45 };
const LENSES = {
  fcf: { label: "Cash Flow", margin: "Year-5 Cash Flow Margin", multiple: "EV / FCF", metric: "Year-5 Free Cash Flow" },
  ebit: { label: "Operating Earnings", margin: "Year-5 EBIT Margin", multiple: "EV / EBIT", metric: "Year-5 EBIT" },
  pe: { label: "Earnings (P/E)", margin: "Year-5 Net Margin", multiple: "P/E", metric: "Year-5 Net Income" },
  ffo: { label: "Funds From Operations", margin: "Year-5 FFO / Revenue", multiple: "P/FFO", metric: "Year-5 FFO" },
};
const SCENARIO_LENSES = Object.keys(LENSES) as ValuationLens[];

function readScenarioInput(
  params: URLSearchParams,
  key: string,
  { min, max }: { min: number; max: number }
): number | undefined {
  const raw = params.get(key)?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : undefined;
}

export function ScenarioBuilder(props: ScenarioBuilderProps) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const basis = useMemo(() => buildScenarioBasis(props.company), [props.company]);
  const defaults = useMemo(() => getScenarioDefaults(props.company, basis), [props.company, basis]);
  const base = useMemo(() => evaluateBaseCaseValuation(props.company, basis), [props.company, basis]);
  const availableLenses = useMemo(() => SCENARIO_LENSES.filter((lens) =>
    scenarioLensAvailable(basis, lens) && !scenarioInputIssue(basis, lens)), [basis]);
  const initialLens = availableLenses.includes(defaults.defaultLens) ? defaults.defaultLens : availableLenses[0];
  if (!initialLens) {
    return <p className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
      {base.issue ?? "A five-year scenario is unavailable for the reported fundamentals."}
    </p>;
  }
  return <ScenarioSession {...props} basis={basis} defaults={defaults} base={base} availableLenses={availableLenses}
    initialLens={initialLens} userId={userId} key={userId ? `account:${userId}` : "guest"} />;
}

function ScenarioSession({
  company,
  basis,
  defaults,
  base,
  availableLenses,
  initialLens,
  userId,
}: ScenarioBuilderProps & {
  basis: ReturnType<typeof buildScenarioBasis>;
  defaults: ReturnType<typeof getScenarioDefaults>;
  base: ReturnType<typeof evaluateBaseCaseValuation>;
  availableLenses: ValuationLens[];
  initialLens: ValuationLens;
  userId?: string;
}) {
  const [communityTheses, setCommunityTheses] = useState<CommunityThesisItem[]>([]);
  const [showCommunityTheses, setShowCommunityTheses] = useState(false);
  const [communityStatus, setCommunityStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [thesisHistory, setThesisHistory] = useState<ThesisHistoryEntry[]>([]);
  const { defaultLens, byLens, revGrowth: baseGrowth } = defaults;

  useEffect(() => {
    if (!showCommunityTheses) return;
    const controller = new AbortController();
    fetch(`/api/community-theses?ticker=${encodeURIComponent(company.ticker)}`, {
      cache: "no-store", signal: controller.signal,
    })
      .then((response): Promise<CommunityThesisItem[]> => {
        if (!response.ok) throw new Error("Community theses unavailable");
        return response.json();
      })
      .then((theses) => {
        if (controller.signal.aborted) return;
        setCommunityTheses(theses);
        setCommunityStatus("loaded");
      })
      .catch(() => {
        if (!controller.signal.aborted) setCommunityStatus("failed");
      });
    return () => controller.abort();
  }, [company.ticker, showCommunityTheses]);

  const [lens, setLens] = useState<ValuationLens>(initialLens);
  const lensDefaults = byLens[lens];
  const currentMargin = scenarioStartingMargin(basis, lens);
  const baseMargin = lensDefaults.margin;
  const baseMultiple = lensDefaults.multiple;

  const [revGrowth, setRevGrowth] = useState(baseGrowth);
  const [targetMargin, setTargetMargin] = useState(baseMargin);
  const [exitMultiple, setExitMultiple] = useState(baseMultiple);
  const [thesisNote, setThesisNote] = useState("");
  const [isPublicThesis, setIsPublicThesis] = useState(false);
  const [activePreset, setActivePreset] = useState<"bear" | "base" | "bull" | "custom">("base");
  const [fromSharedLink, setFromSharedLink] = useState(false);
  const [restoredThesis, setRestoredThesis] = useState(false);
  const [copiedThesis, setCopiedThesis] = useState(false);
  const [copiedCard, setCopiedCard] = useState<"idle" | "copied" | "downloaded">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "local" | "failed" | "superseded">("idle");
  const [supersededDraft, setSupersededDraft] = useState<SavedValuationPreset | null>(null);
  const editedThesis = useRef(false);
  const [unavailableSharedLens, setUnavailableSharedLens] = useState(false);
  const supportsLens = useCallback((candidate: string | null): candidate is ValuationLens =>
    availableLenses.some((lens) => lens === candidate), [availableLenses]);

  const applySavedThesis = useCallback((preset: SavedValuationPreset) => {
    setThesisNote(preset.thesisNote ?? "");
    setIsPublicThesis(preset.isPublic === true);
    if (!availableLenses.includes(preset.lens)) {
      setUnavailableSharedLens(true);
      return;
    }
    setUnavailableSharedLens(false);
    setLens(preset.lens);
    setRevGrowth(preset.revGrowth);
    setTargetMargin(preset.targetMargin);
    setExitMultiple(preset.exitMultiple);
    setActivePreset("custom");
  }, [availableLenses, setThesisNote, setIsPublicThesis, setUnavailableSharedLens, setLens, setRevGrowth,
    setTargetMargin, setExitMultiple, setActivePreset]);

  // Hydrate shared thesis query params (?tab=dcf&lens=fcf&rev=15&m=28&exit=22)
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setRestoredThesis(true);
      if (editedThesis.current) return;
      setThesisHistory(readLocalThesisHistory(company.ticker, userId));
      const params = new URLSearchParams(window.location.search);
      const lensParam = params.get("lens");
      const revParam = readScenarioInput(params, "rev", GROWTH_RANGE);
      const mParam = readScenarioInput(params, "m", MARGIN_RANGE);
      const exitParam = readScenarioInput(params, "exit", MULTIPLE_RANGE);
      let loaded = false;

      if (supportsLens(lensParam)) {
        setLens(lensParam);
        loaded = true;
      } else if (lensParam !== null) {
        setUnavailableSharedLens(true);
        setFromSharedLink(true);
        return;
      }
      if (revParam !== undefined) {
        setRevGrowth(revParam);
        loaded = true;
      }
      if (mParam !== undefined) {
        setTargetMargin(mParam);
        loaded = true;
      }
      if (exitParam !== undefined) {
        setExitMultiple(exitParam);
        loaded = true;
      }
      if (loaded) {
        setActivePreset("custom");
        setFromSharedLink(true);
        return;
      }

      const local = readLocalValuationPreset(company.ticker, userId);
      if (local) applySavedThesis(local);
    });
    return () => {
      active = false;
    };
  }, [company.ticker, supportsLens, applySavedThesis, userId]);

  useEffect(() => {
    if (!userId || !restoredThesis) return;
    const controller = new AbortController();
    fetch(`/api/valuation-presets?ticker=${encodeURIComponent(company.ticker)}&history=1`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { preset?: SavedValuationPreset | null; history?: ThesisHistoryEntry[] } | null) => {
        if (controller.signal.aborted) return;
        const history = data?.history;
        if (Array.isArray(history) && history.length > 0) {
          setThesisHistory((previous) => mergeThesisHistory(previous, history));
        }
        const preset = data?.preset;
        if (!preset || fromSharedLink || editedThesis.current) return;
        const local = readLocalValuationPreset(company.ticker, userId);
        if (local?.owner === userId && Date.parse(local.updatedAt) > Date.parse(preset.updatedAt)) return;
        writeLocalValuationPreset({ ...preset, owner: userId });
        applySavedThesis(preset);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [userId, company.ticker, fromSharedLink, restoredThesis, applySavedThesis]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = window.setTimeout(() => setSaveStatus("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  const draft = {
    ticker: company.ticker,
    lens,
    revGrowth: Number(revGrowth.toFixed(1)),
    targetMargin: Number(targetMargin.toFixed(1)),
    exitMultiple: Number(exitMultiple.toFixed(1)),
    thesisNote: thesisNote.replace(/\s+/g, " ").trim().slice(0, 240) || null,
    isPublic: Boolean(userId && isPublicThesis),
  };
  const canSave = saveStatus !== "saving" && (saveStatus !== "superseded" ||
    isMeaningfulThesisChange(supersededDraft, draft) || supersededDraft?.isPublic !== draft.isPublic);

  async function handleSaveThesis() {
    if (!canSave) return;
    editedThesis.current = true;
    const payload: SavedValuationPreset = { ...draft, updatedAt: new Date().toISOString() };
    const previous = readLocalValuationPreset(company.ticker, userId);
    const latest = thesisHistory[0];
    const changed = isMeaningfulThesisChange(latest, payload);
    const samePendingSave = previous && !isMeaningfulThesisChange(previous, payload) &&
      Boolean(previous.isPublic) === Boolean(payload.isPublic);
    const pendingSaveId = samePendingSave ? previous.pendingSaveId ?? (!changed ? latest.pendingSaveId : undefined) : undefined;
    const saveId = pendingSaveId ?? crypto.randomUUID();
    const storedLocally = writeLocalValuationPreset({
      ...payload,
      owner: userId,
      pendingSaveId: userId ? saveId : undefined,
    });
    const localSnapshot: ThesisHistoryEntry = {
      id: userId ? thesisHistoryId(userId, company.ticker, saveId) : saveId,
      ticker: company.ticker,
      lens: payload.lens,
      revGrowth: payload.revGrowth,
      targetMargin: payload.targetMargin,
      exitMultiple: payload.exitMultiple,
      thesisNote: payload.thesisNote ?? null,
      priceAtSave: Number.isFinite(company.price) ? company.price : null,
      filingDateAtSave: company.lastFiling.date,
      createdAt: payload.updatedAt,
      pendingSaveId: userId ? saveId : undefined,
    };
    if (changed) {
      const localHistory = readLocalThesisHistory(company.ticker, userId);
      writeLocalThesisHistory(company.ticker, userId, [localSnapshot, ...localHistory]);
      setThesisHistory((previous) => mergeThesisHistory([localSnapshot, ...previous], []));
    }
    if (!userId) {
      setSaveStatus(storedLocally ? "saved" : "failed");
      return;
    }

    setSaveStatus("saving");
    try {
      const response = await fetch("/api/valuation-presets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, saveId }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Could not sync thesis.");
      const { preset, historyEntry } = (await response.json()) as {
        preset?: SavedValuationPreset;
        historyEntry?: ThesisHistoryEntry;
      };
      if (historyEntry) {
        const localHistory = readLocalThesisHistory(company.ticker, userId)
          .filter((entry) => entry.id !== localSnapshot.id);
        writeLocalThesisHistory(company.ticker, userId, mergeThesisHistory(localHistory, [historyEntry]));
        setThesisHistory((previous) => mergeThesisHistory(
          previous.filter((entry) => entry.id !== localSnapshot.id),
          [historyEntry]
        ));
      }
      const pending = readLocalValuationPreset(company.ticker, userId);
      if (pending?.pendingSaveId === saveId) {
        writeLocalValuationPreset({ ...(preset ?? payload), owner: userId });
      }
      const superseded = preset && (isMeaningfulThesisChange(preset, payload) ||
        Boolean(preset.isPublic) !== Boolean(payload.isPublic));
      setSupersededDraft(superseded ? payload : null);
      setSaveStatus(superseded ? "superseded" : "saved");
    } catch {
      setSaveStatus(storedLocally ? "local" : "failed");
    }
  }

  async function handleCopyThesisLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "dcf");
    url.searchParams.set("model", "scenario");
    for (const key of REVERSE_DCF_PARAMS) url.searchParams.delete(key);
    url.searchParams.set("lens", lens);
    url.searchParams.set("rev", String(revGrowth));
    url.searchParams.set("m", String(targetMargin));
    url.searchParams.set("exit", String(exitMultiple));
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopiedThesis(true);
      window.setTimeout(() => setCopiedThesis(false), 1800);
    } catch {
      // Ignore clipboard errors
    }
  }

  function switchLens(nextLens: ValuationLens) {
    editedThesis.current = true;
    setLens(nextLens);
    setRevGrowth(baseGrowth);
    setTargetMargin(byLens[nextLens].margin);
    setExitMultiple(byLens[nextLens].multiple);
    setActivePreset(nextLens === defaultLens ? "base" : "custom");
  }

  function applyPreset(kind: "bear" | "base" | "bull") {
    editedThesis.current = true;
    const next = scenarioPresetAssumptions(lens, defaults, kind);
    setActivePreset(kind);
    setRevGrowth(next.revGrowth);
    setTargetMargin(next.targetMargin);
    setExitMultiple(next.exitMultiple);
  }

  const projection = useMemo(() => computeScenarioProjection(basis, {
    lens, revGrowth, targetMargin, exitMultiple,
  })!, [basis, lens, revGrowth, targetMargin, exitMultiple]);

  const modelStrip = useMemo(() => availableLenses.flatMap((id) => {
    const result = computeScenarioProjection(basis, scenarioPresetAssumptions(id, defaults, "base"));
    return result && result.fairValueToday > 0
      ? [{ id, label: LENSES[id].label, fairValue: result.fairValueToday }] : [];
  }), [basis, availableLenses, defaults]);

  const showBaseIssue = activePreset === "base" && base.issue !== null;
  const isDefault = activePreset === "base" && lens === defaultLens;
  const verdict = projection.equityValueBeforeFloor <= 0
    ? { label: "Common equity not covered", color: "text-[var(--negative)]" }
    : projection.upsidePct >= 0
      ? { label: `${Math.round(projection.upsidePct)}% Modeled Upside`, color: "text-[var(--positive)]" }
      : { label: `${Math.round(Math.abs(projection.upsidePct))}% Modeled Downside`, color: "text-[var(--negative)]" };

  const barMax = Math.max(company.price, projection.fairValueToday) * 1.15;
  const pricePosPct = Math.min(100, (company.price / barMax) * 100);
  const fairPosPct = Math.min(100, (projection.fairValueToday / barMax) * 100);

  return (
    <div className="space-y-4">
      {fromSharedLink && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-2 text-xs text-[var(--text-primary)]">
          <span>
            <strong className="font-semibold text-[var(--amber)]">
              Shared 5-Year Thesis:
            </strong>{" "}
            Loaded custom assumptions ({revGrowth}% rev growth · {targetMargin}% margin · {exitMultiple}× exit
            {projection.irrPct !== null ? ` → ${formatPct(projection.irrPct, true)}/yr` : ""}). Adjust any slider to challenge or test your own view.
          </span>
          <button
            type="button"
            onClick={() => {
              applyPreset("base");
              setFromSharedLink(false);
            }}
            className="font-medium text-[var(--amber)] hover:underline cursor-pointer"
          >
            Reset to Base
          </button>
        </div>
      )}
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Left: Simple 3-Slider Controls */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              Your 5-Year Thesis
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Choose a preset or adjust the assumptions to see the annual return they imply.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleSaveThesis}
              disabled={!canSave || showBaseIssue}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer disabled:cursor-wait disabled:opacity-60"
            >
              {saveStatus === "saved" ? (
                <>
                  <Check className="h-3 w-3 text-[var(--positive)]" />
                  Saved
                </>
              ) : saveStatus === "saving" ? "Saving…" : "Save Thesis"}
            </button>
            <button
              type="button"
              onClick={handleCopyThesisLink}
              disabled={showBaseIssue}
              title="Copy shareable link so others can stress-test your assumptions"
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 text-[11px] font-semibold text-[var(--amber)] transition-opacity hover:opacity-90 cursor-pointer"
            >
              {copiedThesis ? (
                <>
                  <Check className="h-3 w-3 text-[var(--positive)]" />
                  Copied Link
                </>
              ) : (
                <>
                  <Link2 className="h-3 w-3" />
                  Challenge Link
                </>
              )}
            </button>
            <button
              type="button"
              onClick={async () => {
                const { exportScenarioThesisCard } = await import("@/lib/export-card");
                const res = await exportScenarioThesisCard(
                  company,
                  {
                    lens,
                    revGrowthPct: revGrowth,
                    targetMarginPct: targetMargin,
                    exitMultiple,
                    thesisNote,
                  },
                  projection,
                  "copy"
                );
                setCopiedCard(res === "copied" ? "copied" : "downloaded");
                window.setTimeout(() => setCopiedCard("idle"), 1800);
              }}
              disabled={showBaseIssue}
              title="Copy 5-Year Valuation Thesis card PNG to clipboard"
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)] cursor-pointer"
            >
              {copiedCard !== "idle" ? (
                <>
                  <Check className="h-3 w-3 text-[var(--positive)]" />
                  {copiedCard === "copied" ? "Copied PNG" : "Saved PNG"}
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy Card
                </>
              )}
            </button>
          </div>
        </div>
        {(saveStatus === "local" || saveStatus === "failed") && (
          <p role="status" className="mt-2 text-xs text-[var(--text-secondary)]">
            {saveStatus === "local"
              ? "Saved on this device. Account sync could not be confirmed."
              : "Could not save your thesis. Please try again."}
          </p>
        )}
        {saveStatus === "superseded" && (
          <p role="status" className="mt-2 text-xs text-[var(--text-secondary)]">
            A newer thesis is saved to your account. Reload to view it, or edit this draft to save a new revision.
          </p>
        )}

        {unavailableSharedLens && (
          <p role="status" className="mt-3 text-xs text-[var(--text-secondary)]">
            This thesis uses an unavailable valuation model. The studio shows the current base case.
          </p>
        )}

        <div className="mt-4">
          <span className="text-[11px] text-[var(--text-muted)]">Valuation model</span>
          <div className="mt-1 flex flex-wrap rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5 text-xs">
            {availableLenses.map((model) => (
              <button
                key={model}
                type="button"
                aria-pressed={lens === model}
                onClick={() => switchLens(model)}
                className={`flex-1 rounded-md px-2 py-1.5 font-medium transition-colors cursor-pointer ${
                  lens === model
                    ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {LENSES[model].label}
              </button>
            ))}
          </div>
        </div>

        {/* Bear / Base / Bull Presets */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(["bear", "base", "bull"] as const).map((kind) => {
            const active = activePreset === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => applyPreset(kind)}
                className={`rounded-lg border py-1.5 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  active
                    ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {kind}
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-5">
          {/* Revenue Growth */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label
                htmlFor="sc-growth"
                className="font-medium text-[var(--text-primary)]"
              >
                Year-1 Growth
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {formatPct(revGrowth, true, Number.isInteger(revGrowth) ? 0 : 1)}
              </span>
            </div>
            <input
              id="sc-growth"
              type="range"
              {...GROWTH_RANGE}
              step={1}
              value={revGrowth}
              onChange={(e) => {
                editedThesis.current = true;
                setRevGrowth(parseInt(e.target.value, 10));
                setActivePreset("custom");
              }}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(revGrowth, GROWTH_RANGE.min, GROWTH_RANGE.max),
                } as React.CSSProperties
              }
            />
            <div className="font-mono-num mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>−10%</span>
              <span>Year-5 pace {formatPct(projection.terminalGrowthPct, true)}</span>
              <span>+45%</span>
            </div>
          </div>

          {/* Year-5 Margin */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label
                htmlFor="sc-margin"
                className="font-medium text-[var(--text-primary)]"
              >
                {LENSES[lens].margin}
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {formatPct(targetMargin, false, 1)}
              </span>
            </div>
            <input
              id="sc-margin"
              type="range"
              {...MARGIN_RANGE}
              step={0.5}
              value={targetMargin}
              onChange={(e) => {
                editedThesis.current = true;
                setTargetMargin(parseFloat(e.target.value));
                setActivePreset("custom");
              }}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(targetMargin, MARGIN_RANGE.min, MARGIN_RANGE.max),
                } as React.CSSProperties
              }
            />
            <div className="font-mono-num mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>1%</span>
              <span>Now: {formatPct(currentMargin, false, 1)}</span>
              <span>55%</span>
            </div>
          </div>

          {/* Exit Multiple */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label
                htmlFor="sc-mult"
                className="font-medium text-[var(--text-primary)]"
              >
                Exit Multiple ({LENSES[lens].multiple})
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {exitMultiple}x
              </span>
            </div>
            <input
              id="sc-mult"
              type="range"
              {...MULTIPLE_RANGE}
              step={0.1}
              value={exitMultiple}
              onChange={(e) => {
                editedThesis.current = true;
                setExitMultiple(parseFloat(e.target.value));
                setActivePreset("custom");
              }}
              className="amber-range"
              style={
                {
                  "--range-progress": progressPct(exitMultiple, MULTIPLE_RANGE.min, MULTIPLE_RANGE.max),
                } as React.CSSProperties
              }
            />
            <div className="font-mono-num mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>5×</span>
              <span>Base {baseMultiple}×</span>
              <span>45×</span>
            </div>
          </div>
        </div>

        {/* Thesis Note & Public Showcase — model first, annotate below */}
        <div className="mt-5 space-y-2 border-t border-[var(--border)] pt-4">
          <input
            type="text"
            value={thesisNote}
            maxLength={240}
            onChange={(e) => {
              editedThesis.current = true;
              setThesisNote(e.target.value);
            }}
            placeholder="Optional 1-line thesis note (shown in Portfolio & Watchlist)…"
            aria-label="Optional thesis note"
            className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
          />
          {userId && (
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={isPublicThesis}
                onChange={(e) => {
                  editedThesis.current = true;
                  setIsPublicThesis(e.target.checked);
                }}
                className="accent-[var(--amber)]"
              />
              Showcase this thesis on my public investor profile
            </label>
          )}
        </div>
      </section>

      {showBaseIssue ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-7">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Base case unavailable</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{base.issue}</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Adjust the assumptions to explore a custom scenario.</p>
        </section>
      ) : (
      <section className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-7">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Fair value today at a {projection.hurdleRatePct.toFixed(1).replace(/\.0$/, "")}% hurdle
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-4">
            <span
              className={`font-mono-num text-4xl font-semibold tracking-[-0.03em] sm:text-5xl ${verdict.color}`}
            >
              {verdict.label}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-3 text-sm text-[var(--text-secondary)]">
            <span>
              Fair value:{" "}
              <strong className="font-mono-num text-[var(--text-primary)]">
                ${projection.fairValueToday.toFixed(2)}
              </strong>
            </span>
            <span>/</span>
            <span>
              Current price:{" "}
              <strong className="font-mono-num text-[var(--text-primary)]">
                ${company.price.toFixed(2)}
              </strong>
            </span>
          </div>

          {isDefault && base.valuation && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Bear–bull range ${base.valuation.fairValueLow.toFixed(2)}–${base.valuation.fairValueHigh.toFixed(2)}
            </p>
          )}
          {basis.model?.earningsFallback && lens === "pe" && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Earnings model used because the cash and debt inputs could not be verified.
            </p>
          )}

          {/* Visual Fair Value vs. Current Price Comparison Bars */}
          <div className="mt-5 space-y-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
            <div>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Current Share Price</span>
                <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                  ${company.price.toFixed(2)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full bg-[var(--text-secondary)] transition-all duration-150"
                  style={{ width: `${Math.max(4, pricePosPct)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Your Fair Value Today</span>
                <span className={`font-mono-num font-semibold ${verdict.color}`}>
                  ${projection.fairValueToday.toFixed(2)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${Math.max(4, fairPosPct)}%`,
                    backgroundColor:
                      projection.upsidePct >= 12
                        ? "var(--positive)"
                        : projection.upsidePct <= -12
                          ? "var(--negative)"
                          : "var(--amber)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Visual 3-Step Valuation Flow (replaces 4-line prose paragraph) */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)]">Today</span>
              <strong className="font-mono-num text-[var(--text-primary)]">
                ${company.price.toFixed(2)}
              </strong>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)]">5Y Scenario Exit</span>
              <strong className="font-mono-num text-[var(--amber)]">
                ${projection.yr5TargetPrice.toFixed(2)}
              </strong>
              {projection.irrPct !== null && (
                <span className="font-mono-num text-[11px] text-[var(--text-secondary)]">
                  ({formatPct(projection.irrPct, true)}/yr)
                </span>
              )}
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)]">Fair Value Today</span>
              <strong className={`font-mono-num ${verdict.color}`}>
                ${projection.fairValueToday.toFixed(2)}
              </strong>
            </div>
          </div>

          {modelStrip.length >= 2 && (
            <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
              <span className="text-[11px] text-[var(--text-muted)]">
                Base Case across models:
              </span>
              {modelStrip.map((m) => {
                const isSelected = lens === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => switchLens(m.id)}
                    className={`font-mono-num inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[var(--amber-soft)] font-semibold text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                        : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span>{m.label}:</span>
                    <strong>${m.fairValue.toFixed(0)}</strong>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Scenario IRR / yr</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
              {projection.irrPct === null ? "—" : formatPct(projection.irrPct, true)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Year-5 Exit Value / Share</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--amber)]">
              ${projection.yr5TargetPrice.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Year-5 Revenue</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
              {formatCurrencyCompact(projection.yr5Rev)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">{LENSES[lens].metric}</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
              {formatCurrencyCompact(projection.yr5TrueFcf)}
            </div>
          </div>
        </div>
      </section>
      )}
    </div>

      <ThesisHistoryPanel
        entries={thesisHistory}
        onRestore={(entry) => {
          if (!supportsLens(entry.lens)) return;
          editedThesis.current = true;
          setUnavailableSharedLens(false);
          setActivePreset("custom");
          setLens(entry.lens);
          setRevGrowth(entry.revGrowth);
          setTargetMargin(entry.targetMargin);
          setExitMultiple(entry.exitMultiple);
          setThesisNote(entry.thesisNote ?? "");
        }}
      />

      <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <button
          type="button"
          onClick={() => {
            setCommunityTheses([]);
            setCommunityStatus("loading");
            setShowCommunityTheses((prev) => !prev);
          }}
          aria-expanded={showCommunityTheses}
          className="flex w-full items-center justify-between gap-2 text-left cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--amber)]" aria-hidden="true" />
            Community Theses

          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform ${
              showCommunityTheses ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>

        {showCommunityTheses && communityStatus === "loading" && (
          <p role="status" className="mt-2 text-xs text-[var(--text-muted)]">Loading public theses…</p>
        )}
        {showCommunityTheses && communityStatus === "loaded" && communityTheses.length === 0 && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">No published theses for this company.</p>
        )}
        {showCommunityTheses && communityStatus === "failed" && (
          <p role="status" className="mt-2 text-xs text-[var(--text-muted)]">Public theses are temporarily unavailable.</p>
        )}
        {showCommunityTheses && communityTheses.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {communityTheses.map((item) => {
              const itemProj = computeScenarioProjection(basis, item);
              const itemIrr = itemProj?.irrPct ?? null;
              return (
                <div
                  key={`${item.handle}-${item.updatedAt}`}
                  className="flex flex-col justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/u/${encodeURIComponent(item.handle)}`}
                          className="font-mono-num truncate text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--amber)]"
                        >
                          {item.handle}
                        </Link>
                        <span className="font-mono-num rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                          {item.lens.toUpperCase()}
                        </span>
                      </div>
                      <div className="font-mono-num mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {item.revGrowth}% rev · {item.targetMargin}% margin · {item.exitMultiple}x
                      </div>
                    </div>
                    <span
                      className={`font-mono-num shrink-0 text-xs font-semibold ${
                        (itemIrr ?? -Infinity) >= 12
                          ? "text-[var(--positive)]"
                          : (itemIrr ?? -Infinity) >= 8
                            ? "text-[var(--amber)]"
                            : "text-[var(--negative)]"
                      }`}
                    >
                      {itemIrr === null ? "—" : `${formatPct(itemIrr, true)}/yr`}
                    </span>
                  </div>

                  {item.thesisNote && (
                    <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
                      {item.thesisNote}
                    </p>
                  )}

                  <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-[11px]">
                    <span className="font-mono-num text-[var(--text-muted)]">
                      {itemProj ? `FV $${itemProj.fairValueToday.toFixed(0)}` : "Projection unavailable"}
                    </span>
                    {itemProj && <button
                      type="button"
                      onClick={() => {
                        editedThesis.current = true;
                        setUnavailableSharedLens(false);
                        setActivePreset("custom");
                        setLens(item.lens);
                        setRevGrowth(item.revGrowth);
                        setTargetMargin(item.targetMargin);
                        setExitMultiple(item.exitMultiple);
                      }}
                      className="font-medium text-[var(--amber)] hover:underline cursor-pointer"
                    >
                      Load into model →
                    </button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
