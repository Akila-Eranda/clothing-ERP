// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterSuppliers,
  keepSelectedSupplier,
  mergeSuppliers,
  supplierBrowsePath,
  moveActiveIndex,
  needsServerSearch,
  parseSupplierPage,
  queryWords,
  supplierDetail,
  supplierLookupPath,
  supplierMatches,
  SUPPLIER_PRELOAD_LIMIT,
  SUPPLIER_SERVER_MIN_CHARS,
  SUPPLIER_SEARCH_PLACEHOLDER,
  type SupplierOption,
} from "./supplier-search.ts";

const S: SupplierOption[] = [
  { id: "s1", name: "Lanka Distributors", phone: "011 200 0001", code: "SUP-001" },
  { id: "s2", name: "Ceylon Traders", phone: "0112000002", code: "SUP-002" },
  { id: "s3", name: "Island Wholesale", phone: null, code: null },
  { id: "s4", name: "lanka spice house", phone: "077-123-4567", code: "LSH" },
];
const ids = (rows: SupplierOption[]) => rows.map((r) => r.id);

test("placeholder text is the agreed wording", () => {
  assert.equal(SUPPLIER_SEARCH_PLACEHOLDER, "Search supplier name, phone or code...");
});

test("blank query keeps every supplier, in the original order", () => {
  assert.deepEqual(ids(filterSuppliers(S, "")), ["s1", "s2", "s3", "s4"]);
  assert.deepEqual(ids(filterSuppliers(S, "   ")), ["s1", "s2", "s3", "s4"]);
  assert.deepEqual(queryWords("  "), []);
});

test("name search is case-insensitive and matches partial words", () => {
  assert.deepEqual(ids(filterSuppliers(S, "LANKA")), ["s1", "s4"]);
  assert.deepEqual(ids(filterSuppliers(S, "trad")), ["s2"]);
  assert.deepEqual(ids(filterSuppliers(S, "whole")), ["s3"]);
});

test("every word must match (same rule as the server search)", () => {
  assert.deepEqual(ids(filterSuppliers(S, "lanka dist")), ["s1"]);
  assert.deepEqual(ids(filterSuppliers(S, "lanka traders")), []);
});

test("phone search matches partial numbers, ignoring spaces and dashes", () => {
  assert.deepEqual(ids(filterSuppliers(S, "0112000002")), ["s2"]);
  assert.deepEqual(ids(filterSuppliers(S, "2000001")), ["s1"]);       // stored as "011 200 0001"
  assert.deepEqual(ids(filterSuppliers(S, "077 123")), ["s4"]);        // two words, both in the phone
  assert.deepEqual(ids(filterSuppliers(S, "0771234567")), ["s4"]);     // stored as "077-123-4567"
  assert.deepEqual(ids(filterSuppliers(S, "077-123-4567")), ["s4"]);
});

test("code search is case-insensitive and partial", () => {
  assert.deepEqual(ids(filterSuppliers(S, "sup-00")), ["s1", "s2"]);
  assert.deepEqual(ids(filterSuppliers(S, "lsh")), ["s4"]);
});

test("missing phone / code never match and never throw", () => {
  assert.equal(supplierMatches(S[2], "SUP"), false);
  assert.equal(supplierMatches({ id: "x", name: "No Extras" }, "123"), false);
});

test("no results gives an empty list (the picker then shows 'No suppliers found')", () => {
  assert.deepEqual(filterSuppliers(S, "zzz-not-a-supplier"), []);
});

test("server results are merged after local ones without duplicates", () => {
  const merged = mergeSuppliers([S[0], S[1]], [S[1], { id: "s9", name: "Server Only Co" }]);
  assert.deepEqual(ids(merged), ["s1", "s2", "s9"]);
});

test("paginated API payloads: rows and total are read from every wrapper the API uses", () => {
  const page = { data: [S[0], S[1]], meta: { total: 250, page: 1, limit: 100 } };
  assert.deepEqual(parseSupplierPage(page), { rows: [S[0], S[1]], total: 250 });
  assert.deepEqual(parseSupplierPage({ success: true, data: page }), { rows: [S[0], S[1]], total: 250 });
  assert.deepEqual(parseSupplierPage({ data: { success: true, data: page } }), { rows: [S[0], S[1]], total: 250 });
  assert.deepEqual(parseSupplierPage([S[3]]), { rows: [S[3]], total: null });
  assert.deepEqual(parseSupplierPage(null), { rows: [], total: null });
  assert.deepEqual(parseSupplierPage({ data: "oops" }), { rows: [], total: null });
});

test("the server is searched only when the preloaded list is incomplete and there is a query", () => {
  assert.equal(needsServerSearch("lanka", { loaded: 40, total: 40 }), false);   // everything already loaded
  assert.equal(needsServerSearch("lanka", { loaded: 100, total: 250 }), true);  // more on the server
  assert.equal(needsServerSearch("", { loaded: 100, total: 250 }), false);      // no query, no request
  assert.equal(needsServerSearch("  ", { loaded: 100, total: 250 }), false);
  assert.equal(needsServerSearch("lanka", { loaded: SUPPLIER_PRELOAD_LIMIT, total: null }), true); // full page, total unknown
  assert.equal(needsServerSearch("lanka", { loaded: 12, total: null }), false);
});

test("one non-blank character never searches the server; two do", () => {
  const big = { loaded: 100, total: 250 };
  assert.equal(needsServerSearch("a", big), false);
  assert.equal(needsServerSearch(" a ", big), false);
  assert.equal(needsServerSearch("7", big), false);
  assert.equal(needsServerSearch("ab", big), true);
  assert.equal(needsServerSearch("a b", big), true);   // two non-blank characters
  assert.equal(needsServerSearch("07", big), true);
  assert.equal(SUPPLIER_SERVER_MIN_CHARS, 2);
});

test("server search uses the lightweight lookup endpoint, encoded and trimmed", () => {
  assert.equal(supplierLookupPath("  adv supp "), "/suppliers/lookup?search=adv%20supp&limit=50");
  assert.equal(supplierLookupPath("a&b=c", 10), "/suppliers/lookup?search=a%26b%3Dc&limit=10");
});

test("initial load / Refresh use the lightweight lookup in browse mode, 100 rows", () => {
  assert.equal(supplierBrowsePath(), "/suppliers/lookup?browse=true&limit=100");
  assert.equal(SUPPLIER_PRELOAD_LIMIT, 100);
  assert.equal(supplierBrowsePath(25), "/suppliers/lookup?browse=true&limit=25");
});

test("browse response: rows and shop total are read from the API envelope", () => {
  const api = { success: true, data: { data: [S[0], S[1]], meta: { total: 107, limit: 100, page: 1, hasNextPage: true } } };
  assert.deepEqual(parseSupplierPage(api), { rows: [S[0], S[1]], total: 107 });
  assert.equal(needsServerSearch("ze", { loaded: 100, total: 107 }), true);
  assert.equal(needsServerSearch("ze", { loaded: 3, total: 3 }), false);
});

test("Refresh keeps the selected supplier even when it is not in the new first page", () => {
  const fresh = [S[0], S[1]];
  const fromSearch = { id: "s99", name: "Zeta Hardware", phone: null, code: "SUP-Z" };
  assert.deepEqual(ids(keepSelectedSupplier(fresh, [S[0], fromSearch], "s99")), ["s1", "s2", "s99"]);
  assert.deepEqual(ids(keepSelectedSupplier(fresh, [S[0]], "s2")), ["s1", "s2"]);          // already in the page: no duplicate
  assert.deepEqual(ids(keepSelectedSupplier(fresh, [S[0]], "")), ["s1", "s2"]);            // nothing selected
  assert.deepEqual(ids(keepSelectedSupplier(fresh, [], "gone")), ["s1", "s2"]);            // unknown selection: list unchanged
  const out = keepSelectedSupplier(fresh, [], null);
  assert.notEqual(out, fresh);                                                              // new array (safe for React state)
});

test("keyboard navigation wraps and clamps", () => {
  assert.equal(moveActiveIndex(-1, "ArrowDown", 3), 0);
  assert.equal(moveActiveIndex(0, "ArrowDown", 3), 1);
  assert.equal(moveActiveIndex(2, "ArrowDown", 3), 0);
  assert.equal(moveActiveIndex(0, "ArrowUp", 3), 2);
  assert.equal(moveActiveIndex(-1, "ArrowUp", 3), 2);
  assert.equal(moveActiveIndex(1, "Home", 3), 0);
  assert.equal(moveActiveIndex(0, "End", 3), 2);
  assert.equal(moveActiveIndex(5, "", 3), 2);    // list shrank: clamp
  assert.equal(moveActiveIndex(1, "ArrowDown", 0), -1);
});

test("detail line shows code and phone when present", () => {
  assert.equal(supplierDetail(S[0]), "SUP-001 · 011 200 0001");
  assert.equal(supplierDetail(S[2]), "");
  assert.equal(supplierDetail({ id: "x", name: "n", code: "C1", phone: "  " }), "C1");
});
