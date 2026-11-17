/**
 * Verifies docs/ops-sql/step1b-audit-2026-11.sql against a CONTROLLED fixture on the isolated database:
 *  - the script is read-only (static scan + it is executed inside a READ ONLY transaction, which would error on any write);
 *  - each of its three statements returns exactly what the fixture predicts, so the numbers a DBA reads on a production
 *    replica mean what the runbook says.
 *
 * Legacy-style fractional sale lines (which the API now refuses) are written straight into the isolated database.
 * Isolated Wave-1 runner only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductKind, RoleType } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';

jest.setTimeout(300_000);

const SQL_PATH = join(__dirname, '..', '..', '..', 'docs', 'ops-sql', 'step1b-audit-2026-11.sql');

/** Comment lines out, then split into statements on a semicolon at the end of a line. */
function statements(sql: string): string[] {
  const body = sql.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join('\n');
  return body.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
}

describe('step1b-audit-2026-11.sql (read-only audit for existing shops)', () => {
  let prisma: PrismaService;
  let module: TestingModule;
  const run = Date.now().toString(36);
  const raw = readFileSync(SQL_PATH, 'utf8');

  const ids: Record<string, string> = {};
  let sqlA: string;
  let sqlB: string;
  let sqlC: string;

  const asNumber = (v: unknown) => Number(v);
  const readOnly = async <T>(sql: string): Promise<T[]> =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return (await tx.$queryRawUnsafe(sql)) as T[];
    });

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = module.get(PrismaService);
    const stmts = statements(raw);
    expect(stmts).toHaveLength(3);
    [sqlA, sqlB, sqlC] = stmts;

    // ── tenant FRAC: piece-only products with legacy fractional lines, plus products that must NOT be counted ──
    const frac = await prisma.tenant.create({ data: { name: 'AUD frac', subdomain: `audfrac${run}`, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    ids.frac = frac.id;
    const branch = await prisma.branch.create({ data: { tenantId: frac.id, name: 'Main', code: 'MAIN' } });
    const mkProduct = async (n: string, data: object) => {
      const p = await prisma.product.create({
        data: {
          tenantId: frac.id, name: `Aud ${n}`, slug: `aud-${n}-${run}`, sku: `AUD-${n}-${run}-P`, status: 'ACTIVE', sellingPrice: 100, costPrice: 50, mrp: 120,
          ...data, variants: { create: { sku: `AUD-${n}-${run}`, name: 'Default', sellingPrice: 100, costPrice: 50, mrp: 120 } },
        },
        include: { variants: true },
      });
      return p.variants[0].id;
    };
    const pieceA = await mkProduct('pieceA', { unit: 'pcs', productKind: ProductKind.STANDARD, allowDecimalSelling: false });
    const pieceB = await mkProduct('pieceB', { unit: 'bottle', productKind: ProductKind.STANDARD, allowDecimalSelling: false });   // piece-only, no fractions sold
    const kgDefault = await mkProduct('kg', { unit: 'KG', productKind: ProductKind.STANDARD, allowDecimalSelling: false });        // weight unit: allowed
    const weighted = await mkProduct('w', { unit: 'pcs', productKind: ProductKind.WEIGHTED, allowDecimalSelling: false });        // WEIGHTED: allowed
    const flagged = await mkProduct('f', { unit: 'pcs', productKind: ProductKind.STANDARD, allowDecimalSelling: true });          // flag on: allowed

    let invoice = 0;
    const mkSale = async (createdAt: Date, lines: Array<{ variantId: string; quantity: number }>) => {
      invoice += 1;
      const sale = await prisma.sale.create({
        data: {
          tenantId: frac.id, branchId: branch.id, invoiceNumber: `AUD-${run}-${invoice}`, subtotal: 100, total: 100, createdAt,
          items: { create: lines.map((l) => ({ variantId: l.variantId, productName: 'x', variantName: 'x', sku: 'x', quantity: l.quantity, unitPrice: 100, total: 100 })) },
        },
      });
      return sale.id;
    };
    const recent = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const old = new Date(Date.now() - 200 * 24 * 3600 * 1000);
    await mkSale(recent, [{ variantId: pieceA, quantity: 0.5 }, { variantId: pieceA, quantity: 1.25 }]);  // 2 fractional lines, product pieceA
    await mkSale(recent, [{ variantId: pieceB, quantity: 3 }, { variantId: pieceA, quantity: 2 }]);         // whole quantities: not counted
    await mkSale(recent, [{ variantId: kgDefault, quantity: 0.375 }, { variantId: weighted, quantity: 0.2 }, { variantId: flagged, quantity: 1.5 }]); // allowed fractions: not counted
    await mkSale(old, [{ variantId: pieceB, quantity: 0.5 }]);                                              // older than 180 days: not counted
    // float noise is not a fraction
    await mkSale(recent, [{ variantId: pieceB, quantity: 2.0000000001 }]);

    // ── tenants for scale mode (part B) ──
    const mkTenant = async (key: string, settings: object | null) =>
      (ids[key] = (await prisma.tenant.create({ data: { name: `AUD ${key}`, subdomain: `aud${key}${run}`, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE', ...(settings ? { settings } : {}) } })).id);
    await mkTenant('modeUnset', null);
    await mkTenant('modeEmpty', { pos: {} });
    await mkTenant('modeWeight', { pos: { scaleBarcodeMode: 'weight' } });
    await mkTenant('modePrice', { pos: { scaleBarcodeMode: ' PRICE ' } });
    await mkTenant('modeAuto', { pos: { scaleBarcodeMode: 'AUTO' } });
    await mkTenant('modeJunk', { pos: { scaleBarcodeMode: 'grams' } });

    // ── Branch Manager roles (part C) ──
    const perm = await prisma.permission.upsert({ where: { resource_action: { resource: 'sales', action: 'create' } }, update: {}, create: { resource: 'sales', action: 'create' } });
    const mkBm = async (key: string, withSalesCreate: boolean, isSystem = true, name = 'Branch Manager') => {
      const t = await prisma.tenant.create({ data: { name: `AUD ${key}`, subdomain: `aud${key}${run}`, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
      ids[key] = t.id;
      await prisma.role.create({
        data: { tenantId: t.id, name, type: RoleType.BRANCH_MANAGER, isSystem, ...(withSalesCreate ? { permissions: { create: [{ permissionId: perm.id }] } } : {}) },
      });
    };
    await mkBm('bmWithout', false);
    await mkBm('bmWith', true);
    await mkBm('bmCustom', false, false, 'Branch Manager');   // a non-system role with the same name is not listed
  });

  afterAll(async () => {
    await module?.close();
  });

  it('is read-only: no data-changing or schema-changing keyword outside comments', () => {
    // comments and string literals (e.g. the permission action 'create') are not statements
    const code = raw.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join('\n').replace(/'(?:[^']|'')*'/g, "''");
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|VACUUM|REINDEX|CALL|DO)\b/i);
    expect(code).not.toMatch(/\bFOR\s+(UPDATE|SHARE)\b/i);
    expect(raw).toMatch(/READ-ONLY/);
  });

  it('part A counts only fractional lines of piece-only products in the last 180 days', async () => {
    const rows = await readOnly<{ tenant_id: string; piece_only_products: unknown; fractional_lines_180d: unknown; products_with_fractional_sales_180d: unknown }>(sqlA);
    const mine = rows.find((r) => r.tenant_id === ids.frac)!;
    expect(mine).toBeTruthy();
    expect(asNumber(mine.piece_only_products)).toBe(2);                      // pieceA and pieceB
    expect(asNumber(mine.fractional_lines_180d)).toBe(2);                    // the two 0.5 / 1.25 lines on pieceA only
    expect(asNumber(mine.products_with_fractional_sales_180d)).toBe(1);
    const other = rows.find((r) => r.tenant_id === ids.modeUnset)!;
    expect([asNumber(other.piece_only_products), asNumber(other.fractional_lines_180d)]).toEqual([0, 0]);
  });

  it('part A exposes counts and ids only: no names, no customer columns', async () => {
    const rows = await readOnly<Record<string, unknown>>(sqlA);
    expect(Object.keys(rows[0]).sort()).toEqual(['fractional_lines_180d', 'piece_only_products', 'products_with_fractional_sales_180d', 'subdomain', 'tenant_id']);
  });

  it('part B classifies the scale mode of every shop exactly as the API reads it', async () => {
    const rows = await readOnly<{ tenant_id: string; scale_barcode_mode: string; weighed_products: unknown }>(sqlB);
    const modeOf = (key: string) => rows.find((r) => r.tenant_id === ids[key])!.scale_barcode_mode;
    expect(modeOf('modeUnset')).toBe('UNSET (= AUTO)');
    expect(modeOf('modeEmpty')).toBe('UNSET (= AUTO)');
    expect(modeOf('modeWeight')).toBe('WEIGHT');
    expect(modeOf('modePrice')).toBe('PRICE');
    expect(modeOf('modeAuto')).toBe('AUTO');
    expect(modeOf('modeJunk')).toBe('INVALID (ignored = AUTO)');
    expect(asNumber(rows.find((r) => r.tenant_id === ids.frac)!.weighed_products)).toBe(2);   // kg unit + WEIGHTED kind
  });

  it('part C lists only SYSTEM Branch Manager roles and whether they hold sales:create', async () => {
    const rows = await readOnly<{ tenant_id: string; has_sales_create: boolean; users_in_role: unknown }>(sqlC);
    const mine = (key: string) => rows.filter((r) => r.tenant_id === ids[key]);
    expect(mine('bmWithout')).toHaveLength(1);
    expect(mine('bmWithout')[0].has_sales_create).toBe(false);
    expect(mine('bmWith')).toHaveLength(1);
    expect(mine('bmWith')[0].has_sales_create).toBe(true);
    expect(mine('bmCustom')).toHaveLength(0);
    expect(asNumber(mine('bmWithout')[0].users_in_role)).toBe(0);
    // the shops that still lack sales:create sort first
    const firstWith = rows.findIndex((r) => r.has_sales_create);
    const lastWithout = rows.map((r) => r.has_sales_create).lastIndexOf(false);
    if (firstWith >= 0 && lastWithout >= 0) expect(lastWithout).toBeLessThan(firstWith);
  });

  it('running the audit changed nothing: row counts of the tables it reads are identical before and after', async () => {
    const count = async () => ({
      tenants: await prisma.tenant.count(), sales: await prisma.sale.count(), items: await prisma.saleItem.count(),
      products: await prisma.product.count(), roles: await prisma.role.count(),
    });
    const before = await count();
    await readOnly(sqlA); await readOnly(sqlB); await readOnly(sqlC);
    expect(await count()).toEqual(before);
  });

  it('a write attempted inside the same read-only transaction is refused by PostgreSQL (the guard itself works)', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe(`UPDATE tenants SET name = name WHERE id = '${ids.frac}'`);
      }),
    ).rejects.toThrow(/read-only transaction/i);
  });
});
