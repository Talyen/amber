import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCompanyName } from "../src/lib/company-name.ts";

test("normalizeCompanyName fixes possessive apostrophes, legal suffixes, connectors, and known brands", () => {
  const cases: Array<[string, string]> = [
    ["Dick'S Sporting Goods, INC.", "Dick's Sporting Goods, Inc."],
    ["Lowe'S Companies, INC.", "Lowe's Companies, Inc."],
    ["O Reilly Automotive INC", "O'Reilly Automotive Inc."],
    ["Bank OF America CORP", "Bank of America Corp."],
    ["Adobe INC.", "Adobe Inc."],
    ["Boeing CO", "Boeing Co."],
    ["American Express CO", "American Express Co."],
    ["Best Buy CO INC", "Best Buy Co. Inc."],
    ["Agnico Eagle Mines LTD", "Agnico Eagle Mines Ltd."],
    ["Aes CORP", "AES Corp."],
    ["Ati INC", "ATI Inc."],
    ["Astrazeneca PLC", "AstraZeneca PLC"],
    ["Autozone INC", "AutoZone Inc."],
    ["Ebay INC", "eBay Inc."],
    ["L3harris Technologies, INC.", "L3Harris Technologies, Inc."],
    ["Tpg Inc.", "TPG Inc."],
    ["Verisign INC", "VeriSign Inc."],
    ["NVIDIA Corporation", "NVIDIA Corporation"],
    ["BILL Holdings, Inc.", "BILL Holdings, Inc."],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeCompanyName(input), expected, input);
  }
});
