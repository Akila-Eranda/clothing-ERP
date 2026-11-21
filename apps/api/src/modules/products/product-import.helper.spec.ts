import {
  IMPORT_MAX_ROWS, looksLikeFormula, markExistingDuplicates, normalizeHeader, parseCsv, parseCsvRows, rowsToRecords, summarizeImport,
  validateImportRecord,
} from './product-import.helper';

const refs = { categories: [{ id: 'c1', name: 'Rice' }], brands: [{ id: 'b1', name: 'Araliya' }] };
const fresh = () => ({ sku: new Map<string, number>(), barcode: new Map<string, number>() });
const rec = (cells: Record<string, string>, line = 2) => ({ line, cells });

describe('product-import.helper', () => {
  it('accepts the ORIGINAL CSV template unchanged (header only + rows)', () => {
    const rows = parseCsv('name,sellingPrice,costPrice,mrp,taxRate,description,tags,status\r\nSamba 5kg,1450,1300,1500,0,"Rice, white",rice|staples,ACTIVE\r\n');
    const { headerError, records } = rowsToRecords(rows);
    expect(headerError).toBeUndefined();
    const r = validateImportRecord(records[0], refs, fresh());
    expect(r.status).toBe('OK');
    expect(r.payload).toMatchObject({ name: 'Samba 5kg', sellingPrice: 1450, costPrice: 1300, mrp: 1500, taxRate: 0, description: 'Rice, white', tags: ['rice', 'staples'], status: 'ACTIVE', openingStock: 0 });
  });

  it('normalises headers and common aliases', () => {
    expect(normalizeHeader(' Selling Price ')).toBe('sellingprice');
    expect(normalizeHeader('selling_price')).toBe('sellingprice');
    expect(normalizeHeader('Product Name')).toBe('name');
    expect(normalizeHeader('Cost')).toBe('costprice');
    expect(normalizeHeader('﻿name')).toBe('name');
  });

  it('reports every problem on a row with its line number', () => {
    const r = validateImportRecord(rec({ name: '', sellingprice: 'abc', costprice: '-1', taxrate: '150', status: 'LIVE', sku: 'bad sku!', barcode: '12', category: 'Nope' }, 7), refs, fresh());
    expect(r.status).toBe('ERROR');
    expect(r.line).toBe(7);
    expect(r.errors).toEqual(expect.arrayContaining([
      'name is empty', 'sellingPrice must be a number ≥ 0', 'costPrice must be a number ≥ 0', 'taxRate must be between 0 and 100',
      'status must be ACTIVE or DRAFT', expect.stringMatching(/^sku may use/), expect.stringMatching(/^barcode must be/), expect.stringMatching(/category "Nope" not found/),
    ]));
  });

  it('price above MRP is an error; cost above price is only a warning', () => {
    expect(validateImportRecord(rec({ name: 'A', sellingprice: '200', costprice: '100', mrp: '150' }), refs, fresh()).errors).toContain('sellingPrice must not be higher than mrp');
    const w = validateImportRecord(rec({ name: 'A', sellingprice: '100', costprice: '120' }), refs, fresh());
    expect(w.status).toBe('OK');
    expect(w.warnings[0]).toMatch(/loss/);
  });

  it('resolves category and brand by name (case-insensitive)', () => {
    const r = validateImportRecord(rec({ name: 'A', sellingprice: '1', costprice: '1', category: 'rice', brand: 'ARALIYA' }), refs, fresh());
    expect(r.payload).toMatchObject({ categoryId: 'c1', brandId: 'b1' });
  });

  it('flags SKU and barcode repeated inside the file', () => {
    const seen = fresh();
    validateImportRecord(rec({ name: 'A', sellingprice: '1', costprice: '1', sku: 'X-1', barcode: '4790001' }, 2), refs, seen);
    const dup = validateImportRecord(rec({ name: 'B', sellingprice: '1', costprice: '1', sku: 'x-1', barcode: '4790001' }, 9), refs, seen);
    expect(dup.errors).toEqual(['sku "x-1" is repeated (also on line 2)', 'barcode "4790001" is repeated (also on line 2)']);
  });

  it('marks rows that already exist in the shop as DUPLICATE (by SKU / barcode, else by name)', () => {
    const ok = (over: Record<string, string>, line: number) => validateImportRecord(rec({ sellingprice: '1', costprice: '1', ...over }, line), refs, fresh());
    const res = markExistingDuplicates(
      [ok({ name: 'A', sku: 'OLD-1' }, 2), ok({ name: 'B', barcode: '4790009' }, 3), ok({ name: 'Existing Name' }, 4), ok({ name: 'Existing Name', sku: 'NEW-9' }, 5), ok({ name: 'New' }, 6)],
      { skus: new Set(['old-1']), barcodes: new Set(['4790009']), names: new Set(['existing name']) },
    );
    expect(res.map((r) => r.status)).toEqual(['DUPLICATE', 'DUPLICATE', 'DUPLICATE', 'OK', 'OK']);
    expect(res[0].payload).toBeUndefined();
    expect(summarizeImport(res)).toEqual({ totalRows: 5, valid: 2, errors: 0, duplicates: 3 });
  });

  it('rejects a file without a name column, and too many rows', () => {
    expect(rowsToRecords([['price', 'cost']]).headerError).toMatch(/name/);
    const big = [['name'], ...Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => [`P${i}`])];
    expect(rowsToRecords(big).headerError).toMatch(/Too many rows/);
  });

  it('skips blank lines and keeps spreadsheet line numbers', () => {
    const { records } = rowsToRecords([['name', 'sellingPrice'], ['', ''], ['A', '1']]);
    expect(records).toEqual([{ line: 3, cells: { name: 'A', sellingprice: '1' } }]);
  });

  describe('CSV line numbers survive blank lines (end to end parseCsvRows → rowsToRecords)', () => {
    const lines = (text: string) => rowsToRecords(parseCsvRows(text)).records.map((r) => [r.line, r.cells.name]);

    it('blank lines between rows (LF)', () => {
      expect(lines('name,sellingPrice\n\nA,1\n\n\nB,2\n')).toEqual([[3, 'A'], [6, 'B']]);
    });

    it('CRLF, BOM and whitespace-only lines', () => {
      expect(lines('﻿name,sellingPrice\r\n \r\nA,1\r\n,\r\nB,2\r\n')).toEqual([[3, 'A'], [5, 'B']]);
    });

    it('a quoted cell with a line break / comma stays one row (as Excel shows it)', () => {
      const text = 'name,description\r\n"Rice, red","line 1\r\nline 2"\r\n\r\nSoap,"a ""quoted"" word"\r\n';
      const { records } = rowsToRecords(parseCsvRows(text));
      expect(records).toEqual([
        { line: 2, cells: { name: 'Rice, red', description: 'line 1\r\nline 2' } },
        { line: 4, cells: { name: 'Soap', description: 'a "quoted" word' } },
      ]);
    });

    it('blank lines before the header are skipped and still counted', () => {
      expect(lines('\n\nname\nA\n')).toEqual([[4, 'A']]);
    });

    it('the validation error carries the real line', () => {
      const { records } = rowsToRecords(parseCsvRows('name,sellingPrice,costPrice\n\n\nBad,x,1\n'));
      const r = validateImportRecord(records[0], refs, fresh());
      expect(r.status).toBe('ERROR');
      expect(r.line).toBe(4);
    });

    it('numbered rows keep their own numbers (Excel row numbers)', () => {
      const { records } = rowsToRecords([{ line: 1, cells: ['name'] }, { line: 7, cells: ['A'] }, { line: 12, cells: ['B'] }]);
      expect(records.map((r) => r.line)).toEqual([7, 12]);
    });

    it('parseCsv (cells only) still drops blank lines', () => {
      expect(parseCsv('a,b\r\n\r\n"x\ny",2\n')).toEqual([['a', 'b'], ['x\ny', '2']]);
    });

    it('a file with only blank lines is empty', () => {
      expect(rowsToRecords(parseCsvRows('\r\n\r\n')).headerError).toMatch(/empty/);
    });
  });

  describe('values and limits', () => {
    const base = { name: 'A', sellingprice: '1', costprice: '1' };

    it('accepts LKR prefixes and thousands separators in numbers', () => {
      const r = validateImportRecord(rec({ ...base, sellingprice: 'LKR 1,450.50', costprice: 'lkr1,200', mrp: '1,500', openingstock: '1,000' }), refs, fresh());
      expect(r.status).toBe('OK');
      expect(r.payload).toMatchObject({ sellingPrice: 1450.5, costPrice: 1200, mrp: 1500, openingStock: 1000 });
    });

    it('name: 200 characters is fine, 201 is an error', () => {
      expect(validateImportRecord(rec({ ...base, name: 'x'.repeat(200) }), refs, fresh()).status).toBe('OK');
      expect(validateImportRecord(rec({ ...base, name: 'x'.repeat(201) }), refs, fresh()).errors).toContain('name is longer than 200 characters');
    });

    it('keeps at most 30 tags and drops empty ones', () => {
      const tags = Array.from({ length: 35 }, (_, i) => `t${i}`).join('| |');
      const r = validateImportRecord(rec({ ...base, tags }), refs, fresh());
      expect(r.payload!.tags).toHaveLength(30);
      expect(r.payload!.tags[0]).toBe('t0');
      expect(r.payload!.tags).not.toContain('');
    });
  });

  describe('formula-like text (CSV / formula injection) is a warning, value unchanged', () => {
    const base = { name: 'A', sellingprice: '1', costprice: '1' };

    it('looksLikeFormula', () => {
      for (const v of ['=1+1', '@SUM(A1)', '+cmd', '-2+3', '-abc', '\t=1', '=HYPERLINK("http://x","y")']) expect(looksLikeFormula(v)).toBe(true);
      for (const v of ['', 'Rice', '-5', '+12.50', '-1,200', '5-3', 'a=b', '-']) expect(looksLikeFormula(v)).toBe(false);
    });

    it('flags name / description as a warning; the row stays valid and the text is stored as-is', () => {
      const r = validateImportRecord(rec({ ...base, name: '=HYPERLINK("http://evil","Rice")', description: '@SUM(1)' }), refs, fresh());
      expect(r.status).toBe('OK');
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([
        expect.stringMatching(/^name starts with "=" and looks like a spreadsheet formula/),
        expect.stringMatching(/^description starts with "@"/),
      ]);
      expect(r.payload).toMatchObject({ name: '=HYPERLINK("http://evil","Rice")', description: '@SUM(1)' });
    });

    it('flags sku / barcode too (they also fail their format check)', () => {
      const r = validateImportRecord(rec({ ...base, sku: '=X', barcode: '-abcd' }), refs, fresh());
      expect(r.warnings).toEqual([expect.stringMatching(/^sku starts with "="/), expect.stringMatching(/^barcode starts with "-"/)]);
    });

    it('negative-looking numbers and normal names are not flagged', () => {
      expect(validateImportRecord(rec({ ...base, name: 'Rice -5kg', description: '-10% off' }), refs, fresh()).warnings).toEqual([expect.stringMatching(/^description/)]);
      expect(validateImportRecord(rec({ ...base, name: 'Rice', sku: 'R-1', barcode: '4790001' }), refs, fresh()).warnings).toEqual([]);
    });
  });
});
