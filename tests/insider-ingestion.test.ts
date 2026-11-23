import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOpenInsiderHtml, parseSecForm4Xml } from "../scripts/ingest-form4.ts";

const accession = "0000000100-26-000001";
const filingDate = "2026-11-20";

test("the SEC fallback keeps every qualifying fill and separates purchases from sales", () => {
  function transaction(code: string, shares: number, price: number) {
    return `
      <nonDerivativeTransaction>
        <transactionCode>${code}</transactionCode>
        <transactionShares><value>${shares}</value></transactionShares>
        <transactionPricePerShare><value>${price}</value></transactionPricePerShare>
      </nonDerivativeTransaction>`;
  }

  const xml = [
    transaction("P", 500, 100),
    transaction("P", 600, 120),
    transaction("S", 1000, 100),
    transaction("P", 100, 100),
  ].join("");
  const [purchase, sale, ...extra] = parseSecForm4Xml(xml, "EXAMPLE", accession, filingDate);

  assert.equal(extra.length, 0);
  assert.equal(purchase.id, `EXAMPLE:${accession}:P`);
  assert.equal(purchase.shares, 1100);
  assert.equal(purchase.totalValue, 0.122);
  assert.equal(purchase.pricePerShare, 110.91);
  assert.equal(sale.id, `EXAMPLE:${accession}:S`);
  assert.equal(sale.shares, 1000);
});

test("OpenInsider aggregation rounds after combining the original fill values", () => {
  function row() {
    const cells = Array<string>(13).fill("");
    cells[1] = `<a href="/Archives/edgar/data/100/${accession.replaceAll("-", "")}/file.xml">${filingDate}</a>`;
    cells[3] = "<a>EXAMPLE</a>";
    cells[5] = "Example Person";
    cells[6] = "Dir";
    cells[8] = "$25.45";
    cells[9] = "1,000";
    cells[12] = "$25,450";
    return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
  }

  const trades = parseOpenInsiderHtml(row() + row(), new Set(["EXAMPLE"]), "Buy");
  assert.equal(trades.length, 1);
  assert.equal(trades[0].shares, 2000);
  assert.equal(trades[0].totalValue, 0.051);
  assert.equal(trades[0].pricePerShare, 25.45);
});
