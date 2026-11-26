import { computeScenarioProjection, type ScenarioBasis } from "./finance.ts";
import {
  computePresetExpectedReturn,
  type SavedValuationPreset,
} from "./valuation-presets.ts";

export interface StressHoldingInput {
  ticker: string;
  name: string;
  impliedCagr: number | null;
  sbcPctRevenue: number;
  netDilutionCagr: number;
  scenarioBasis: ScenarioBasis;
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

  const multFactor = 1 + multCompression / 100;

  for (const h of holdings) {
    const w = normalizedWeights.get(h.ticker) ?? 0;
    if (w <= 0) continue;
    totalWeight += w;

    // Approximate duration-weighted repricing: multiple compression + 5Y compounded growth haircut
    const growthFactor =
      growthHaircut > 0
        ? Math.pow(Math.max(0.5, 1 - growthHaircut / 100), 5)
        : 1;
    // Higher priced-in growth stocks carry slightly higher duration sensitivity
    const durationSensitivity =
      h.impliedCagr !== null && h.impliedCagr > 15 ? 1.15 : 1.0;
    const baseHoldingShock = Math.max(
      -0.85,
      (multFactor * growthFactor - 1) * durationSensitivity
    );
    const holdingReturn =
      h.ticker === topHoldingTicker
        ? (1 + baseHoldingShock) * (1 + topShock / 100) - 1
        : baseHoldingShock;

    weightedDrawdown += holdingReturn * 100 * w;

    const preset = presetsByTicker[h.ticker];
    if (preset) {
      const baseProj = computePresetExpectedReturn(preset, h);
      const stressedScenario = computeScenarioProjection(h.scenarioBasis, {
        lens: preset.lens,
        revGrowth: Math.max(-10, preset.revGrowth - growthHaircut),
        targetMargin: preset.targetMargin,
        exitMultiple: Math.max(4, preset.exitMultiple * multFactor),
      });
      if (baseProj && stressedScenario && stressedScenario.irrPct !== null) {
        thesisCoveredCount++;
        baseIrrWeight += w;
        baseIrrSum += baseProj.irrPct * w;
        stressedIrrSum += stressedScenario.irrPct * w;
      }
    }
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

  return {
    estimatedDrawdownPct,
    topHoldingTicker,
    topHoldingWeightPct: Number((topHoldingWeight * 100).toFixed(1)),
    baseThesisIrrPct,
    stressedThesisIrrPct,
    thesisIrrDeltaPct,
    thesisCoveredCount,
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
