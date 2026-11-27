import { computeScenarioProjection, type ScenarioAssumptions, type ScenarioBasis } from "./finance.ts";
import type { SavedValuationPreset } from "./valuation-presets.ts";

export interface StressHoldingInput {
  ticker: string;
  name: string;
  impliedCagr: number | null;
  sbcPctRevenue: number;
  netDilutionCagr: number;
  scenarioBasis: ScenarioBasis;
  baseScenario?: ScenarioAssumptions;
}

export interface PortfolioStressInputs {
  /** Negative percentage, e.g. -20 means exit multiples compress by 20%. */
  multipleCompressionPct: number;
  /** Positive percentage points shaved off annual revenue growth, e.g. 4 means -4 pts/yr. */
  growthHaircutPts: number;
  /** Negative percentage applied to the single largest holding, e.g. -30 means -30%. */
  topPositionDrawdownPct: number;
}

export interface PortfolioStressResult {
  estimatedDrawdownPct: number;
  topHoldingTicker: string | null;
  topHoldingWeightPct: number;
  baseThesisIrrPct: number | null;
  stressedThesisIrrPct: number | null;
  thesisIrrDeltaPct: number | null;
  thesisCoveredCount: number;
  /** Allocation-weighted five-year IRR using saved theses and Studio defaults. */
  stressedModelIrrPct: number | null;
  modelIrrDeltaPct: number | null;
  irrSource: "theses" | "mixed" | "base" | null;
}

export interface SbcAttributionRow {
  ticker: string;
  name: string;
  weightPct: number;
  sbcPctRevenue: number;
  weightedSbcPts: number;
  shareOfPortfolioSbcPct: number;
  netDilutionCagr: number;
  weightedDilutionPts: number;
}

export function computePortfolioStress(
  holdings: readonly StressHoldingInput[],
  normalizedWeights: ReadonlyMap<string, number>,
  presetsByTicker: Readonly<Record<string, SavedValuationPreset>>,
  inputs: PortfolioStressInputs
): PortfolioStressResult {
  const multCompression = Math.min(0, Math.max(-50, inputs.multipleCompressionPct));
  const growthHaircut = Math.max(0, Math.min(15, inputs.growthHaircutPts));
  const topShock = Math.min(0, Math.max(-60, inputs.topPositionDrawdownPct));

  let topHoldingTicker: string | null = null;
  let topHoldingWeight = 0;

  for (const h of holdings) {
    const w = normalizedWeights.get(h.ticker) ?? 0;
    if (w > topHoldingWeight) {
      topHoldingWeight = w;
      topHoldingTicker = h.ticker;
    }
  }

  let totalWeight = 0;
  let weightedDrawdown = 0;
  let baseIrrWeight = 0;
  let baseIrrSum = 0;
  let stressedIrrSum = 0;
  let thesisCoveredCount = 0;
  let modelIrrWeight = 0;
  let modelBaseIrrSum = 0;
  let modelStressedIrrSum = 0;
  let baseFallbackCount = 0;

  const multFactor = 1 + multCompression / 100;
  // Approximate duration-weighted repricing with a five-year growth haircut.
  const growthFactor = Math.pow(1 - growthHaircut / 100, 5);

  for (const h of holdings) {
    const w = normalizedWeights.get(h.ticker) ?? 0;
    if (w <= 0) continue;
    totalWeight += w;

    // Higher priced-in growth stocks have slightly higher duration sensitivity.
    const durationSensitivity = h.impliedCagr !== null && h.impliedCagr > 15 ? 1.15 : 1;
    const topHoldingFactor = h.ticker === topHoldingTicker ? 1 + topShock / 100 : 1;
    const baseHoldingShock = Math.max(-0.85, (multFactor * growthFactor - 1) * durationSensitivity);
    const holdingReturn = (1 + baseHoldingShock) * topHoldingFactor - 1;
    weightedDrawdown += holdingReturn * 100 * w;

    const preset = presetsByTicker[h.ticker];
    const thesisIrr = preset ? computeScenarioProjection(h.scenarioBasis, preset)?.irrPct : null;
    const usesThesis = thesisIrr != null;
    const assumptions = usesThesis ? preset : h.baseScenario;
    if (!assumptions) continue;
    const baseIrr = thesisIrr ?? computeScenarioProjection(h.scenarioBasis, assumptions)?.irrPct;
    const stressedIrr = computeScenarioProjection(h.scenarioBasis, {
      ...assumptions,
      revGrowth: Math.max(-10, assumptions.revGrowth - growthHaircut),
      exitMultiple: assumptions.exitMultiple * multFactor * topHoldingFactor,
    })?.irrPct;
    if (baseIrr == null || stressedIrr == null) continue;

    if (usesThesis) {
      thesisCoveredCount++;
      baseIrrWeight += w;
      baseIrrSum += baseIrr * w;
      stressedIrrSum += stressedIrr * w;
    } else {
      baseFallbackCount++;
    }
    modelIrrWeight += w;
    modelBaseIrrSum += baseIrr * w;
    modelStressedIrrSum += stressedIrr * w;
  }

  const estimatedDrawdownPct =
    totalWeight > 0 ? Number((weightedDrawdown / totalWeight).toFixed(1)) : 0;
  const baseThesisIrrPct =
    baseIrrWeight > 0 ? Number((baseIrrSum / baseIrrWeight).toFixed(1)) : null;
  const stressedThesisIrrPct =
    baseIrrWeight > 0 ? Number((stressedIrrSum / baseIrrWeight).toFixed(1)) : null;
  const thesisIrrDeltaPct =
    baseThesisIrrPct !== null && stressedThesisIrrPct !== null
      ? Number((stressedThesisIrrPct - baseThesisIrrPct).toFixed(1))
      : null;

  const baseModelIrrPct =
    modelIrrWeight > 0 ? Number((modelBaseIrrSum / modelIrrWeight).toFixed(1)) : null;
  const stressedModelIrrPct =
    modelIrrWeight > 0 ? Number((modelStressedIrrSum / modelIrrWeight).toFixed(1)) : null;
  const modelIrrDeltaPct =
    baseModelIrrPct !== null && stressedModelIrrPct !== null
      ? Number((stressedModelIrrPct - baseModelIrrPct).toFixed(1))
      : null;
  const irrSource: PortfolioStressResult["irrSource"] =
    thesisCoveredCount > 0 && baseFallbackCount > 0
      ? "mixed"
      : thesisCoveredCount > 0
        ? "theses"
        : baseFallbackCount > 0
          ? "base"
          : null;

  return {
    estimatedDrawdownPct,
    topHoldingTicker,
    topHoldingWeightPct: Number((topHoldingWeight * 100).toFixed(1)),
    baseThesisIrrPct,
    stressedThesisIrrPct,
    thesisIrrDeltaPct,
    thesisCoveredCount,
    stressedModelIrrPct,
    modelIrrDeltaPct,
    irrSource,
  };
}

export function computeSbcDilutionAttribution(
  holdings: readonly StressHoldingInput[],
  normalizedWeights: ReadonlyMap<string, number>
): SbcAttributionRow[] {
  let totalWeightedSbc = 0;
  const raw: Array<{
    ticker: string;
    name: string;
    weightPct: number;
    sbcPctRevenue: number;
    weightedSbcPts: number;
    netDilutionCagr: number;
    weightedDilutionPts: number;
  }> = [];

  for (const h of holdings) {
    const w = normalizedWeights.get(h.ticker) ?? 0;
    if (w <= 0) continue;
    const weightedSbcPts = h.sbcPctRevenue * w;
    totalWeightedSbc += weightedSbcPts;
    raw.push({
      ticker: h.ticker,
      name: h.name,
      weightPct: Number((w * 100).toFixed(1)),
      sbcPctRevenue: h.sbcPctRevenue,
      weightedSbcPts: Number(weightedSbcPts.toFixed(2)),
      netDilutionCagr: h.netDilutionCagr,
      weightedDilutionPts: Number((h.netDilutionCagr * w).toFixed(2)),
    });
  }

  return raw
    .map((row) => ({
      ...row,
      shareOfPortfolioSbcPct:
        totalWeightedSbc > 0
          ? Number(((row.weightedSbcPts / totalWeightedSbc) * 100).toFixed(0))
          : 0,
    }))
    .sort((a, b) => b.weightedSbcPts - a.weightedSbcPts);
}
