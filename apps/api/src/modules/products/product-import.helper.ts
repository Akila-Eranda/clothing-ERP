/**
 * Product bulk import (Excel .xlsx / CSV): parsing, header mapping and row validation.
 * Pure functions (no Prisma / Nest) so they are unit-tested. The rules match the web CSV importer
 * (apps/web/src/lib/product-csv.ts) so the original CSV template keeps working unchanged, with extra
 * checks for SKU / barcode format, name length, price ≤ MRP and duplicates inside the file.
 */

/** Columns of the original CSV template (unchanged) followed by the optional extra columns. */
export const IMPORT_COLUMNS = [
  'name', 'sellingPrice', 'costPrice', 'mrp', 'taxRate', 'description', 'tags', 'status',
  'sku', 'barcode', 'category', 'brand', 'unit', 'openingStock', 'reorderLevel',
] as const;

export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_COMMIT_CHUNK = 200;

/** "Selling Price", "selling_price", "sellingprice" → "sellingprice"; plus a few common aliases. */
const ALIASES: Record<string, string> = {
  productname: 'name', product: 'name', itemname: 'name',
  price: 'sellingprice', saleprice: 'sellingprice', retailprice: 'sellingprice',
  cost: 'costprice', purchaseprice: 'costprice', buyingprice: 'costprice',
  tax: 'taxrate', vat: 'taxrate', vatrate: 'taxrate',
  categoryname: 'category', brandname: 'brand',
  stock: 'openingstock', qty: 'openingstock', quantity: 'openingstock',
  reorder: 'reorderlevel', reorderpoint: 'reorderlevel', ean: 'barcode',
};

export function normalizeHeader(h: string): string {
  const k = String(h ?? '').replace(/^﻿/, '').trim().toLowerCase().replace(/[\s_\-.()]+/g, '');
  return ALIASES[k] ?? k;
}

/**
 * One sheet / CSV row with the row number the user sees in Excel / Google Sheets (1 = header row).
 * Blank rows are dropped later, but they still count, so reported line numbers never shift.
 */
export type SheetRow = { line: number; cells: string[] };

/**
 * RFC 4180 CSV (quoted fields, "" escapes, line breaks in quotes, CRLF/LF/CR, UTF-8 BOM), keeping each
 * record's row number. Blank records are kept (and counted) so the numbers match the spreadsheet; a
 * line break inside a quoted cell stays in the same row, as Excel shows it.
 */
export function parseCsvRows(text: string): SheetRow[] {
  const s = text.replace(/^﻿/, '');
  const rows: SheetRow[] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endRow = () => { row.push(cell); cell = ''; rows.push({ line: rows.length + 1, cells: row }); row = []; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      endRow();
    } else cell += c;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

/** Cells only, blank lines dropped (kept for callers that do not need row numbers). */
export function parseCsv(text: string): string[][] {
  return parseCsvRows(text).map((r) => r.cells).filter((r) => r.some((v) => v.trim() !== ''));
}

export type ImportCells = Record<string, string>;
export type RawImportRow = { line: number; cells: ImportCells };

const isBlankRow = (cells: string[]) => !cells.some((v) => String(v ?? '').trim() !== '');

/**
 * Header row + data rows → rows keyed by normalised header, with spreadsheet line numbers.
 * Accepts numbered rows (from parseCsvRows / the Excel reader: the real row numbers are kept) or plain
 * rows (row i is line i + 1). Blank rows, including blank rows before the header, are skipped.
 */
export function rowsToRecords(input: string[][] | SheetRow[]): { headerError?: string; records: RawImportRow[] } {
  const numbered: SheetRow[] = (input as (string[] | SheetRow)[]).map((r, i) =>
    Array.isArray(r) ? { line: i + 1, cells: r } : r,
  );
  const rows = numbered.filter((r) => !isBlankRow(r.cells));
  if (!rows.length) return { headerError: 'The file is empty', records: [] };
  const headers = rows[0].cells.map(normalizeHeader);
  if (!headers.includes('name')) {
    return { headerError: 'Missing the "name" column. Download the template for the expected columns.', records: [] };
  }
  const dataRows = rows.slice(1);
  if (dataRows.length > IMPORT_MAX_ROWS) {
    return { headerError: `Too many rows (${dataRows.length}). Import at most ${IMPORT_MAX_ROWS} rows per file.`, records: [] };
  }
  const records = dataRows
    .map(({ line, cells: cols }) => {
      const cells: ImportCells = {};
      headers.forEach((h, j) => {
        if (h && cells[h] === undefined) cells[h] = String(cols[j] ?? '').trim();
      });
      return { line, cells };
    })
    .filter((r) => Object.values(r.cells).some((v) => v !== ''));
  return { records };
}

/**
 * True when a text cell would be read as a formula by Excel / LibreOffice / Sheets (CSV / formula
 * injection): it starts with = or @, or with + / - followed by something that is not a plain number.
 * Leading tab / CR count too. "-5", "+12.50" and "-1,200" are numbers, not formulas.
 */
export function looksLikeFormula(value: string | undefined | null): boolean {
  const v = String(value ?? '');
  if (!v) return false;
  if (/^[\t\r]/.test(v)) return true;
  if (/^[=@]/.test(v)) return true;
  if (/^[+-]/.test(v)) {
    const rest = v.slice(1).replace(/,/g, '').trim();
    return rest !== '' && !/^\d+(\.\d+)?$/.test(rest);
  }
  return false;
}

/** Text columns checked for formula-like values on import (warning only; the value is stored unchanged). */
export const FORMULA_CHECKED_FIELDS = ['name', 'sku', 'barcode', 'description'] as const;

export interface ImportProductPayload {
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
  status: 'ACTIVE' | 'DRAFT';
  trackInventory: true;
  openingStock: number;
  reorderLevel?: number;
}

export type ImportRowResult = {
  line: number;
  status: 'OK' | 'ERROR' | 'DUPLICATE';
  errors: string[];
  warnings: string[];
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  brand?: string;
  payload?: ImportProductPayload;
};

export interface NamedRef { id: string; name: string }

const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/;
const BARCODE_RE = /^[A-Za-z0-9-]{4,32}$/;

function num(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v.replace(/,/g, '').replace(/^LKR\s*/i, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validates one record. All problems on a row are reported together (not just the first).
 * `seen` tracks SKU / barcode already used earlier in the same file.
 */
export function validateImportRecord(
  rec: RawImportRow,
  refs: { categories: NamedRef[]; brands: NamedRef[] },
  seen: { sku: Map<string, number>; barcode: Map<string, number> },
): ImportRowResult {
  const o = rec.cells;
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = (o.name ?? '').trim();
  if (!name) errors.push('name is empty');
  else if (name.length > 200) errors.push('name is longer than 200 characters');

  const sellingPrice = num(o.sellingprice);
  const costPrice = num(o.costprice);
  if (sellingPrice === undefined || Number.isNaN(sellingPrice) || sellingPrice < 0) errors.push('sellingPrice must be a number ≥ 0');
  if (costPrice === undefined || Number.isNaN(costPrice) || costPrice < 0) errors.push('costPrice must be a number ≥ 0');
  const mrpRaw = num(o.mrp);
  const mrp = mrpRaw ?? sellingPrice ?? 0;
  if (Number.isNaN(mrp) || mrp < 0) errors.push('mrp must be a number ≥ 0');
  else if (mrpRaw !== undefined && sellingPrice !== undefined && !Number.isNaN(sellingPrice) && sellingPrice > mrp + 0.0001) {
    errors.push('sellingPrice must not be higher than mrp');
  }
  if (costPrice !== undefined && sellingPrice !== undefined && !Number.isNaN(costPrice) && !Number.isNaN(sellingPrice) && costPrice > sellingPrice) {
    warnings.push('costPrice is higher than sellingPrice (sold at a loss)');
  }
  const taxRate = num(o.taxrate) ?? 18;
  if (Number.isNaN(taxRate) || taxRate < 0 || taxRate > 100) errors.push('taxRate must be between 0 and 100');
  const openingStock = num(o.openingstock) ?? 0;
  if (Number.isNaN(openingStock) || openingStock < 0) errors.push('openingStock must be a number ≥ 0');
  const reorderLevel = num(o.reorderlevel);
  if (reorderLevel !== undefined && (Number.isNaN(reorderLevel) || !Number.isInteger(reorderLevel) || reorderLevel < 0)) {
    errors.push('reorderLevel must be a whole number ≥ 0');
  }
  const statusRaw = (o.status || 'DRAFT').toUpperCase();
  if (statusRaw !== 'ACTIVE' && statusRaw !== 'DRAFT') errors.push('status must be ACTIVE or DRAFT');

  const sku = (o.sku ?? '').trim();
  if (sku) {
    if (!SKU_RE.test(sku)) errors.push('sku may use letters, numbers and . _ - / only (max 64)');
    const k = sku.toLowerCase();
    if (seen.sku.has(k)) errors.push(`sku "${sku}" is repeated (also on line ${seen.sku.get(k)})`);
    else seen.sku.set(k, rec.line);
  }
  const barcode = (o.barcode ?? '').trim();
  if (barcode) {
    if (!BARCODE_RE.test(barcode)) errors.push('barcode must be 4–32 letters / numbers');
    const k = barcode.toLowerCase();
    if (seen.barcode.has(k)) errors.push(`barcode "${barcode}" is repeated (also on line ${seen.barcode.get(k)})`);
    else seen.barcode.set(k, rec.line);
  }

  const byName = (list: NamedRef[], v: string) => list.find((x) => x.name.trim().toLowerCase() === v.toLowerCase())?.id;
  let categoryId: string | undefined;
  if (o.category) {
    categoryId = byName(refs.categories, o.category);
    if (!categoryId) errors.push(`category "${o.category}" not found. Create it first or leave empty`);
  }
  let brandId: string | undefined;
  if (o.brand) {
    brandId = byName(refs.brands, o.brand);
    if (!brandId) errors.push(`brand "${o.brand}" not found. Create it first or leave empty`);
  }
  const description = (o.description ?? '').trim();
  if (description.length > 2000) errors.push('description is longer than 2000 characters');
  const unit = (o.unit ?? '').trim();
  if (unit.length > 20) errors.push('unit is longer than 20 characters');
  for (const f of FORMULA_CHECKED_FIELDS) {
    if (looksLikeFormula(o[f])) {
      warnings.push(`${f} starts with "${o[f]!.charAt(0)}" and looks like a spreadsheet formula. It is saved as plain text; check it is intended.`);
    }
  }

  const base = { line: rec.line, name, sku: sku || undefined, barcode: barcode || undefined, category: o.category || undefined, brand: o.brand || undefined, warnings };
  if (errors.length) return { ...base, status: 'ERROR', errors };
  return {
    ...base,
    status: 'OK',
    errors: [],
    payload: {
      name,
      sku: sku || undefined,
      barcode: barcode || undefined,
      categoryId,
      brandId,
      unit: unit || undefined,
      sellingPrice: sellingPrice!,
      costPrice: costPrice!,
      mrp,
      taxRate,
      description: description || undefined,
      tags: o.tags ? o.tags.split('|').map((t) => t.trim()).filter(Boolean).slice(0, 30) : [],
      status: statusRaw as 'ACTIVE' | 'DRAFT',
      trackInventory: true,
      openingStock,
      reorderLevel,
    },
  };
}

/**
 * Marks rows that already exist in the shop as DUPLICATE (never imported twice):
 * same SKU or barcode as an existing product / variant, or — when the row has neither —
 * the same product name.
 */
export function markExistingDuplicates(
  results: ImportRowResult[],
  existing: { skus: Set<string>; barcodes: Set<string>; names: Set<string> },
): ImportRowResult[] {
  return results.map((r) => {
    if (r.status !== 'OK') return r;
    const reasons: string[] = [];
    if (r.sku && existing.skus.has(r.sku.toLowerCase())) reasons.push(`SKU ${r.sku} already exists`);
    if (r.barcode && existing.barcodes.has(r.barcode.toLowerCase())) reasons.push(`barcode ${r.barcode} already exists`);
    if (!r.sku && !r.barcode && existing.names.has(r.name.toLowerCase())) reasons.push('a product with this name already exists (add a SKU or barcode if it is a different product)');
    return reasons.length ? { ...r, status: 'DUPLICATE', errors: reasons, payload: undefined } : r;
  });
}

export function summarizeImport(results: ImportRowResult[]) {
  return {
    totalRows: results.length,
    valid: results.filter((r) => r.status === 'OK').length,
    errors: results.filter((r) => r.status === 'ERROR').length,
    duplicates: results.filter((r) => r.status === 'DUPLICATE').length,
  };
}
