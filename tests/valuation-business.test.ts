import assert from "node:assert/strict";
import { test } from "node:test";
import { readValuationBusinessFacts, extractValuationBusinessFacts } from "../scripts/sec-business-facts.ts";
import { withValuationBusinessFacts } from "../src/data/valuation-business-facts.ts";
import { getValuationBusiness } from "../src/lib/finance.ts";

const filing = { periodEnd: "2026-06-30", date: "2026-08-08", accessionNumber: "0000000100-26-000010" };
const period = { end: filing.periodEnd, filed: filing.date, accn: filing.accessionNumber, form: "10-Q" };
const usd = (val: number) => ({ units: { USD: [{ ...period, val }] } });
const company = { ticker: "ALIAS", sector: "Industrials", lastFiling: filing };

test("valuation routing follows verified characteristics across ticker and sector labels", () => {
  const cases = [
    [6021, "financial"],
    [6798, "reit"],
    [4924, "operating"],
    [4911, "operating"],
    [1311, "commodity"],
    [1381, "operating"],
  ] as const;
  for (const [sic, expected] of cases) {
    const verified = { ...company, sic };
    const renamed = { ...verified, ticker: "RENAMED", sector: "Fintech & Data" };
    assert.equal(getValuationBusiness(verified), expected);
    assert.equal(getValuationBusiness(renamed), expected);
  }
  const legacyTicker = { ...company, ticker: "JPM" };
  assert.equal(getValuationBusiness(legacyTicker), "operating");
});

test("reported utility recovery and financing balances require compatible filing evidence", () => {
  const Assets = usd(1000);
  const liabilitiesOnly = extractValuationBusinessFacts({ "us-gaap": {
    Assets, RegulatoryLiabilities: usd(250),
  } }, 4911, filing);
  const recovery = extractValuationBusinessFacts({ "us-gaap": {
    Assets, RegulatoryAssetsNoncurrent: usd(250),
  } }, 4911, filing);
  assert.equal(getValuationBusiness({ ...company, businessFacts: liabilitiesOnly }), "operating");
  assert.equal(getValuationBusiness({ ...company, businessFacts: recovery }), "regulated-utility");

  const observed = extractValuationBusinessFacts({ "us-gaap": {
    Assets, NotesReceivableNet: usd(200),
    FinancingReceivableRecordedInvestmentNetNoncurrent: {
      units: { USD: [{ ...period, filed: "2026-08-09", val: 500 }] },
    },
  } }, 3531, filing);
  assert.equal(observed?.financingExposure?.assetShare, 0.2);
  assert.equal(getValuationBusiness({ ...company, businessFacts: observed }), "financing-exposed");
  const snapshot = withValuationBusinessFacts({
    ...company, businessFacts: observed, lastFiling: { ...filing, date: "2026-08-07" },
  });
  assert.equal(snapshot.businessFacts?.financingExposure, undefined);
});

test("material financing in a verified business segment is read from the filing instance", async () => {
  const context = (id: string, dimension = "", date = filing.periodEnd, entity = "100") =>
    `<context id="${id}"><entity><identifier scheme="http://www.sec.gov/CIK">${entity}</identifier>${dimension}</entity><period><instant>${date}</instant></period></context>`;
  const dimension = (axis: string, member: string) =>
    `<segment><d:explicitMember dimension="${axis}">${member}</d:explicitMember></segment>`;
  const xml = `<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:d="http://xbrl.org/2006/xbrldi"
    xmlns:g="http://fasb.org/us-gaap/2026" xmlns:x="https://example.com/business">
    ${context("group")}
    ${context("finance", dimension("x:BusinessGroupAxis", "x:CompanyFinancialMember"))}
    ${context("wrong", dimension("x:ProductAxis", "x:CreditMember"))}
    ${context("future", dimension("x:BusinessGroupAxis", "x:CreditMember"), "2026-09-30")}
    ${context("other", dimension("x:BusinessGroupAxis", "x:CreditMember"), filing.periodEnd, "999")}
    <g:Assets contextRef="group" unitRef="usd">1000</g:Assets>
    <g:NotesReceivableNet contextRef="finance" unitRef="usd">320</g:NotesReceivableNet>
    <g:Assets contextRef="wrong" unitRef="usd">800</g:Assets>
    <g:Assets contextRef="future" unitRef="usd">900</g:Assets>
    <g:Assets contextRef="other" unitRef="usd">900</g:Assets>
    <g:StockholdersEquityNoteDisclosureTextBlock contextRef="group">To qualify as a REIT, we are required to distribute annually to our stockholders at least 90% of our REIT taxable income.</g:StockholdersEquityNoteDisclosureTextBlock>
  </xbrl>`;
  const businessFacts = await readValuationBusinessFacts(undefined, 3711, filing, "100", async () => xml);
  assert.equal(businessFacts?.financingExposure?.assetShare, 0.32);
  assert.equal(businessFacts?.financingExposure?.accession, filing.accessionNumber);
  assert.equal(getValuationBusiness({ ...company, businessFacts }), "financing-exposed");
  const realEstate = await readValuationBusinessFacts(undefined, 6510, filing, "100", async () => xml);
  assert.equal(realEstate?.reitTaxStatus?.accession, filing.accessionNumber);
  assert.equal(getValuationBusiness({ ...company, businessFacts: realEstate }), "reit");
});
