import bootstrapFacts from "./generated/valuation-business-facts.json" with { type: "json" };
import { classifyValuationBusiness, type FiledBusinessBalance, type ValuationBusinessFacts } from "../lib/valuation-business.ts";

const bootstrap: Partial<Record<string, ValuationBusinessFacts>> = bootstrapFacts;
const DAY_MS = 86_400_000;

export function withValuationBusinessFacts<T extends {
  cik?: string;
  sector: string;
  sic?: number;
  businessFacts?: ValuationBusinessFacts | null;
  lastFiling?: { date?: string; periodEnd?: string };
}>(company: T): T {
  const cached = company.cik ? bootstrap[company.cik.padStart(10, "0")] : undefined;
  const existing = company.businessFacts;
  if (!cached && !existing) return company;
  const date = company.lastFiling?.date;
  const period = company.lastFiling?.periodEnd;
  // Keep filing observations tied to the time of the financial snapshot.
  const eligible = (fact: FiledBusinessBalance | undefined) => fact && date && period &&
    fact.filedAt <= date && fact.periodEnd <= period &&
    Date.parse(period) - Date.parse(fact.periodEnd) <= 400 * DAY_MS;
  function latest<TBalance extends FiledBusinessBalance>(a?: TBalance, b?: TBalance): TBalance | undefined {
    const newer = eligible(a) ? a : undefined;
    const older = eligible(b) ? b : undefined;
    if (newer && (!older || newer.periodEnd >= older.periodEnd)) return newer;
    return older;
  }
  const businessFacts = {
    sic: existing?.sic ?? cached?.sic,
    reitTaxStatus: latest(existing?.reitTaxStatus, cached?.reitTaxStatus),
    rateRegulation: latest(existing?.rateRegulation, cached?.rateRegulation),
    financingExposure: latest(existing?.financingExposure, cached?.financingExposure),
  };
  const sector = classifyValuationBusiness({ ...company, businessFacts }) === "reit"
    ? "Real Estate & REITs" : company.sector;
  return { ...company, sector, businessFacts };
}
