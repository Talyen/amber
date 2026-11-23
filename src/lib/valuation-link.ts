export const SCENARIO_PARAMS = ["lens", "rev", "m", "exit"] as const;
export const REVERSE_DCF_PARAMS = ["wacc", "mult", "margin", "sbc"] as const;

export function valuationModelFromUrl(params: URLSearchParams): "scenario" | "reverse" | null {
  const model = params.get("model");
  if (model === "scenario" || model === "reverse") return model;
  if (SCENARIO_PARAMS.some((key) => params.has(key))) return "scenario";
  if (REVERSE_DCF_PARAMS.some((key) => params.has(key))) return "reverse";
  return null;
}
