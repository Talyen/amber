import { SaxesParser } from "saxes";
import type { ValuationBusinessFacts } from "../src/lib/valuation-business.ts";

type Filing = { date: string; periodEnd: string; accessionNumber: string };
type FinancingExposure = NonNullable<ValuationBusinessFacts["financingExposure"]>;

const businessAxes = new Set(["StatementBusinessSegmentsAxis", "SegmentReportingInformationBySegmentAxis", "BusinessGroupAxis"]);
const capitalGoodsIndustries = new Set([3523, 3531, 3537, 3711, 3713, 3714, 3715, 3790, 5080]);
const trailingName = (qname: string) => qname.split(":").at(-1) ?? "";
const reitDisclosureTags = new Set([
  "IncomeTaxDisclosureTextBlock", "StockholdersEquityNoteDisclosureTextBlock",
  "OrganizationConsolidationAndPresentationOfFinancialStatementsDisclosureTextBlock",
  "DescriptionOfBusinessTextBlock",
]);

export function hasFinancingSegmentLead(sic: number | undefined, gaap: Record<string, {
  units?: Record<string, { end: string; filed: string }[]>;
}> | undefined, filing: Filing): boolean {
  if (sic !== undefined && capitalGoodsIndustries.has(sic)) return true;
  return Object.entries(gaap ?? {}).some(([tag, fact]) =>
    /^FinancingReceivable.*(Allowance|CreditLoss)/.test(tag) &&
    Object.values(fact.units ?? {}).some(rows => rows.some(row => row.end === filing.periodEnd && row.filed <= filing.date)),
  );
}

export function secFilingInstanceUrl(cik: string, accession: string, document: string | undefined): string | undefined {
  if (!/^\d{1,10}$/.test(cik) || !/^\d{10}-\d{2}-\d{6}$/.test(accession) ||
      !document || !/^[\w.-]+\.html?$/i.test(document)) return;
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${document.replace(/\.html?$/i, "_htm.xml")}`;
}

export function extractBusinessInstanceFacts(xml: string, cik: string, filing: Filing) {
  type Context = { entity?: string; instant?: string; end?: string; dimensions: { axis: string; member: string }[]; typed?: boolean };
  const contexts = new Map<string, Context>();
  const values: { contextId: string; unit: string; tag: string; value: number }[] = [];
  const reitDisclosures: { contextId: string; tag: string }[] = [];
  const instance = "http://www.xbrl.org/2003/instance";
  const dimensions = "http://xbrl.org/2006/xbrldi";
  const parser = new SaxesParser({ xmlns: true });
  let context: Context | undefined;
  let leaf: ((value: string) => void) | undefined;
  let content = "";
  parser.on("opentag", ({ uri, local, attributes }) => {
    leaf = undefined;
    content = "";
    if (uri === instance && local === "context" && attributes.id?.value) {
      context = { dimensions: [] };
      contexts.set(attributes.id.value, context);
    } else if (context && uri === instance && local === "instant") {
      leaf = value => { if (context) context.instant = value; };
    } else if (context && uri === instance && local === "endDate") {
      leaf = value => { if (context) context.end = value; };
    } else if (context && uri === instance && local === "identifier") {
      leaf = value => { if (context) context.entity = value; };
    } else if (context && uri === dimensions && local === "explicitMember") {
      leaf = value => { context?.dimensions.push({ axis: attributes.dimension?.value ?? "", member: value }); };
    } else if (context && uri === dimensions && local === "typedMember") {
      context.typed = true;
    } else if (/^https?:\/\/(?:fasb\.org\/us-gaap|xbrl\.ifrs\.org\/taxonomy\/[^/]+\/ifrs-full)(?:\/|$)/.test(uri)) {
      const contextId = attributes.contextRef?.value;
      const unit = attributes.unitRef?.value;
      if (contextId && unit && /^(Assets|NotesReceivableNet|FinancingReceivableRecordedInvestmentNet)$/.test(local)) {
        leaf = value => { if (Number(value) > 0) values.push({ contextId, unit, tag: local, value: Number(value) }); };
      } else if (contextId && reitDisclosureTags.has(local)) {
        leaf = value => {
          const disclosure = value.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|#160);|\s+/g, " ").replace(/ +/g, " ");
          const explicitStatus = /\bwe (?:have elected|elected|qualify) to be taxed as a (?:reit|real estate investment trust)\b/i;
          const distribution = /\b(?:to qualify as a reit,? we|as a reit,? we) are required to distribute[^.]{0,150}\b90(?:\s*%| percent\b)/i;
          if (explicitStatus.test(disclosure) || distribution.test(disclosure)) {
            reitDisclosures.push({ contextId, tag: local });
          }
        };
      }
    }
  });
  parser.on("text", value => { if (leaf) content += value; });
  parser.on("closetag", ({ uri, local }) => {
    leaf?.(content.trim());
    leaf = undefined;
    if (uri === instance && local === "context") context = undefined;
  });
  parser.write(xml).close();

  const entityMatches = (ctx: Context | undefined): ctx is Context =>
    Boolean(ctx?.entity && /^\d+$/.test(ctx.entity) && Number(ctx.entity) === Number(cik) && !ctx.typed);
  const relevant = values.flatMap(row => {
    const ctx = contexts.get(row.contextId);
    return entityMatches(ctx) && ctx.instant === filing.periodEnd && Number.isFinite(row.value)
      ? [{ ...row, dimensions: ctx.dimensions }] : [];
  });
  const report = { periodEnd: filing.periodEnd, filedAt: filing.date, accession: filing.accessionNumber };
  const reit = reitDisclosures.find(row => {
    const ctx = contexts.get(row.contextId);
    return entityMatches(ctx) && ctx.dimensions.length === 0 && (ctx.instant ?? ctx.end) === filing.periodEnd;
  });
  let best: FinancingExposure | undefined;
  for (const row of relevant) {
    if (row.dimensions.length !== 1) continue;
    const { axis, member } = row.dimensions[0];
    if (!businessAxes.has(trailingName(axis)) ||
        !/(financialservices|financial|financing|finance|credit)member$/i.test(trailingName(member))) continue;
    const assets = new Set(relevant.filter(v => v.tag === "Assets" && v.dimensions.length === 0 && v.unit === row.unit).map(v => v.value));
    if (assets.size !== 1) continue;
    const [total] = assets;
    const assetShare = row.value / total;
    if (assetShare <= 1 && (!best || assetShare > best.assetShare)) {
      best = { ...report, tags: ["Assets", `${row.tag} [${axis}=${member}]`], assetShare };
    }
  }
  return { financingExposure: best, reitTaxStatus: reit ? { ...report, tags: [reit.tag] } : undefined };
}
