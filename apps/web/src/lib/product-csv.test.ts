// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductCsvTemplate, canImportProducts, neutralizeCsvFormula, parseCsv, toCsv } from "./product-csv.ts";

test("template is the original header row", () => {
  assert.equal(buildProductCsvTemplate(), "name,sellingPrice,costPrice,mrp,taxRate,description,tags,status");
});

test("toCsv quotes commas, quotes and line breaks and ends with CRLF", () => {
  assert.equal(toCsv([["a", "b,c"], ['say "hi"', "x\ny"]]), 'a,"b,c"\r\n"say ""hi""","x\ny"\r\n');
});

test("toCsv neutralises formula-like cells (CSV injection)", () => {
  const out = toCsv([["=HYPERLINK(\"http://evil\",\"x\")", "+cmd", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]]);
  assert.equal(out, `"'=HYPERLINK(""http://evil"",""x"")",'+cmd,'-2+3,'@SUM(A1),'\t=1,"'\r=1"\r\n`);
});

test("toCsv keeps plain numbers, including negatives, and normal text", () => {
  assert.equal(toCsv([["-12.50", "+5", "0", "12", "Rice -5kg", "a=b", ""]]), "-12.50,+5,0,12,Rice -5kg,a=b,\r\n");
});

test("neutralizeCsvFormula", () => {
  assert.equal(neutralizeCsvFormula("=1+1"), "'=1+1");
  assert.equal(neutralizeCsvFormula("-"), "'-");
  assert.equal(neutralizeCsvFormula("-7"), "-7");
  assert.equal(neutralizeCsvFormula("Soap"), "Soap");
});

test("toCsv output parses back to the (neutralised) cells", () => {
  const rows = [["line", "name", "problem"], ["7", 'Rice, "red"', "price\nmissing"], ["9", "=1+1", "-5"]];
  assert.deepEqual(parseCsv(toCsv(rows)), [["line", "name", "problem"], ["7", 'Rice, "red"', "price\nmissing"], ["9", "'=1+1", "-5"]]);
});

test("parseCsv handles BOM, CRLF, CR, quoted commas / newlines and \"\" escapes", () => {
  assert.deepEqual(parseCsv('﻿name,desc\r\n"A, B","x\r\ny"\rC,"say ""hi"""\n'), [["name", "desc"], ["A, B", "x\r\ny"], ["C", 'say "hi"']]);
});

test("parseCsv drops blank and whitespace-only lines and handles no trailing newline", () => {
  assert.deepEqual(parseCsv("a,b\n\n  \n1,2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv(""), []);
});

test("parseCsv keeps empty cells", () => {
  assert.deepEqual(parseCsv("a,,c\n,,x\n"), [["a", "", "c"], ["", "", "x"]]);
});

test("import needs both products:create and products:update", () => {
  assert.equal(canImportProducts(["products:create", "products:update"]), true);
  assert.equal(canImportProducts(["products:create"]), false);
  assert.equal(canImportProducts(["products:update", "products:read"]), false);
  assert.equal(canImportProducts([]), false);
});
