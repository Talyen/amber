import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchInsiderBatch, fetchSecForm4Fallback, parseOpenInsiderHtml, parseSecForm4Xml } from "../scripts/ingest-form4.ts";

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

test("an unsuccessful sell request preserves buys and falls back only for sales", async (t) => {
  const buy = {
    id: "EXAMPLE:buy",
    ticker: "EXAMPLE",
    filingDate,
    insiderName: "Example Person",
    insiderTitle: "Director",
    transactionType: "Buy" as const,
    shares: 1000,
    pricePerShare: 100,
    totalValue: 0.1,
    accessionNumber: accession,
  };
  const sell = { ...buy, id: "EXAMPLE:sell", transactionType: "Sell" as const };
  const fetchMarket = async (type: "Buy" | "Sell") => {
    if (type === "Sell") throw new Error("OpenInsider sales unavailable");
    return [buy];
  };

  assert.deepEqual(await fetchInsiderBatch(fetchMarket, async () => []), [buy]);
  const warn = t.mock.method(console, "warn", () => {});
  assert.deepEqual(await fetchInsiderBatch(fetchMarket, async () => {
    throw new Error("SEC unavailable");
  }), [buy]);
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(
    await fetchInsiderBatch(fetchMarket, async () => [{ ...buy, shares: 1 }, sell]),
    [buy, sell],
  );
});

test("the SEC fallback skips unavailable Form 4 documents and keeps scanning older filings", async (t) => {
  const accessions = [1, 2, 3, 4].map((i) => `0000000100-26-00000${i}`);
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(url);
    if (url.includes("/submissions/")) {
      return Response.json({ filings: { recent: {
        form: ["4", "4", "4", "4"],
        accessionNumber: accessions,
        filingDate: accessions.map(() => filingDate),
        primaryDocument: ["xslF345X05/timeout.xml", "", "unavailable.xml", "xslF345X05/trade.xml"],
      } } });
    }
    if (url.endsWith("/timeout.xml")) throw new Error("SEC document request timed out");
    if (url.endsWith("/unavailable.xml")) return new Response(null, { status: 503 });
    return new Response(`<nonDerivativeTransaction>
      <transactionCode>P</transactionCode>
      <transactionShares><value>500</value></transactionShares>
      <transactionPricePerShare><value>100</value></transactionPricePerShare>
    </nonDerivativeTransaction>`);
  });
  const waits: number[] = [];
  const trades = await fetchSecForm4Fallback("EXAMPLE", "100", async (ms) => { waits.push(ms); });
  assert.deepEqual(trades.map((trade) => trade.accessionNumber), [accessions[3]]);
  assert.equal(urls.length, 4);
  assert.ok(urls[3].endsWith("/000000010026000004/trade.xml"));
  assert.deepEqual(waits, [150, 150, 150]);
});
