import { BadRequestException, Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsObject, Min, ValidateNested } from 'class-validator';
import * as ExcelJS from 'exceljs';
import { StockMovementType } from '@prisma/client';
import { InventoryService } from '@/modules/inventory/inventory.module';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditLogService } from '@/modules/audit-log/audit-log.module';
import { ProductsService } from './products.service';
import {
  IMPORT_COLUMNS, IMPORT_COMMIT_CHUNK, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, ImportRowResult, markExistingDuplicates,
  parseCsvRows, RawImportRow, rowsToRecords, SheetRow, summarizeImport, validateImportRecord,
} from './product-import.helper';

/** Prisma unique-constraint violation (P2002), checked by code so it also matches across client instances. */
function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: unknown }).code === 'P2002';
}

export class ImportRowDto {
  @ApiProperty() @IsInt() @Min(1) line: number;
  @ApiProperty({ description: 'Cells keyed by normalised column name, as returned by the preview' }) @IsObject() cells: Record<string, string>;
}

export class CommitImportDto {
  @ApiProperty({ type: [ImportRowDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(IMPORT_COMMIT_CHUNK)
  @ValidateNested({ each: true }) @Type(() => ImportRowDto)
  rows: ImportRowDto[];
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIMES = new Set(['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel', 'application/octet-stream']);

@Injectable()
export class ProductImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly audit: AuditLogService,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * File → rows of strings with their real spreadsheet row numbers. The type is decided by content
   * (zip = xlsx), not only by the name.
   */
  async readFile(file: Express.Multer.File): Promise<SheetRow[]> {
    if (!file?.buffer?.length) throw new BadRequestException('Choose an Excel (.xlsx) or CSV file');
    if (file.buffer.length > IMPORT_MAX_BYTES) throw new BadRequestException('File is larger than 5 MB. Split it into smaller files.');
    const name = (file.originalname ?? '').toLowerCase();
    const isZip = file.buffer.length > 4 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b && file.buffer[2] === 0x03 && file.buffer[3] === 0x04;
    if (name.endsWith('.xls') && !isZip) throw new BadRequestException('Old Excel .xls files are not supported. Save as .xlsx or CSV.');
    if (name.endsWith('.xlsx') || file.mimetype === XLSX_MIME) {
      if (!isZip) throw new BadRequestException('This is not a valid .xlsx file');
      return this.readXlsx(file.buffer);
    }
    if (name.endsWith('.csv') || CSV_MIMES.has(file.mimetype)) {
      if (isZip) return this.readXlsx(file.buffer);
      if (file.buffer.includes(0)) throw new BadRequestException('This file is not a text CSV');
      return parseCsvRows(file.buffer.toString('utf8'));
    }
    throw new BadRequestException('Only .xlsx and .csv files can be imported');
  }

  private async readXlsx(buffer: Buffer): Promise<SheetRow[]> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Could not read the Excel file. Save it again as .xlsx and retry.');
    }
    const sheet = wb.getWorksheet('Products') ?? wb.worksheets.find((w) => w.state !== 'hidden' && w.name !== 'Instructions' && w.name !== 'Lists') ?? wb.worksheets[0];
    if (!sheet) throw new BadRequestException('The Excel file has no worksheet');
    if (sheet.actualRowCount > IMPORT_MAX_ROWS + 1) {
      throw new BadRequestException(`Too many rows (${sheet.actualRowCount - 1}). Import at most ${IMPORT_MAX_ROWS} rows per file.`);
    }
    const rows: SheetRow[] = [];
    const width = Math.min(sheet.actualColumnCount || sheet.columnCount, 60);
    // row.number is the real Excel row number, so skipped empty rows never shift the reported lines.
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];
      for (let c = 1; c <= width; c++) {
        const cell = row.getCell(c);
        const v = cell.value as unknown;
        // Plain numbers keep full precision; formulas use their computed result; everything else its text.
        if (typeof v === 'number') cells.push(String(v));
        else if (v && typeof v === 'object' && 'result' in (v as object)) cells.push(String((v as { result?: unknown }).result ?? ''));
        else cells.push((cell.text ?? '').toString());
      }
      rows.push({ line: rowNumber, cells });
    });
    return rows.filter((r) => r.cells.some((v) => v.trim() !== ''));
  }

  private async refs(tenantId: string) {
    const [categories, brands] = await Promise.all([
      this.prisma.category.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.brand.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ]);
    return { categories, brands };
  }

  /** SKUs / barcodes / names (lower-case) of this shop's existing products and variants that the rows use. */
  private async existing(tenantId: string, results: ImportRowResult[]) {
    const skus = [...new Set(results.map((r) => r.sku).filter(Boolean) as string[])];
    const barcodes = [...new Set(results.map((r) => r.barcode).filter(Boolean) as string[])];
    const names = [...new Set(results.filter((r) => !r.sku && !r.barcode && r.name).map((r) => r.name.toLowerCase()))];
    const lc = (xs: (string | null)[]) => new Set(xs.filter(Boolean).map((x) => x!.toLowerCase()));
    const [p, v, n] = await Promise.all([
      skus.length || barcodes.length
        ? this.prisma.product.findMany({
            where: { tenantId, OR: [{ sku: { in: skus, mode: 'insensitive' } }, { barcode: { in: barcodes, mode: 'insensitive' } }] },
            select: { sku: true, barcode: true },
          })
        : [],
      skus.length || barcodes.length
        ? this.prisma.productVariant.findMany({
            where: { product: { tenantId }, OR: [{ sku: { in: skus, mode: 'insensitive' } }, { barcode: { in: barcodes, mode: 'insensitive' } }] },
            select: { sku: true, barcode: true },
          })
        : [],
      names.length
        ? this.prisma.$queryRaw<{ n: string }[]>`SELECT lower("name") AS n FROM "products" WHERE "tenantId" = ${tenantId} AND lower("name") = ANY(${names}::text[])`
        : [],
    ]);
    return {
      skus: lc([...p.map((x) => x.sku), ...v.map((x) => x.sku)]),
      barcodes: lc([...p.map((x) => x.barcode), ...v.map((x) => x.barcode)]),
      names: new Set(n.map((x) => x.n)),
    };
  }

  /** Why this row already exists in the shop (same SKU / barcode, or name when it has neither), or null. */
  private async alreadyExists(tenantId: string, r: ImportRowResult): Promise<string | null> {
    const [m] = markExistingDuplicates([r], await this.existing(tenantId, [r]));
    return m.status === 'DUPLICATE' ? m.errors.join('; ') : null;
  }

  private async validate(tenantId: string, records: RawImportRow[]) {
    const refs = await this.refs(tenantId);
    const seen = { sku: new Map<string, number>(), barcode: new Map<string, number>() };
    const checked = records.map((r) => validateImportRecord(r, refs, seen));
    return markExistingDuplicates(checked, await this.existing(tenantId, checked));
  }

  /** Validate a whole file without writing anything. */
  async preview(tenantId: string, file: Express.Multer.File) {
    const { headerError, records } = rowsToRecords(await this.readFile(file));
    if (headerError) throw new BadRequestException(headerError);
    if (!records.length) throw new BadRequestException('The file has a header row but no products');
    const results = await this.validate(tenantId, records);
    const byLine = new Map(records.map((r) => [r.line, r.cells]));
    return {
      fileName: file.originalname,
      ...summarizeImport(results),
      commitChunkSize: IMPORT_COMMIT_CHUNK,
      rows: results.map(({ payload: _payload, ...r }) => ({ ...r, cells: r.status === 'OK' ? byLine.get(r.line) : undefined })),
    };
  }

  /**
   * Import up to IMPORT_COMMIT_CHUNK rows. Every row is validated again here (the preview is never
   * trusted) and duplicates are re-checked against the database, so a re-sent chunk creates nothing twice.
   * Opening stock goes to the importing user's branch only.
   */
  async commit(tenantId: string, user: { id: string; branchId?: string | null }, dto: CommitImportDto) {
    const records: RawImportRow[] = dto.rows.map((r) => ({
      line: r.line,
      cells: Object.fromEntries(
        Object.entries(r.cells ?? {})
          .filter(([k]) => (IMPORT_COLUMNS as readonly string[]).map((c) => c.toLowerCase()).includes(k))
          .map(([k, v]) => [k, String(v ?? '').trim().slice(0, 2000)]),
      ),
    }));
    const results = await this.validate(tenantId, records);
    const out: { line: number; name: string; status: 'CREATED' | 'SKIPPED' | 'ERROR'; message?: string; productId?: string }[] = [];
    for (const r of results) {
      if (r.status !== 'OK' || !r.payload) {
        out.push({ line: r.line, name: r.name, status: r.status === 'DUPLICATE' ? 'SKIPPED' : 'ERROR', message: r.errors.join('; ') });
        continue;
      }
      try {
        // Re-check right before creating: a retried chunk or a concurrent import of the same file may have
        // created this product after the validation above. Skipping it keeps the commit idempotent
        // (no second product, no second opening stock). Inside the try so a failed lookup fails only this row.
        const existsNow = await this.alreadyExists(tenantId, r);
        if (existsNow) {
          out.push({ line: r.line, name: r.name, status: 'SKIPPED', message: existsNow });
          continue;
        }
        // Opening stock is NOT written by product creation (that would bypass the stock ledger).
        // The product is created with zero stock, then the quantity goes through adjustStock
        // (OPENING_STOCK movement + inventory log, idempotent per product).
        const created = (await this.products.create(tenantId, {
          ...r.payload,
          openingStock: 0,
          ...(user.branchId ? { branchScope: 'SINGLE' as const, branchId: user.branchId } : {}),
        })) as { id?: string; variants?: { id: string }[] } | null;
        let message: string | undefined;
        const variantId = created?.variants?.[0]?.id;
        if (r.payload.openingStock > 0) {
          if (!created?.id || !variantId) {
            message = 'Product created but opening stock was not recorded (no variant). Add stock with a stock adjustment.';
          } else {
            try {
              await this.inventory.adjustStock(tenantId, user.branchId ?? '', user.id, {
                variantId,
                quantity: r.payload.openingStock,
                movementType: StockMovementType.OPENING_STOCK,
                unitCost: r.payload.costPrice,
                notes: `Product import (line ${r.line})`,
                referenceType: 'PRODUCT_IMPORT',
                referenceId: created.id,
                clientRequestId: `import-${created.id}`,
              });
            } catch (e) {
              message = `Product created but opening stock failed: ${(e as Error).message}. Add stock with a stock adjustment.`;
            }
          }
        }
        out.push({ line: r.line, name: r.name, status: 'CREATED', productId: created?.id, ...(message ? { message } : {}) });
      } catch (e) {
        if (isUniqueViolation(e)) {
          // Lost a race with another import (unique tenant + SKU). Nothing was created by this request.
          const reason = await this.alreadyExists(tenantId, r).catch(() => null);
          out.push(
            reason
              ? { line: r.line, name: r.name, status: 'SKIPPED', message: `${reason} (created by another import at the same time)` }
              : { line: r.line, name: r.name, status: 'ERROR', message: 'Conflicting product was being saved at the same time. Import this file again to retry.' },
          );
          continue;
        }
        const msg = (e as Error).message || 'Rejected';
        out.push({ line: r.line, name: r.name, status: /already exists/i.test(msg) ? 'SKIPPED' : 'ERROR', message: msg });
      }
    }
    const created = out.filter((o) => o.status === 'CREATED').length;
    await this.audit.log({
      tenantId,
      userId: user.id,
      action: 'IMPORT',
      resource: 'products',
      newData: { rows: out.length, created, skipped: out.filter((o) => o.status === 'SKIPPED').length, errors: out.filter((o) => o.status === 'ERROR').length, lines: [out[0]?.line, out[out.length - 1]?.line] },
    });
    return { created, skipped: out.filter((o) => o.status === 'SKIPPED').length, errors: out.filter((o) => o.status === 'ERROR').length, rows: out };
  }

  /** Excel template: the original columns first, optional columns after, example rows, instructions and lists. */
  async buildTemplateXlsx(tenantId: string): Promise<Buffer> {
    const { categories, brands } = await this.refs(tenantId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HexaOne';
    const ws = wb.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = IMPORT_COLUMNS.map((key) => ({ header: key, key, width: Math.max(12, key.length + 4) }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF9' } };
    ws.addRow({ name: 'Example Basmati Rice 1kg', sellingPrice: 450, costPrice: 380, mrp: 480, taxRate: 0, description: 'Delete the example rows', tags: 'rice|staples', status: 'ACTIVE', sku: 'RICE-1KG', barcode: '4790000000017', category: String(categories[0]?.name ?? ''), brand: String(brands[0]?.name ?? ''), unit: 'pcs', openingStock: 10, reorderLevel: 5 });
    ws.addRow({ name: 'Example Soap 100g', sellingPrice: 120, costPrice: 95, mrp: 130, taxRate: 18, status: 'DRAFT' });
    ws.getColumn('barcode').numFmt = '@';
    ws.getColumn('sku').numFmt = '@';

    const help = wb.addWorksheet('Instructions');
    help.columns = [{ header: 'Column', key: 'c', width: 16 }, { header: 'Required', key: 'r', width: 10 }, { header: 'Rule', key: 'd', width: 90 }];
    help.getRow(1).font = { bold: true };
    const rules: [string, string, string][] = [
      ['name', 'yes', 'Product name, up to 200 characters.'],
      ['sellingPrice', 'yes', 'Number ≥ 0 (LKR). Must not be higher than mrp.'],
      ['costPrice', 'yes', 'Number ≥ 0 (LKR).'],
      ['mrp', 'no', 'Number ≥ 0. Empty = sellingPrice.'],
      ['taxRate', 'no', 'Percent 0–100. Empty = 18.'],
      ['description', 'no', 'Up to 2000 characters.'],
      ['tags', 'no', 'Separate with | (for example rice|staples).'],
      ['status', 'no', 'ACTIVE or DRAFT. Empty = DRAFT.'],
      ['sku', 'no', 'Letters, numbers, . _ - / (max 64). Must be unique. Empty = generated.'],
      ['barcode', 'no', '4–32 letters / numbers. Must be unique. Empty = generated (EAN-13). Format the column as Text so Excel keeps leading zeros.'],
      ['category', 'no', 'Exact name of an existing category (see the Lists sheet).'],
      ['brand', 'no', 'Exact name of an existing brand (see the Lists sheet).'],
      ['unit', 'no', 'For example pcs, kg, l (max 20 characters). Blank = pcs.'],
      ['openingStock', 'no', 'Number ≥ 0. Goes to your current branch only.'],
      ['reorderLevel', 'no', 'Whole number ≥ 0.'],
      ['', '', `Up to ${IMPORT_MAX_ROWS} rows per file, 5 MB. Rows whose SKU / barcode already exists (or, without SKU and barcode, whose name exists) are skipped, never imported twice.`],
    ];
    rules.forEach(([c, r, d]) => help.addRow({ c, r, d }));

    const lists = wb.addWorksheet('Lists');
    lists.columns = [{ header: 'Categories', key: 'c', width: 32 }, { header: 'Brands', key: 'b', width: 32 }];
    lists.getRow(1).font = { bold: true };
    // Shop data (category / brand names) is written as plain string cells, never as { formula }, so a
    // name such as "=HYPERLINK(...)" is stored as text and Excel does not evaluate it (formula injection).
    // No quote prefix is added: the names must stay exactly as stored so they match on re-import.
    for (let i = 0; i < Math.max(categories.length, brands.length); i++) {
      lists.addRow({ c: String(categories[i]?.name ?? ''), b: String(brands[i]?.name ?? '') });
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
