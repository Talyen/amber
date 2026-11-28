export type ValuationBusiness =
  | "operating"
  | "financial"
  | "reit"
  | "regulated-utility"
  | "commodity"
  | "financing-exposed";

/** Source of a balance in an SEC periodic filing. */
export interface FiledBusinessBalance {
  periodEnd: string;
  filedAt: string;
  accession: string;
  tags: string[];
}

export interface ValuationBusinessFacts {
  /** SEC registrant classification from the submissions profile. */
  sic?: number;
  reitTaxStatus?: FiledBusinessBalance;
  rateRegulation?: FiledBusinessBalance;
  financingExposure?: FiledBusinessBalance & { assetShare: number };
}

export interface ValuationBusinessInput {
  sector: string;
  sic?: number;
  businessFacts?: ValuationBusinessFacts | null;
}

const utilityIndustries = new Set([4900, 4911, 4922, 4923, 4924, 4931, 4932, 4941, 4991]);
// Require a meaningful consolidated exposure. This is a routing threshold,
// not a claim about SEC segment-reporting requirements.
export const MATERIAL_FINANCING_ASSET_SHARE = 0.10;

export function validSecSic(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 10_000
    ? value : undefined;
}

export function classifyValuationBusiness(company: ValuationBusinessInput): ValuationBusiness {
  const facts = company.businessFacts;
  const sic = validSecSic(facts?.sic) ?? validSecSic(company.sic);
  if (sic === 6798 || facts?.reitTaxStatus || (sic === undefined && company.sector === "Real Estate & REITs")) return "reit";
  if (sic !== undefined ? (sic >= 6000 && sic < 6500) || sic === 6712 : company.sector === "Financials") {
    return "financial";
  }
  if (sic !== undefined && utilityIndustries.has(sic) && facts?.rateRegulation) {
    return "regulated-utility";
  }
  const assetShare = facts?.financingExposure?.assetShare;
  if (assetShare !== undefined && assetShare >= MATERIAL_FINANCING_ASSET_SHARE && assetShare <= 1) {
    return "financing-exposed";
  }
  // Extraction, mineral royalties, petroleum refining, primary steel and nonferrous smelting.
  // Power generation and energy services do not imply commodity production.
  if (sic !== undefined && ((sic >= 1000 && sic < 1380) ||
      (sic >= 1400 && sic < 1500) || sic === 2911 || sic === 3310 || sic === 3312 ||
      (sic >= 3330 && sic < 3340) || sic === 6795)) return "commodity";
  return "operating";
}
