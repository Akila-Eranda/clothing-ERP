import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

// Keep the heavy Nest modules out of this unit test: only the class tokens are needed.
jest.mock('@/modules/inventory/inventory.module', () => ({ InventoryService: class InventoryService {} }));
jest.mock('@/modules/audit-log/audit-log.module', () => ({ AuditLogService: class AuditLogService {} }));
jest.mock('@/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('./products.service', () => ({ ProductsService: class ProductsService {} }));

import { ProductImportService } from './product-import.service';
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from './product-import.helper';

const T = 'tenant-1';
const USER = { id: 'u1', branchId: 'b1' };

type Row = { tenantId: string; id: string; name: string; sku: string | null; barcode: string | null };
const lc = (x: string) => x.toLowerCase();

/** In-memory fake of the Prisma calls the import makes, plus ProductsService / InventoryService / AuditLogService. */
function setup() {
  const db = { products: [] as Row[], variants: [] as (Row & { productTenantId: string })[] };
  const matchSkuBarcode = (where: { OR: [{ sku: { in: string[] } }, { barcode: { in: string[] } }] }, x: { sku: string | null; barcode: string | null }) => {
    const skus = where.OR[0].sku.in.map(lc);
    const barcodes = where.OR[1].barcode.in.map(lc);
    return (!!x.sku && skus.includes(lc(x.sku))) || (!!x.barcode && barcodes.includes(lc(x.barcode)));
  };
  const prisma = {
    category: { findMany: jest.fn(async ({ where }: { where: { tenantId: string } }) => (where.tenantId === T ? [{ id: 'c1', name: 'Rice' }] : [])) },
    brand: { findMany: jest.fn(async ({ where }: { where: { tenantId: string } }) => (where.tenantId === T ? [{ id: 'br1', name: 'Araliya' }] : [])) },
    product: {
      findMany: jest.fn(async ({ where }: { where: { tenantId: string; OR: [{ sku: { in: string[] } }, { barcode: { in: string[] } }] } }) =>
        db.products.filter((p) => p.tenantId === where.tenantId && matchSkuBarcode(where, p)).map(({ sku, barcode }) => ({ sku, barcode }))),
    },
    productVariant: {
      findMany: jest.fn(async ({ where }: { where: { product: { tenantId: string }; OR: [{ sku: { in: string[] } }, { barcode: { in: string[] } }] } }) =>
        db.variants.filter((v) => v.productTenantId === where.product.tenantId && matchSkuBarcode(where, v)).map(({ sku, barcode }) => ({ sku, barcode }))),
    },
    $queryRaw: jest.fn(async (_sql: TemplateStringsArray, tenantId: string, names: string[]) =>
      db.products.filter((p) => p.tenantId === tenantId && names.includes(lc(p.name))).map((p) => ({ n: lc(p.name) }))),
  };
  const products = {
    create: jest.fn(async (tenantId: string, dto: { name: string; sku?: string; barcode?: string }) => {
      const id = `p${db.products.length + 1}`;
      db.products.push({ tenantId, id, name: dto.name, sku: dto.sku ?? `PRD-${id}`, barcode: dto.barcode ?? null });
      return { id, variants: [{ id: `v-${id}` }] };
    }),
  };
  const inventory = { adjustStock: jest.fn(async () => ({})) };
  const audit = { log: jest.fn(async () => undefined) };
  const svc = new ProductImportService(prisma as never, products as never, audit as never, inventory as never);
  return { db, prisma, products, inventory, audit, svc };
}

const csvFile = (text: string, originalname = 'p.csv', mimetype = 'text/csv') =>
  ({ buffer: Buffer.from(text, 'utf8'), originalname, mimetype, size: text.length }) as Express.Multer.File;
const binFile = (buffer: Buffer, originalname: string, mimetype = 'application/octet-stream') =>
  ({ buffer, originalname, mimetype, size: buffer.length }) as Express.Multer.File;

async function xlsxBuffer(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const row = (line: number, cells: Record<string, string>) => ({ line, cells });
const ok = (over: Record<string, string> = {}) => ({ name: 'Rice 1kg', sellingprice: '100', costprice: '80', ...over });

describe('ProductImportService', () => {
  describe('readFile: type detection and limits', () => {
    it('rejects an empty upload', async () => {
      await expect(setup().svc.readFile(csvFile(''))).rejects.toThrow(/Choose an Excel/);
    });

    it('rejects files over the size limit', async () => {
      await expect(setup().svc.readFile(binFile(Buffer.alloc(IMPORT_MAX_BYTES + 1, 0x41), 'big.csv', 'text/csv'))).rejects.toThrow(/larger than 5 MB/);
    });

    it('rejects old .xls files', async () => {
      await expect(setup().svc.readFile(binFile(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1]), 'old.xls', 'application/vnd.ms-excel'))).rejects.toThrow(/\.xls files are not supported/);
    });

    it('rejects a .xlsx name whose content is not a zip', async () => {
      await expect(setup().svc.readFile(csvFile('name\nA\n', 'fake.xlsx'))).rejects.toThrow(/not a valid \.xlsx/);
    });

    it('rejects a CSV that contains NUL bytes (binary)', async () => {
      await expect(setup().svc.readFile(binFile(Buffer.from('name\n\0A\n'), 'p.csv', 'text/csv'))).rejects.toThrow(/not a text CSV/);
    });

    it('rejects other file types', async () => {
      await expect(setup().svc.readFile(binFile(Buffer.from('xx'), 'photo.png', 'image/png'))).rejects.toThrow(/Only \.xlsx and \.csv/);
    });

    it('reads a CSV with its real row numbers (blank lines counted)', async () => {
      const rows = await setup().svc.readFile(csvFile('name\r\n\r\nA\r\n'));
      expect(rows.filter((r) => r.cells.some((c) => c))).toEqual([{ line: 1, cells: ['name'] }, { line: 3, cells: ['A'] }]);
    });

    it('decides by content: an .xlsx saved with a .csv name is read as Excel', async () => {
      const buf = await xlsxBuffer((wb) => { const ws = wb.addWorksheet('Products'); ws.addRow(['name']); ws.addRow(['A']); });
      expect(await setup().svc.readFile(binFile(buf, 'products.csv', 'text/csv'))).toEqual([{ line: 1, cells: ['name'] }, { line: 2, cells: ['A'] }]);
    });

    it('a corrupt zip is reported as an unreadable Excel file', async () => {
      const buf = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('not really a zip')]);
      await expect(setup().svc.readFile(binFile(buf, 'p.xlsx'))).rejects.toThrow(/Could not read the Excel file/);
    });
  });

  describe('readFile: Excel parsing', () => {
    it('uses formula results, keeps real Excel row numbers across empty rows', async () => {
      const buf = await xlsxBuffer((wb) => {
        wb.addWorksheet('Instructions').addRow(['ignore me']);
        const ws = wb.addWorksheet('Products');
        ws.getCell('A1').value = 'name'; ws.getCell('B1').value = 'sellingPrice';
        ws.getCell('A2').value = 'Rice'; ws.getCell('B2').value = 100;
        ws.getCell('A5').value = 'Soap'; ws.getCell('B5').value = { formula: 'B2*2', result: 200 } as ExcelJS.CellFormulaValue;
      });
      const rows = await setup().svc.readFile(binFile(buf, 'p.xlsx'));
      expect(rows).toEqual([
        { line: 1, cells: ['name', 'sellingPrice'] },
        { line: 2, cells: ['Rice', '100'] },
        { line: 5, cells: ['Soap', '200'] },
      ]);
    });

    it('preview reports the Excel row number of a bad row after empty rows', async () => {
      const buf = await xlsxBuffer((wb) => {
        const ws = wb.addWorksheet('Products');
        const put = (n: number, vals: (string | number)[]) => vals.forEach((v, i) => { ws.getRow(n).getCell(i + 1).value = v; });
        put(1, ['name', 'sellingPrice', 'costPrice']);
        put(2, ['Rice', 100, 80]);
        put(9, ['Bad', 'abc', 80]);
      });
      const p = await setup().svc.preview(T, binFile(buf, 'p.xlsx'));
      expect(p.rows.map((r) => [r.line, r.status])).toEqual([[2, 'OK'], [9, 'ERROR']]);
    });

    it('picks the "Products" sheet, else the first visible data sheet', async () => {
      const buf = await xlsxBuffer((wb) => {
        wb.addWorksheet('Instructions').addRow(['x']);
        wb.addWorksheet('Hidden', { state: 'hidden' }).addRow(['hidden']);
        wb.addWorksheet('Lists').addRow(['y']);
        const ws = wb.addWorksheet('My data'); ws.addRow(['name']); ws.addRow(['A']);
      });
      expect((await setup().svc.readFile(binFile(buf, 'p.xlsx'))).map((r) => r.cells[0])).toEqual(['name', 'A']);
    });

    it(`rejects a sheet with more than ${IMPORT_MAX_ROWS} data rows`, async () => {
      const buf = await xlsxBuffer((wb) => {
        const ws = wb.addWorksheet('Products');
        ws.addRow(['name']);
        for (let i = 0; i <= IMPORT_MAX_ROWS; i++) ws.addRow([`P${i}`]);
      });
      await expect(setup().svc.readFile(binFile(buf, 'p.xlsx'))).rejects.toThrow(/Too many rows/);
    });
  });

  describe('preview', () => {
    it('validates the file and writes nothing', async () => {
      const s = setup();
      s.db.products.push({ tenantId: T, id: 'old', name: 'Old', sku: 'OLD-1', barcode: null });
      const p = await s.svc.preview(T, csvFile('name,sellingPrice,costPrice,sku,description\nA,10,5,NEW-1,\nB,x,5,,\nC,10,5,OLD-1,\n\nD,10,5,NEW-2,=HYPERLINK("x")\n'));
      expect(p).toMatchObject({ totalRows: 4, valid: 2, errors: 1, duplicates: 1, commitChunkSize: 200 });
      expect(p.rows.map((r) => [r.line, r.status])).toEqual([[2, 'OK'], [3, 'ERROR'], [4, 'DUPLICATE'], [6, 'OK']]);
      expect(p.rows[3].warnings[0]).toMatch(/description starts with "="/);
      expect(p.rows[0].cells).toEqual({ name: 'A', sellingprice: '10', costprice: '5', sku: 'NEW-1', description: '' });
      expect(p.rows[1].cells).toBeUndefined();
      expect(p.rows.every((r) => !('payload' in r))).toBe(true);
      expect(s.products.create).not.toHaveBeenCalled();
      expect(s.inventory.adjustStock).not.toHaveBeenCalled();
      expect(s.audit.log).not.toHaveBeenCalled();
    });

    it('header problems and header-only files are rejected', async () => {
      await expect(setup().svc.preview(T, csvFile('price\n1\n'))).rejects.toThrow(/Missing the "name" column/);
      await expect(setup().svc.preview(T, csvFile('name\n\n'))).rejects.toThrow(/no products/);
    });
  });

  describe('commit', () => {
    it('creates with zero stock, then records opening stock through the stock ledger', async () => {
      const s = setup();
      const res = await s.svc.commit(T, USER, { rows: [row(2, ok({ openingstock: '5', sku: 'R-1' }))] });
      expect(res).toMatchObject({ created: 1, skipped: 0, errors: 0 });
      expect(res.rows[0]).toEqual({ line: 2, name: 'Rice 1kg', status: 'CREATED', productId: 'p1' });
      expect(s.products.create).toHaveBeenCalledWith(T, expect.objectContaining({ openingStock: 0, branchScope: 'SINGLE', branchId: 'b1', sku: 'R-1' }));
      expect(s.inventory.adjustStock).toHaveBeenCalledWith(T, 'b1', 'u1', expect.objectContaining({
        variantId: 'v-p1', quantity: 5, movementType: 'OPENING_STOCK', unitCost: 80, referenceType: 'PRODUCT_IMPORT', referenceId: 'p1', clientRequestId: 'import-p1',
      }));
    });

    it('validates every row again (the preview is never trusted)', async () => {
      const s = setup();
      const res = await s.svc.commit(T, USER, { rows: [row(2, ok({ sellingprice: '-1' })), row(3, ok({ category: 'Nope' })), row(4, ok({ sellingprice: '200', mrp: '150' }))] });
      expect(res.rows.map((r) => r.status)).toEqual(['ERROR', 'ERROR', 'ERROR']);
      expect(res.rows[1].message).toMatch(/category "Nope" not found/);
      expect(s.products.create).not.toHaveBeenCalled();
    });

    it('strips unknown cell keys and caps cell length', async () => {
      const s = setup();
      const cells = { ...ok(), tenantid: 'other-tenant', branchid: 'x', evil: 'y', description: 'd'.repeat(2500) } as Record<string, string>;
      const res = await s.svc.commit(T, USER, { rows: [row(2, cells)] });
      expect(res.rows[0].status).toBe('CREATED');
      const dto = s.products.create.mock.calls[0][1] as unknown as Record<string, unknown>;
      expect(dto).not.toHaveProperty('tenantid');
      expect(dto).not.toHaveProperty('evil');
      expect(dto.branchId).toBe('b1');
      expect((dto.description as string).length).toBe(2000);
      expect(s.products.create.mock.calls[0][0]).toBe(T);
    });

    it('skips rows that already exist (SKU, barcode, or name without SKU / barcode)', async () => {
      const s = setup();
      s.db.products.push({ tenantId: T, id: 'a', name: 'Existing', sku: 'OLD-1', barcode: '4790001' });
      const res = await s.svc.commit(T, USER, { rows: [row(2, ok({ sku: 'old-1' })), row(3, ok({ barcode: '4790001' })), row(4, ok({ name: 'existing' })), row(5, ok({ name: 'New' }))] });
      expect(res.rows.map((r) => r.status)).toEqual(['SKIPPED', 'SKIPPED', 'SKIPPED', 'CREATED']);
      expect(s.products.create).toHaveBeenCalledTimes(1);
    });

    it('another tenant\'s products never count as duplicates', async () => {
      const s = setup();
      s.db.products.push({ tenantId: 'other', id: 'x', name: 'Rice 1kg', sku: 'R-1', barcode: null });
      const res = await s.svc.commit(T, USER, { rows: [row(2, ok({ sku: 'R-1' }))] });
      expect(res.rows[0].status).toBe('CREATED');
    });

    it('product created but opening stock failed: reported on the row, import continues', async () => {
      const s = setup();
      s.inventory.adjustStock.mockRejectedValueOnce(new Error('No inventory row'));
      const res = await s.svc.commit(T, USER, { rows: [row(2, ok({ openingstock: '3' })), row(3, ok({ name: 'Second', openingstock: '2' }))] });
      expect(res.rows[0]).toMatchObject({ status: 'CREATED', productId: 'p1', message: expect.stringMatching(/opening stock failed: No inventory row/) });
      expect(res.rows[1]).toMatchObject({ status: 'CREATED', productId: 'p2' });
      expect(res.rows[1].message).toBeUndefined();
      expect(res.created).toBe(2);
    });

    it('product created without a variant: opening stock not recorded, row says so', async () => {
      const s = setup();
      s.products.create.mockResolvedValueOnce({ id: 'p9', variants: [] });
      const res = await s.svc.commit(T, USER, { rows: [row(2, ok({ openingstock: '3' }))] });
      expect(res.rows[0]).toMatchObject({ status: 'CREATED', message: expect.stringMatching(/opening stock was not recorded/) });
      expect(s.inventory.adjustStock).not.toHaveBeenCalled();
    });

    it('other create errors fail only that row', async () => {
      const s = setup();
      s.products.create.mockRejectedValueOnce(new BadRequestException('Product limit reached (10). Upgrade your plan.'));
      const res = await s.svc.commit(T, USER, { rows: [row(2, ok()), row(3, ok({ name: 'Other' }))] });
      expect(res.rows.map((r) => r.status)).toEqual(['ERROR', 'CREATED']);
      expect(res.rows[0].message).toMatch(/Product limit/);
    });

    it('"SKU already exists" from product creation is a skip, not a failure', async () => {
      const s = setup();
      s.products.create.mockRejectedValueOnce(new BadRequestException('SKU already exists: R-1'));
      const res = await s.svc.commit(T, USER, { rows: [row(2, ok({ sku: 'R-1' }))] });
      expect(res.rows[0]).toMatchObject({ status: 'SKIPPED', message: 'SKU already exists: R-1' });
    });

    it('writes one audit entry per chunk with the counts and line range', async () => {
      const s = setup();
      await s.svc.commit(T, USER, { rows: [row(2, ok({ sku: 'A-1' })), row(3, ok({ sellingprice: 'x' }))] });
      await s.svc.commit(T, USER, { rows: [row(4, ok({ sku: 'A-1' })), row(5, ok({ sku: 'B-1' }))] });
      expect(s.audit.log).toHaveBeenCalledTimes(2);
      expect(s.audit.log).toHaveBeenNthCalledWith(1, { tenantId: T, userId: 'u1', action: 'IMPORT', resource: 'products', newData: { rows: 2, created: 1, skipped: 0, errors: 1, lines: [2, 3] } });
      expect(s.audit.log).toHaveBeenNthCalledWith(2, { tenantId: T, userId: 'u1', action: 'IMPORT', resource: 'products', newData: { rows: 2, created: 1, skipped: 1, errors: 0, lines: [4, 5] } });
    });

    it('CURRENT BEHAVIOUR (open decision): a user without a branch creates an all-branch product and opening stock is sent with an empty branch id', async () => {
      const s = setup();
      const res = await s.svc.commit(T, { id: 'u1', branchId: null }, { rows: [row(2, ok({ openingstock: '4' }))] });
      expect(res.rows[0].status).toBe('CREATED');
      const dto = s.products.create.mock.calls[0][1] as unknown as Record<string, unknown>;
      expect(dto).not.toHaveProperty('branchScope');
      expect(dto).not.toHaveProperty('branchId');
      expect(s.inventory.adjustStock).toHaveBeenCalledWith(T, '', 'u1', expect.objectContaining({ quantity: 4 }));
    });

    describe('retry safety', () => {
      it('re-sending the same chunk creates nothing twice and adds no second opening stock', async () => {
        const s = setup();
        const chunk = { rows: [row(2, ok({ sku: 'R-1', openingstock: '5' })), row(3, ok({ name: 'Dhal', barcode: '4790002', openingstock: '1' })), row(4, ok({ name: 'Salt', openingstock: '2' }))] };
        const first = await s.svc.commit(T, USER, chunk);
        const second = await s.svc.commit(T, USER, chunk);
        expect(first.created).toBe(3);
        expect(second).toMatchObject({ created: 0, skipped: 3, errors: 0 });
        expect(s.products.create).toHaveBeenCalledTimes(3);
        expect(s.inventory.adjustStock).toHaveBeenCalledTimes(3);
        expect(s.db.products).toHaveLength(3);
      });

      it('a product created by a concurrent import after validation is caught by the re-check before create', async () => {
        const s = setup();
        s.db.products.push({ tenantId: T, id: 'rival', name: 'Rice 1kg', sku: 'R-1', barcode: null });
        // The chunk-level validation ran before the rival import committed.
        s.prisma.product.findMany.mockImplementationOnce(async () => []);
        const res = await s.svc.commit(T, USER, { rows: [row(2, ok({ sku: 'R-1', openingstock: '5' }))] });
        expect(res.rows[0]).toMatchObject({ status: 'SKIPPED', message: 'SKU R-1 already exists' });
        expect(s.products.create).not.toHaveBeenCalled();
        expect(s.inventory.adjustStock).not.toHaveBeenCalled();
      });

      it('a unique violation (P2002) from a race on create is "duplicate, skipped", with no opening stock', async () => {
        const s = setup();
        s.products.create.mockImplementationOnce(async () => {
          s.db.products.push({ tenantId: T, id: 'rival', name: 'Rice 1kg', sku: 'R-1', barcode: null });
          throw Object.assign(new Error('Unique constraint failed on the fields: (`tenantId`,`sku`)'), { code: 'P2002' });
        });
        const res = await s.svc.commit(T, USER, { rows: [row(2, ok({ sku: 'R-1', openingstock: '5' })), row(3, ok({ name: 'Next' }))] });
        expect(res.rows[0]).toMatchObject({ status: 'SKIPPED', message: expect.stringMatching(/SKU R-1 already exists \(created by another import at the same time\)/) });
        expect(res.rows[1].status).toBe('CREATED');
        expect(res).toMatchObject({ created: 1, skipped: 1, errors: 0 });
        expect(s.inventory.adjustStock).not.toHaveBeenCalled();
      });

      it('a P2002 that is not explained by an existing product stays an error (retryable)', async () => {
        const s = setup();
        s.products.create.mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
        const res = await s.svc.commit(T, USER, { rows: [row(2, ok())] });
        expect(res.rows[0]).toMatchObject({ status: 'ERROR', message: expect.stringMatching(/Import this file again/) });
      });
    });

    it('scopes every lookup and write to the tenant', async () => {
      const s = setup();
      await s.svc.preview(T, csvFile('name,sellingPrice,costPrice,sku\nA,1,1,S-1\nB,1,1,\n'));
      await s.svc.commit(T, USER, { rows: [row(2, ok({ sku: 'S-1', openingstock: '1' })), row(3, ok({ name: 'B' }))] });
      await s.svc.buildTemplateXlsx(T);
      const wheres = [
        ...s.prisma.category.findMany.mock.calls, ...s.prisma.brand.findMany.mock.calls, ...s.prisma.product.findMany.mock.calls,
      ].map((c) => (c[0] as { where: { tenantId: string } }).where);
      expect(wheres.length).toBeGreaterThan(0);
      for (const w of wheres) expect(w.tenantId).toBe(T);
      expect(s.prisma.productVariant.findMany.mock.calls.length).toBeGreaterThan(0);
      for (const c of s.prisma.productVariant.findMany.mock.calls) expect(c[0].where.product.tenantId).toBe(T);
      expect(s.prisma.$queryRaw.mock.calls.length).toBeGreaterThan(0);
      for (const c of s.prisma.$queryRaw.mock.calls) {
        expect(c[0].join('?')).toMatch(/WHERE "tenantId" = \?/);
        expect(c[1]).toBe(T);
      }
      for (const c of s.products.create.mock.calls) expect(c[0]).toBe(T);
      for (const c of s.inventory.adjustStock.mock.calls as unknown[][]) expect(c[0]).toBe(T);
      for (const c of s.audit.log.mock.calls as unknown[][]) expect((c[0] as { tenantId: string }).tenantId).toBe(T);
    });
  });

  describe('Excel template', () => {
    it('writes shop names that look like formulas as plain text cells, unchanged', async () => {
      const s = setup();
      const evil = '=HYPERLINK("http://evil.example","click")';
      s.prisma.category.findMany.mockResolvedValueOnce([{ id: 'c1', name: evil }]);
      s.prisma.brand.findMany.mockResolvedValueOnce([{ id: 'b1', name: '@cmd' }]);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await s.svc.buildTemplateXlsx(T)) as unknown as ArrayBuffer);
      const lists = wb.getWorksheet('Lists')!;
      expect(lists.getCell('A2').type).toBe(ExcelJS.ValueType.String);
      expect(lists.getCell('A2').value).toBe(evil);
      expect(lists.getCell('B2').value).toBe('@cmd');
      const products = wb.getWorksheet('Products')!;
      const catCol = (products.getRow(1).values as unknown[]).indexOf('category');
      expect(products.getRow(2).getCell(catCol).type).toBe(ExcelJS.ValueType.String);
      expect(products.getRow(2).getCell(catCol).value).toBe(evil);
      wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => expect(c.type).not.toBe(ExcelJS.ValueType.Formula))));
      // Read back through the importer, the example row still resolves the category by its exact name.
      const rows = await s.svc.readFile(binFile(Buffer.from(await wb.xlsx.writeBuffer()), 't.xlsx'));
      expect(rows[1].cells[catCol - 1]).toBe(evil);
    });
  });
});
