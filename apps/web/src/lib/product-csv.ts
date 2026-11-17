/**
 * Product CSV import: template, parser and row → API payload mapping.
 * Pure functions (no React / API imports) so they can be tested on their own.
 */

/**
 * Original product import columns (products page, commit 1259b5a, May 2026; unchanged until
 * the hint was removed in b34257c). Restored as-is: same names, same order, header row only.
 */
export const PRODUCT_CSV_HEADERS = ["name", "sellingPrice", "costPrice", "mrp", "taxRate", "description", "tags", "status"] as const;

/** The original template: exactly the header row, as the old page built it (`CSV_HEADERS.join(",")`). */
export function buildProductCsvTemplate(): string {
  return PRODUCT_CSV_HEADERS.join(",");
}

/**
 * CSV / formula injection guard for files we generate: a cell that starts with = + - @ (or tab / CR)
 * would run as a formula when the file is opened in Excel / Sheets, so it gets a leading single quote
 * (shown as text). Plain numbers such as "-12.50" or "+5" are left as they are.
 */
export function neutralizeCsvFormula(v: string): string {
  if (!/^[=+\-@\t\r]/.test(v)) return v;
  if (/^[+-]?\d+(\.\d+)?$/.test(v)) return v;
  return `'${v}`;
}

function csvCell(raw: string): string {
  const v = neutralizeCsvFormula(String(raw ?? ""));
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Rows → CSV text (CRLF). Every cell passes through the formula-injection guard. */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Bulk product import needs both permissions (the API routes require products:create AND products:update). */
export function canImportProducts(permissions: readonly string[]): boolean {
  return permissions.includes("products:create") && permissions.includes("products:update");
}

/**
 * RFC 4180 parser: quoted fields, "" escapes, commas and line breaks inside quotes,
 * CRLF / LF / CR line endings, UTF-8 BOM (Excel). Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** "Selling Price", "selling_price", "sellingprice" → "sellingprice". */
export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_\-]+/g, "");
}

export interface NamedRef { id: string; name: string }

export interface ProductCsvPayload {
  name: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  brandId?: string;
  unit?: string;
  sellingPrice: number;
  costPrice: number;
  mrp: number;
  taxRate: number;
  description?: string;
  tags: string[];
  status: "ACTIVE" | "DRAFT";
  trackInventory: true;
  openingStock: number;
  reorderLevel?: number;
}

export type ProductCsvRowResult =
  | { ok: true; line: number; payload: ProductCsvPayload }
  | { ok: false; line: number; error: string };

function num(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Turns parsed CSV rows (header first) into validated payloads. Rows with problems are
 * reported with their spreadsheet line number instead of being sent to the server.
 */
export function mapProductCsv(
  rows: string[][],
  categories: NamedRef[],
  brands: NamedRef[],
): { headerError?: string; results: ProductCsvRowResult[] } {
  if (rows.length === 0) return { headerError: "The file is empty", results: [] };
  const headers = rows[0].map(normalizeHeader);
  if (!headers.includes("name")) {
    return { headerError: "Missing the \"name\" column. Use Import CSV → Download template for the expected columns.", results: [] };
  }
  const byName = (list: NamedRef[]) => new Map(list.map((x) => [x.name.trim().toLowerCase(), x.id]));
  const cats = byName(categories);
  const brs = byName(brands);
  const seenSku = new Map<string, number>();

  const results: ProductCsvRowResult[] = rows.slice(1).map((cols, i) => {
    const line = i + 2;
    const o: Record<string, string> = {};
    headers.forEach((h, j) => { o[h] = (cols[j] ?? "").trim(); });
    const fail = (error: string): ProductCsvRowResult => ({ ok: false, line, error });

    if (!o.name) return fail("name is empty");
    const sellingPrice = num(o.sellingprice);
    const costPrice = num(o.costprice);
    if (sellingPrice === undefined || Number.isNaN(sellingPrice) || sellingPrice < 0) return fail("sellingPrice must be a number ≥ 0");
    if (costPrice === undefined || Number.isNaN(costPrice) || costPrice < 0) return fail("costPrice must be a number ≥ 0");
    const mrp = num(o.mrp) ?? sellingPrice;
    if (Number.isNaN(mrp) || mrp < 0) return fail("mrp must be a number ≥ 0");
    const taxRate = num(o.taxrate) ?? 18;
    if (Number.isNaN(taxRate) || taxRate < 0 || taxRate > 100) return fail("taxRate must be between 0 and 100");
    const openingStock = num(o.openingstock) ?? 0;
    if (Number.isNaN(openingStock) || openingStock < 0) return fail("openingStock must be a number ≥ 0");
    const reorderLevel = num(o.reorderlevel);
    if (reorderLevel !== undefined && (!Number.isInteger(reorderLevel) || reorderLevel < 0)) return fail("reorderLevel must be a whole number ≥ 0");

    const statusRaw = (o.status || "DRAFT").toUpperCase();
    if (statusRaw !== "ACTIVE" && statusRaw !== "DRAFT") return fail("status must be ACTIVE or DRAFT");

    let categoryId: string | undefined;
    if (o.category) {
      categoryId = cats.get(o.category.toLowerCase());
      if (!categoryId) return fail(`category "${o.category}" not found. Create it first or leave empty`);
    }
    let brandId: string | undefined;
    if (o.brand) {
      brandId = brs.get(o.brand.toLowerCase());
      if (!brandId) return fail(`brand "${o.brand}" not found. Create it first or leave empty`);
    }
    if (o.sku) {
      const k = o.sku.toLowerCase();
      if (seenSku.has(k)) return fail(`sku "${o.sku}" is repeated (also on line ${seenSku.get(k)})`);
      seenSku.set(k, line);
    }

    return {
      ok: true,
      line,
      payload: {
        name: o.name,
        sku: o.sku || undefined,
        barcode: o.barcode || undefined,
        categoryId,
        brandId,
        unit: o.unit || undefined,
        sellingPrice,
        costPrice,
        mrp,
        taxRate,
        description: o.description || undefined,
        tags: o.tags ? o.tags.split("|").map((t) => t.trim()).filter(Boolean) : [],
        status: statusRaw,
        trackInventory: true,
        openingStock,
        reorderLevel,
      },
    };
  });
  return { results };
}
