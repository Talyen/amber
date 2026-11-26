"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Link2, Sparkles } from "lucide-react";
import {
  type CompanySnapshot,
  buildScenarioBasis,
  computeScenarioProjection,
  getScenarioDefaults,
  formatCurrencyCompact,
  formatPct,
} from "@/lib/finance";
import { REVERSE_DCF_PARAMS } from "@/lib/valuation-link";
import {
  readLocalValuationPreset,
  writeLocalValuationPreset,
  type CommunityThesisItem,
  type SavedScenarioLens as ValuationLens,
  type SavedValuationPreset,
} from "@/lib/valuation-presets";
import { authClient } from "@/lib/auth-client";

interface ScenarioBuilderProps {
  company: CompanySnapshot;
}

function progressPct(value: number, min: number, max: number): string {
  return `${(((value - min) / (max - min)) * 100).toFixed(1)}%`;
}

const GROWTH_RANGE = { min: -5, max: 45 };
const MARGIN_RANGE = { min: 1, max: 55 };
const MULTIPLE_RANGE = { min: 8, max: 45 };

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
  if ((basis.equityLensOnly && !defaults.hasPe) ||
    ![basis.price, basis.dilutedShares, basis.revenue].every((n) => Number.isFinite(n) && n > 0)) {
    return <p className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
      A five-year scenario is unavailable for the reported fundamentals.
    </p>;
  }
  return <ScenarioSession basis={basis} defaults={defaults} key={userId ? `account:${userId}` : "guest"} {...props} userId={userId} />;
}

function ScenarioSession({
  company,
  basis,
  defaults,
  userId,
}: ScenarioBuilderProps & {
  basis: ReturnType<typeof buildScenarioBasis>;
  defaults: ReturnType<typeof getScenarioDefaults>;
  userId?: string;
}) {
  const [communityTheses, setCommunityTheses] = useState<CommunityThesisItem[]>([]);
  const [showCommunityTheses, setShowCommunityTheses] = useState(false);
  const [communityStatus, setCommunityStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const { hasEbit, hasPe, defaultLens, byLens, revGrowth: histGrowth } = defaults;
  const isFinancials = basis.equityLensOnly;
  const defaultsForLens = (lens: ValuationLens) => byLens[lens];

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

  const [lens, setLens] = useState<ValuationLens>(defaultLens);
  const lensDefaults = defaultsForLens(lens);
  const currentMargin = lens === "pe" ? basis.netMargin : lens === "ebit" ? basis.operatingMargin : basis.trueFcfMargin;
  const baseMargin = lensDefaults.margin;
  const baseMultiple = lensDefaults.multiple;

  const [revGrowth, setRevGrowth] = useState(histGrowth);
  const [targetMargin, setTargetMargin] = useState(baseMargin);
  const [exitMultiple, setExitMultiple] = useState(baseMultiple);
  const [thesisNote, setThesisNote] = useState("");
  const [isPublicThesis, setIsPublicThesis] = useState(false);
  const [activePreset, setActivePreset] = useState<"bear" | "base" | "bull" | "custom">("base");
  const [fromSharedLink, setFromSharedLink] = useState(false);
  const [restoredThesis, setRestoredThesis] = useState(false);
  const [copiedThesis, setCopiedThesis] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "local" | "failed">("idle");
  const editedThesis = useRef(false);
  const [unavailableSharedLens, setUnavailableSharedLens] = useState(false);
  const supportsLens = useCallback((candidate: string | null): candidate is ValuationLens =>
    (candidate === "fcf" && !isFinancials) || (candidate === "ebit" && hasEbit) || (candidate === "pe" && hasPe),
  [hasEbit, hasPe, isFinancials]);

  const applySavedThesis = useCallback((preset: SavedValuationPreset) => {
    setThesisNote(preset.thesisNote ?? "");
    setIsPublicThesis(preset.isPublic === true);
    if (!supportsLens(preset.lens)) {
      setUnavailableSharedLens(true);
      return;
    }
    setUnavailableSharedLens(false);
    setLens(preset.lens);
    setRevGrowth(preset.revGrowth);
    setTargetMargin(preset.targetMargin);
    setExitMultiple(preset.exitMultiple);
    setActivePreset("custom");
  }, [supportsLens]);

  // Hydrate shared thesis query params (?tab=dcf&lens=fcf&rev=15&m=28&exit=22)
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setRestoredThesis(true);
      if (editedThesis.current) return;
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
    if (!userId || !restoredThesis || fromSharedLink || editedThesis.current) return;
    const controller = new AbortController();
    fetch(`/api/valuation-presets?ticker=${encodeURIComponent(company.ticker)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { preset?: SavedValuationPreset | null } | null) => {
        const preset = data?.preset;
        if (controller.signal.aborted || !preset || editedThesis.current) return;
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

  async function handleSaveThesis() {
    editedThesis.current = true;
    const trimmedNote = thesisNote.replace(/\s+/g, " ").trim();
    const payload: SavedValuationPreset = {
      ticker: company.ticker,
      lens,
      revGrowth,
      targetMargin,
      exitMultiple,
      thesisNote: trimmedNote ? trimmedNote.slice(0, 240) : null,
      isPublic: Boolean(userId && isPublicThesis),
      updatedAt: new Date().toISOString(),
    };
    const storedLocally = writeLocalValuationPreset({ ...payload, owner: userId });
    if (!userId) {
      setSaveStatus(storedLocally ? "saved" : "failed");
      return;
    }

    setSaveStatus("saving");
    try {
      const response = await fetch("/api/valuation-presets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Could not sync thesis.");
      setSaveStatus("saved");
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
    const d = defaultsForLens(nextLens);
    setRevGrowth(histGrowth);
    setTargetMargin(d.margin);
    setExitMultiple(d.multiple);
    setActivePreset("base");
  }

  function applyPreset(kind: "bear" | "base" | "bull") {
    editedThesis.current = true;
    setActivePreset(kind);
    if (kind === "bear") {
      setRevGrowth(Math.max(0, Math.round(histGrowth * 0.55)));
      setTargetMargin(
        Number(Math.max(1, Math.round(baseMargin * 0.8 * 2) / 2).toFixed(1))
      );
      setExitMultiple(Math.max(10, Math.round(baseMultiple * 0.72)));
    } else if (kind === "base") {
      setRevGrowth(histGrowth);
      setTargetMargin(baseMargin);
      setExitMultiple(baseMultiple);
    } else {
      setRevGrowth(Math.min(45, Math.round(histGrowth * 1.3 + 2)));
      setTargetMargin(
        Number(Math.min(55, Math.round(baseMargin * 1.2 * 2) / 2).toFixed(1))
      );
      setExitMultiple(Math.min(42, Math.round(baseMultiple * 1.22)));
    }
  }

  const projection = useMemo(() => computeScenarioProjection(basis, {
    lens, revGrowth, targetMargin, exitMultiple,
  })!, [basis, lens, revGrowth, targetMargin, exitMultiple]);

  const modelStrip = useMemo(() => {
    const labels = { fcf: "True FCF", ebit: "EBIT", pe: "P/E" };
    const lenses: ValuationLens[] = ["fcf", "ebit", "pe"];
    return lenses.flatMap((id) => {
      const { margin, multiple } = byLens[id];
      const result = computeScenarioProjection(basis, {
        lens: id, revGrowth: histGrowth, targetMargin: margin, exitMultiple: multiple,
      });
      return result ? [{ id, label: labels[id], fairValue: result.fairValueToday, upsidePct: result.upsidePct }] : [];
    });
  }, [basis, byLens, histGrowth]);

  const verdict =
    projection.upsidePct >= 12
      ? {
          label: `${Math.round(projection.upsidePct)}% Undervalued`,
          badge: "Undervalued",
          color: "text-[var(--positive)]",
          pill: "bg-[var(--surface-subtle)] text-[var(--positive)] ring-1 ring-inset ring-[var(--border-strong)]",
        }
      : projection.upsidePct <= -12
        ? {
            label: `${Math.abs(Math.round(projection.upsidePct))}% Overvalued`,
            badge: "Overvalued",
            color: "text-[var(--negative)]",
            pill: "bg-[var(--surface-subtle)] text-[var(--negative)] ring-1 ring-inset ring-[var(--border-strong)]",
          }
        : {
            label: "Roughly Fairly Valued",
            badge: "Fairly Priced",
            color: "text-[var(--amber)]",
            pill: "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]",
          };

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
            Loaded custom assumptions ({revGrowth}% rev growth, {targetMargin}% margin, {exitMultiple}x exit). Drag any slider to stress-test your own view.
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
              Pick a preset or drag 3 simple sliders to see your expected annual return.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleSaveThesis}
              disabled={saveStatus === "saving"}
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
                  Share Thesis
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

        <div className="mt-3 space-y-2">
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

        {unavailableSharedLens && (
          <p role="status" className="mt-3 text-xs text-[var(--text-secondary)]">
            This thesis uses an unavailable valuation model. The studio shows the current base case.
          </p>
        )}

        {/* Valuation Methodology Selector */}
        {(hasEbit || hasPe) && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>Valuation Model</span>
              {isFinancials && lens === "pe" && (
                <span className="text-[var(--amber)]">
                  Auto-selected (Financials)
                </span>
              )}
              {defaultLens === "ebit" && lens === "ebit" && (
                <span className="text-[var(--amber)]">
                  Auto-selected (heavy growth CapEx)
                </span>
              )}
            </div>
            <div className="inline-flex w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5 text-xs">
              {(
                [
                  { id: "fcf" as const, label: "True FCF", enabled: !isFinancials },
                  { id: "ebit" as const, label: "Operating (EBIT)", enabled: hasEbit },
                  { id: "pe" as const, label: "Earnings (P/E)", enabled: hasPe },
                ]
              )
                .filter((m) => m.enabled)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => switchLens(m.id)}
                    className={`flex-1 rounded-md px-2 py-1.5 font-medium transition-colors cursor-pointer ${
                      lens === m.id
                        ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Bear / Base / Bull Presets */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(["bear", "base", "bull"] as const).map((kind) => {
            const active = activePreset === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => applyPreset(kind)}
                className={`rounded-lg border py-2 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  active
                    ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {kind} Case
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
                Annual Revenue Growth (Next 5Y)
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {formatPct(revGrowth, true, 0)}
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
              <span>-5%</span>
              <span>Hist: {formatPct(histGrowth, true, 0)}</span>
              <span>+45%</span>
            </div>
          </div>

          {/* Year-5 True FCF Margin */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label
                htmlFor="sc-margin"
                className="font-medium text-[var(--text-primary)]"
              >
                {lens === "ebit"
                  ? "Year-5 Operating Margin (EBIT)"
                  : lens === "pe"
                    ? "Year-5 Net Profit Margin"
                    : "Year-5 Real Cash Margin (True FCF)"}
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
                {lens === "ebit"
                  ? "Year-5 Valuation Multiple (EV / EBIT)"
                  : lens === "pe"
                    ? "Year-5 Valuation Multiple (P/E)"
                    : "Year-5 Valuation Multiple (EV / True FCF)"}
              </label>
              <span className="font-mono-num font-semibold text-[var(--amber)]">
                {exitMultiple}x
              </span>
            </div>
            <input
              id="sc-mult"
              type="range"
              {...MULTIPLE_RANGE}
              step={1}
              value={exitMultiple}
              onChange={(e) => {
                editedThesis.current = true;
                setExitMultiple(parseInt(e.target.value, 10));
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
              <span>8x (Value)</span>
              <span>22x (Quality)</span>
              <span>45x (Premium)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Right: Clear Fair Value & Undervalued / Overvalued Output */}
      <section className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-7">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Estimated Fair Value Today (at 10%/yr target return)
            </span>
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${verdict.pill}`}
            >
              {verdict.badge}
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

          <p className="mt-3.5 text-xs leading-relaxed text-[var(--text-secondary)]">
            If <strong className="text-[var(--text-primary)]">{company.name}</strong> grows revenue{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{formatPct(revGrowth, true, 0)}/yr</strong> to{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{formatCurrencyCompact(projection.yr5Rev)}</strong> at a{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{targetMargin}%</strong>{" "}
            {lens === "ebit" ? "operating" : lens === "pe" ? "net profit" : "real cash"} margin and trades at{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">{exitMultiple}x</strong> in 5 years, shares reach{" "}
            <strong className="font-mono-num text-[var(--text-primary)]">${projection.yr5TargetPrice.toFixed(2)}</strong>, worth{" "}
            <strong className={`font-mono-num ${verdict.color}`}>${projection.fairValueToday.toFixed(2)}</strong> today at a 10%/yr target return, including interim cash flows and today’s net cash adjustment.
          </p>

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
            <div className="text-[11px] text-[var(--text-muted)]">Expected Return / yr</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
              {projection.irrPct === null ? "—" : formatPct(projection.irrPct, true)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Year-5 Share Price</div>
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
            <div className="text-[11px] text-[var(--text-muted)]">{lens === "ebit" ? "Year-5 EBIT" : lens === "pe" ? "Year-5 Net Income" : "Year-5 True FCF"}</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[var(--text-primary)]">
              {formatCurrencyCompact(projection.yr5TrueFcf)}
            </div>
          </div>
        </div>
      </section>
    </div>

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
