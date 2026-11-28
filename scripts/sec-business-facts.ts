import { MATERIAL_FINANCING_ASSET_SHARE, classifyValuationBusiness, validSecSic, type FiledBusinessBalance, type ValuationBusinessFacts } from "../src/lib/valuation-business.ts";
import { extractBusinessInstanceFacts, hasFinancingSegmentLead } from "./sec-business-instance.ts";

interface SecBalanceFact {
  readonly start?: string;
  readonly end: string;
  readonly val: number;
  readonly accn: string;
  readonly form: string;
  readonly filed: string;
}

type SecFacts = Partial<Record<"us-gaap" | "ifrs-full",
  Record<string, { units?: Record<string, SecBalanceFact[]> }>>>;

const regulatedAssetGroups = [
  ["RegulatoryAssets"], ["NetRegulatoryAssets"],
  ["RegulatoryAssetsCurrent", "RegulatoryAssetsNoncurrent"],
];
const financingTagGroups = [
  ["FinancingReceivableRecordedInvestmentNet"],
  ["FinancingReceivableRecordedInvestmentNetCurrent", "FinancingReceivableRecordedInvestmentNetNoncurrent"],
  ["NotesAndLoansReceivableNetCurrent", "NotesAndLoansReceivableNetNoncurrent"],
  ["NotesReceivableNet"],
  ["FinanceReceivablesNetCurrent", "FinanceReceivablesNetNoncurrent"],
  ["NotesAndLoansReceivableGrossCurrent", "NotesAndLoansReceivableGrossNoncurrent"],
  ["FinancingReceivableBeforeAllowanceForCreditLossAndFee"],
  ["LoansAndLeasesReceivableNetOfDeferredIncome", "LoansAndLeasesReceivableNetReportedAmount"],
  ["LoansAndAdvancesToCustomers"],
  ["FundsHeldForClients"], ["CustomerFunds"], ["FundsPayableToCustomers"],
];

interface Balances {
  report: Omit<FiledBusinessBalance, "tags">;
  values: Map<string, Set<number>>;
}

export function extractValuationBusinessFacts(
  facts: SecFacts | undefined,
  secSic: number | undefined,
  latest: { date: string; periodEnd: string },
): ValuationBusinessFacts | undefined {
  const result: ValuationBusinessFacts = { sic: validSecSic(secSic) };
  const cutoff = Date.parse(latest.periodEnd) - 400 * 86_400_000;
  const reports = new Map<string, Balances>();
  const tags = new Set(["Assets", ...regulatedAssetGroups.flat(), ...financingTagGroups.flat()]);
  for (const tag of tags) {
    for (const tax of ["us-gaap", "ifrs-full"] as const) {
      for (const [unit, entries] of Object.entries(facts?.[tax]?.[tag]?.units ?? {})) {
        if (!/^[A-Z]{3}$/.test(unit)) continue;
        for (const item of entries) {
          if (item.start || !item.end || !item.filed || !item.accn || !Number.isFinite(item.val) ||
              !/^(10-K|10-Q|20-F|40-F)(\/A)?$/.test(item.form) ||
              item.end > latest.periodEnd || item.filed > latest.date || item.filed < item.end ||
              Date.parse(item.end) < cutoff) continue;
          const key = JSON.stringify([tax, unit, item.end, item.filed, item.accn]);
          let row = reports.get(key);
          if (!row) {
            row = { report: { periodEnd: item.end, filedAt: item.filed, accession: item.accn }, values: new Map() };
            reports.set(key, row);
          }
          const values = row.values.get(tag) ?? new Set<number>();
          values.add(item.val);
          row.values.set(tag, values);
        }
      }
    }
  }

  for (const {report, values} of [...reports.values()].sort((a, b) =>
    b.report.periodEnd.localeCompare(a.report.periodEnd) || b.report.filedAt.localeCompare(a.report.filedAt))) {
    const single = (tag: string) => {
      const candidates = values.get(tag);
      return candidates?.size === 1 ? [...candidates][0] : undefined;
    };
    const assets = single("Assets");
    if (assets === undefined || assets <= 0) continue;
    // Deferred recovery through rates is evidence of regulated operations.
    // A regulatory liability on its own can reflect credits owed to customers.
    if (!result.rateRegulation) {
      for (const group of regulatedAssetGroups) {
        const found = group.filter(tag => (single(tag) ?? 0) > 0);
        const balance = found.reduce((sum, tag) => sum + (single(tag) ?? 0), 0);
        if (balance > 0 && balance <= assets) {
          result.rateRegulation = { ...report, tags: found };
          break;
        }
      }
    }
    if (!result.financingExposure) {
      // Prefer consolidated alternatives rather than adding overlapping tags.
      // A single reported current or noncurrent balance is a lower bound.
      let best: { tags: string[]; assetShare: number } | undefined;
      for (const group of financingTagGroups) {
        const found = group.filter(tag => single(tag) !== undefined);
        const total = found.reduce((sum, tag) => sum + Math.max(0, single(tag) ?? 0), 0);
        if (found.length && total <= assets && (!best || total / assets > best.assetShare)) {
          best = { tags: ["Assets", ...found], assetShare: total / assets };
        }
      }
      if (best) result.financingExposure = { ...report, ...best };
    }
  }
  return result.sic || result.financingExposure || result.rateRegulation ? result : undefined;
}

type Filing = { date: string; periodEnd: string; accessionNumber: string };

export async function readValuationBusinessFacts(
  facts: SecFacts | undefined, sic: number | undefined, filing: Filing, cik: string,
  readInstance: () => Promise<string | undefined>,
): Promise<ValuationBusinessFacts | undefined> {
  const extracted = extractValuationBusinessFacts(facts, sic, filing);
  const business = classifyValuationBusiness({ sector: "", sic, businessFacts: extracted });
  const checkReit = sic !== undefined && sic >= 6500 && sic < 6600;
  const checkFinancing = business === "operating" && hasFinancingSegmentLead(sic, facts?.["us-gaap"], filing);
  if (!checkReit && !checkFinancing) return extracted;
  try {
    const instance = await readInstance();
    if (!instance) return extracted;
    const { financingExposure, reitTaxStatus } = extractBusinessInstanceFacts(instance, cik, filing);
    if (checkReit && reitTaxStatus) return { ...extracted, reitTaxStatus };
    if (checkFinancing && financingExposure && financingExposure.assetShare >= MATERIAL_FINANCING_ASSET_SHARE) {
      return { ...extracted, financingExposure };
    }
  } catch {
    // An unavailable filing instance does not invalidate standardized Company Facts.
  }
  return extracted;
}
