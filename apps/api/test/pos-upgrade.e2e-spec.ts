/**
 * POS feature upgrade (Nov 2026) over HTTP on the full AppModule, against PostgreSQL + Redis:
 * card last 4, QR payment codes, Excel / CSV product import, counter handover + transfers
 * (incl. concurrency) and the day-end report. Two synthetic shops; shop B must never see shop A.
 * Needs DATABASE_URL (a TEST database) and REDIS_HOST / REDIS_PORT / REDIS_PASSWORD.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import * as ExcelJS from 'exceljs';
import { BankAccountType, RoleType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { crc16Ccitt } from '../src/modules/payment-qr/payment-qr.helper';
import { PERMISSION_CATALOGUE } from '../src/shared/security/permission-catalogue';

jest.setTimeout(300_000);

type Shop = {
  id: string; sub: string; branchId: string; counterId: string; counter2Id: string; bankId: string; bank2Id: string;
  variantId: string; productName: string; price: number;
  admin: string; manager: string; cashierA: string; cashierB: string; cashierAId: string; cashierBId: string; managerId: string;
};

// No cash:read: such staff may print the day-end report of their own shift only.
const CASHIER_PERMS = ['sales:create', 'sales:read', 'cash:create', 'products:read', 'customers:read', 'inventory:read'];
const MANAGER_PERMS = ['sales:read', 'cash:read', 'cash:create', 'cash:update', 'products:read', 'reports:read'];

const tlv = (tag: string, v: string) => `${tag}${String(v.length).padStart(2, '0')}${v}`;
function lankaQr(name: string) {
  const body = [tlv('00', '01'), tlv('01', '11'), tlv('26', tlv('00', 'lk.lankaqr') + tlv('01', '99887766')), tlv('52', '5411'), tlv('53', '144'), tlv('58', 'LK'), tlv('59', name), tlv('60', 'COLOMBO')].join('') + '6304';
  return body + crc16Ccitt(body);
}
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('POS upgrade: card last 4, QR, import, handover, day-end', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = `Pos-${Date.now()}-pw!`;
  let passwordHash = '';
  const run = Date.now().toString(36);
  let A: Shop;
  let B: Shop;

  const pace = () => new Promise((r) => setTimeout(r, 320));
  const hdr = (s: Shop, token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': s.sub, Host: 'localhost', ...extra });
  const get = async (s: Shop, token: string, url: string) => { await pace(); return request(app.getHttpServer()).get(`/api/v1${url}`).set(hdr(s, token)); };
  const post = async (s: Shop, token: string, url: string, body: unknown, extra: Record<string, string> = {}) => {
    await pace();
    return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr(s, token, extra)).send(body as object);
  };
  const upload = async (s: Shop, token: string, url: string, buf: Buffer, name: string, type: string) => {
    await pace();
    return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr(s, token)).attach('file', buf, { filename: name, contentType: type });
  };
  const waitFor = async (fn: () => Promise<boolean>, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 150)); }
    throw new Error('timed out waiting');
  };

  async function perms(keys: readonly string[]) {
    return Promise.all(keys.map((key) => {
      const [resource, action] = key.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
  }

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `posup${label}${run}`;
    const t = await prisma.tenant.create({ data: { name: `PosUp ${label.toUpperCase()}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WH-${label}`, isDefault: true } });
    const [counter, counter2] = await Promise.all([
      prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 1', code: 'C1', sortOrder: 1 } }),
      prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 2', code: 'C2', sortOrder: 2 } }),
    ]);
    const role = async (name: string, type: RoleType, keys: readonly string[]) => {
      const ps = await perms(keys);
      return prisma.role.create({ data: { tenantId: t.id, name, type, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    };
    const adminRole = await role('Admin', RoleType.TENANT_ADMIN, PERMISSION_CATALOGUE);
    const cashierRole = await role('Cashier', RoleType.CASHIER, CASHIER_PERMS);
    const managerRole = await role('Manager', RoleType.BRANCH_MANAGER, MANAGER_PERMS);
    const mk = (who: string, roleId: string) => prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `${who}-${run}@posup${label}.test`, passwordHash, firstName: who, lastName: label.toUpperCase(), status: 'ACTIVE', emailVerified: true, roles: { create: { roleId } } },
    });
    const [admin, manager, cashierA, cashierB] = [await mk('admin', adminRole.id), await mk('manager', managerRole.id), await mk('kasun', cashierRole.id), await mk('nimal', cashierRole.id)];
    const sign = async (u: { email: string }) => {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email: u.email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${u.email}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      await pace();
      return r.body.data.accessToken as string;
    };
    const [bank, bank2] = await Promise.all([
      prisma.bankAccount.create({ data: { tenantId: t.id, code: `BOC-${label}`, name: 'BOC Current', bankName: 'BOC', type: BankAccountType.CURRENT } }),
      prisma.bankAccount.create({ data: { tenantId: t.id, code: `HNB-${label}`, name: 'HNB Savings', bankName: 'HNB', type: BankAccountType.CURRENT } }),
    ]);
    const price = 250;
    const product = await prisma.product.create({
      data: {
        tenantId: t.id, name: `Tea ${label}`, slug: `tea-${label}-${run}`, sku: `TEA-${label}-${run}`, barcode: `47977${label === 'a' ? 1 : 2}${run}`.slice(0, 13),
        sellingPrice: price, costPrice: 200, mrp: 300, status: 'ACTIVE',
        variants: { create: { sku: `TEA-${label}-${run}-V`, name: 'Default', sellingPrice: price, costPrice: 200, mrp: 300 } },
      },
      include: { variants: true },
    });
    await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: product.variants[0].id, quantity: 500, reorderPoint: 5 } });
    return {
      id: t.id, sub, branchId: branch.id, counterId: counter.id, counter2Id: counter2.id, bankId: bank.id, bank2Id: bank2.id,
      variantId: product.variants[0].id, productName: product.name, price,
      admin: await sign(admin), manager: await sign(manager), cashierA: await sign(cashierA), cashierB: await sign(cashierB),
      cashierAId: cashierA.id, cashierBId: cashierB.id, managerId: manager.id,
    };
  }

  const sale = (s: Shop, token: string, payments: object[], qty = 1, counterId = s.counterId) =>
    post(s, token, '/pos/sale', {
      items: [{ variantId: s.variantId, productName: s.productName, variantName: 'Default', sku: 'TEA', quantity: qty, unitPrice: s.price, costPrice: 200 }],
      payments,
      applyTierDiscount: false,
    }, { 'x-pos-counter-id': counterId });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    passwordHash = await bcrypt.hash(PASSWORD, 10);
    A = await seed('a');
    B = await seed('b');
  });

  afterAll(async () => { await app?.close(); });

  // ── 5. Card: exactly the last 4 digits ────────────────────────────────────────────────
  describe('card payments', () => {
    it('saves only the last 4 digits', async () => {
      const r = await sale(A, A.cashierA, [{ method: 'CARD', amount: A.price, cardLast4: '4242' }]);
      expect(r.status).toBe(201);
      const pay = await prisma.salePayment.findFirst({ where: { saleId: r.body.data.id } });
      expect(pay).toMatchObject({ method: 'CARD', cardLast4: '4242', reference: '4242' });
    });

    it('older clients sending the digits in reference still work', async () => {
      const r = await sale(A, A.cashierA, [{ method: 'CARD', amount: A.price, reference: '1111' }]);
      expect(r.status).toBe(201);
      expect((await prisma.salePayment.findFirst({ where: { saleId: r.body.data.id } }))?.cardLast4).toBe('1111');
    });

    it('rejects missing, short, long, non-numeric and full card numbers (checkout not completed)', async () => {
      const before = await prisma.sale.count({ where: { tenantId: A.id } });
      for (const p of [{}, { cardLast4: '123' }, { reference: '12345' }, { reference: '4111111111111111' }, { cardLast4: '12a4' }, { reference: '4111 1111 1111 1111' }]) {
        const r = await sale(A, A.cashierA, [{ method: 'CARD', amount: A.price, ...p }]);
        expect(r.status).toBe(400);
      }
      // a full number in cardLast4 fails DTO validation (max 4) before any processing
      expect((await sale(A, A.cashierA, [{ method: 'CARD', amount: A.price, cardLast4: '4111111111111111' }])).status).toBe(400);
      expect(await prisma.sale.count({ where: { tenantId: A.id } })).toBe(before);
      const long = await prisma.salePayment.count({ where: { sale: { tenantId: A.id }, method: 'CARD', OR: [{ reference: { contains: '41111111' } }] } });
      expect(long).toBe(0);
    });

    it('card credit settlement requires the digits too', async () => {
      const cust = await prisma.customer.create({ data: { tenantId: A.id, firstName: 'Credit', lastName: 'Card', phone: `07${Date.now()}`.slice(0, 10), creditBalance: 500, creditLimit: 1000 } });
      await prisma.customerCreditTransaction.create({ data: { tenantId: A.id, customerId: cust.id, amount: 500, type: 'CHARGE', status: 'OPEN', paidAmount: 0 } });
      expect((await post(A, A.admin, `/customers/${cust.id}/credit/payment`, { amount: 100, paymentMethod: 'CARD', clientRequestId: 'payment-card-invalid-1' })).status).toBe(400);
      const ok = await post(A, A.admin, `/customers/${cust.id}/credit/payment`, { amount: 100, paymentMethod: 'CARD', cardLast4: '5555', clientRequestId: 'payment-card-valid-1' });
      expect(ok.status).toBe(201);
      const txn = await prisma.customerCreditTransaction.findFirst({ where: { customerId: cust.id, type: 'PAYMENT' } });
      expect(txn?.description).toContain('Card **** 5555');
    });
  });

  // ── 1. QR payment codes ───────────────────────────────────────────────────────────────
  describe('QR payment codes', () => {
    let staticId = '';
    let dynamicId = '';

    it('admin creates static and dynamic codes; payload is validated; cashier cannot manage', async () => {
      const bad = await post(A, A.admin, '/payment-qr', { label: 'Broken', bankAccountId: A.bankId, mode: 'DYNAMIC', merchantPayload: '000201010211XYZ' });
      expect(bad.status).toBe(400);
      const st = await post(A, A.admin, '/payment-qr', { label: 'BOC static', bankAccountId: A.bankId, isDefault: true });
      expect(st.status).toBe(201);
      staticId = st.body.data.id;
      const dy = await post(A, A.admin, '/payment-qr', { label: 'BOC LankaQR', bankAccountId: A.bankId, mode: 'DYNAMIC', merchantPayload: lankaQr('POSUP STORE') });
      expect(dy.status).toBe(201);
      expect(dy.body.data).toMatchObject({ hasPayload: true, merchantName: 'POSUP STORE' });
      expect(JSON.stringify(dy.body)).not.toContain('lk.lankaqr'); // payload is not echoed
      dynamicId = dy.body.data.id;
      expect((await post(A, A.cashierA, '/payment-qr', { label: 'x', bankAccountId: A.bankId })).status).toBe(403);
      expect((await post(A, A.admin, '/payment-qr', { label: 'x', bankAccountId: B.bankId })).status).toBe(400); // other shop's bank
    });

    it('image upload: PNG accepted, wrong content refused, other shop cannot upload', async () => {
      expect((await upload(A, A.admin, `/payment-qr/${staticId}/image`, Buffer.from('not an image'), 'qr.png', 'image/png')).status).toBe(400);
      expect((await upload(A, A.admin, `/payment-qr/${staticId}/image`, Buffer.from('<svg/>'), 'qr.svg', 'image/svg+xml')).status).toBe(400);
      const ok = await upload(A, A.admin, `/payment-qr/${staticId}/image`, PNG, 'qr.png', 'image/png');
      expect(ok.status).toBe(201);
      expect(ok.body.data.imageUrl).toMatch(new RegExp(`^/uploads/${A.id}/payment-qr/[0-9a-f-]+\\.png$`));
      expect((await upload(B, B.admin, `/payment-qr/${staticId}/image`, PNG, 'qr.png', 'image/png')).status).toBe(404);
    });

    it('POS gets active codes; render: dynamic QR carries the amount, static shows the image', async () => {
      const list = await get(A, A.cashierA, '/payment-qr/pos');
      expect(list.status).toBe(200);
      expect(list.body.data.map((c: { id: string }) => c.id).sort()).toEqual([dynamicId, staticId].sort());
      const dyn = await post(A, A.cashierA, `/payment-qr/${dynamicId}/render`, { amount: 1234.5 });
      expect(dyn.status).toBe(201);
      expect(dyn.body.data).toMatchObject({ mode: 'DYNAMIC', amount: 1234.5, merchantName: 'POSUP STORE' });
      expect(dyn.body.data.dataUrl).toMatch(/^data:image\/png;base64,/);
      const st = await post(A, A.cashierA, `/payment-qr/${staticId}/render`, { amount: 99 });
      // The static code was given an image earlier in this suite (upload at 208): render returns exactly that image.
      expect(st.body.data).toMatchObject({ mode: 'STATIC' });
      expect(st.body.data.dataUrl).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
      expect(st.body.data.amount ?? 99).toBe(99); // a static code cannot embed the amount
      expect((await get(B, B.cashierA, '/payment-qr/pos')).body.data).toEqual([]);
      expect((await post(B, B.cashierA, `/payment-qr/${dynamicId}/render`, { amount: 1 })).status).toBe(404);
    });

    it('a QR sale saves the bank account and QR code; mismatched / foreign codes are refused', async () => {
      const r = await sale(A, A.cashierA, [{ method: 'QR', amount: A.price, bankAccountId: A.bankId, qrCodeId: dynamicId }]);
      expect(r.status).toBe(201);
      expect(await prisma.salePayment.findFirst({ where: { saleId: r.body.data.id } })).toMatchObject({ method: 'QR', bankAccountId: A.bankId, qrCodeId: dynamicId });
      expect((await sale(A, A.cashierA, [{ method: 'QR', amount: A.price, bankAccountId: A.bank2Id, qrCodeId: dynamicId }])).status).toBe(400);
      expect((await sale(B, B.cashierA, [{ method: 'QR', amount: B.price, bankAccountId: B.bankId, qrCodeId: dynamicId }])).status).toBe(400);
      const detail = await get(A, A.admin, `/pos/sales/${r.body.data.id}`);
      expect(detail.body.data.payments[0].qrCode).toEqual({ label: 'BOC LankaQR' });
    });

    it('a deactivated code can no longer be used', async () => {
      expect((await request(app.getHttpServer()).put(`/api/v1/payment-qr/${staticId}`).set(hdr(A, A.admin)).send({ isActive: false })).status).toBe(200);
      await pace();
      expect((await sale(A, A.cashierA, [{ method: 'QR', amount: A.price, bankAccountId: A.bankId, qrCodeId: staticId }])).status).toBe(400);
    });
  });

  // ── 2. Bulk product import ────────────────────────────────────────────────────────────
  describe('product import (Excel / CSV)', () => {
    const csv = [
      'name,sellingPrice,costPrice,mrp,taxRate,description,tags,status,sku,barcode,openingStock',
      `Import Rice ${run},450,380,480,0,"White, 1kg",rice|staples,ACTIVE,IMP-R-${run},,7`,
      `Import Soap ${run},120,95,130,18,,,DRAFT,,,`,
      ',10,5,,,,,,,,',
      `Too Pricey ${run},500,100,400,,,,,,,`,
      `Dup Sku ${run},10,5,,,,,,IMP-R-${run},,`,
      `Existing Tea,10,5,,,,,,TEA-a-${run},,`,
    ].join('\r\n');

    it('preview reports every row (nothing saved); cashier cannot import', async () => {
      const before = await prisma.product.count({ where: { tenantId: A.id } });
      const r = await upload(A, A.admin, '/products/import/preview', Buffer.from(csv), 'products.csv', 'text/csv');
      expect(r.status).toBe(201);
      expect(r.body.data).toMatchObject({ totalRows: 6, valid: 2, errors: 3, duplicates: 1 });
      const byLine = Object.fromEntries(r.body.data.rows.map((x: { line: number }) => [x.line, x]));
      expect(byLine[4].errors).toContain('name is empty');
      expect(byLine[5].errors).toContain('sellingPrice must not be higher than mrp');
      expect(byLine[6].errors[0]).toMatch(/repeated \(also on line 2\)/);
      expect(byLine[7]).toMatchObject({ status: 'DUPLICATE' });
      expect(await prisma.product.count({ where: { tenantId: A.id } })).toBe(before);
      expect((await upload(A, A.cashierA, '/products/import/preview', Buffer.from(csv), 'p.csv', 'text/csv')).status).toBe(403);
      expect((await upload(A, A.admin, '/products/import/preview', PNG, 'p.csv', 'text/csv')).status).toBe(400);
    });

    it('commit creates valid rows once; a re-sent chunk is skipped; opening stock only in the user branch', async () => {
      const pv = await upload(A, A.admin, '/products/import/preview', Buffer.from(csv), 'products.csv', 'text/csv');
      const rows = pv.body.data.rows.filter((x: { status: string }) => x.status === 'OK').map((x: { line: number; cells: object }) => ({ line: x.line, cells: x.cells }));
      const c1 = await post(A, A.admin, '/products/import/commit', { rows });
      expect(c1.status).toBe(201);
      expect(c1.body.data).toMatchObject({ created: 2, skipped: 0, errors: 0 });
      const c2 = await post(A, A.admin, '/products/import/commit', { rows });
      expect(c2.body.data).toMatchObject({ created: 0, skipped: 2 });
      const rice = await prisma.product.findFirst({ where: { tenantId: A.id, sku: `IMP-R-${run}` }, include: { variants: { include: { inventory: true } } } });
      expect(rice).toMatchObject({ sellingPrice: 450, costPrice: 380, mrp: 480, taxRate: 0, status: 'ACTIVE', description: 'White, 1kg' });
      const stock = rice!.variants.flatMap((v) => v.inventory);
      expect(stock.map((i) => [i.branchId, i.quantity])).toEqual([[A.branchId, 7]]);
      expect(await prisma.product.count({ where: { tenantId: B.id, name: { startsWith: 'Import ' } } })).toBe(0);
      // rows are re-validated: a tampered cell is refused
      const bad = await post(A, A.admin, '/products/import/commit', { rows: [{ line: 2, cells: { name: 'Hack', sellingprice: '-5', costprice: '1' } }] });
      expect(bad.body.data).toMatchObject({ created: 0, errors: 1 });
    });

    it('reads .xlsx and serves the Excel template', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Products');
      ws.addRow(['name', 'sellingPrice', 'costPrice', 'barcode']);
      ws.addRow([`Xlsx Item ${run}`, 99.5, 70, '0012345678905']);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      const r = await upload(A, A.admin, '/products/import/preview', buf, 'p.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(r.status).toBe(201);
      expect(r.body.data.rows[0]).toMatchObject({ status: 'OK', barcode: '0012345678905' });
      await pace();
      const t = await request(app.getHttpServer()).get('/api/v1/products/import/template.xlsx').set(hdr(A, A.admin)).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(t.status).toBe(200);
      const tpl = new ExcelJS.Workbook();
      await tpl.xlsx.load(t.body as unknown as ArrayBuffer);
      expect(tpl.worksheets.map((w) => w.name)).toEqual(['Products', 'Instructions', 'Lists']);
      expect((tpl.getWorksheet('Products')!.getRow(1).values as string[]).slice(1, 9)).toEqual(['name', 'sellingPrice', 'costPrice', 'mrp', 'taxRate', 'description', 'tags', 'status']);
    });
  });

  // ── 3. Counter handover + transfers ───────────────────────────────────────────────────
  describe('cashier handover on a counter', () => {
    let regA = '';
    let regB = '';

    it('the next cashier takes over the exact drawer balance (never reset to zero)', async () => {
      // Cashier A's earlier card / QR sales on Counter 1 already auto-opened a zero-float wallet there
      // (existing POS behaviour), so opening again is refused; the float goes in as a cash-in instead.
      expect((await post(A, A.cashierA, '/cash/open', { openingCash: 5000, counterId: A.counterId })).status).toBe(400);
      const active = await get(A, A.cashierA, `/cash/active?counterId=${A.counterId}`);
      regA = active.body.data.id;
      expect((await post(A, A.cashierA, `/cash/${regA}/movements`, { type: 'DEPOSIT', amount: 5000, description: 'float' })).status).toBe(201);
      expect((await sale(A, A.cashierA, [{ method: 'CASH', amount: 1000 }], 4)).status).toBe(201); // 4 x 250, cash
      await waitFor(async () => (await prisma.cashMovement.count({ where: { registerId: regA, type: 'SALE' } })) >= 1);

      const preview = await get(A, A.cashierB, `/cash/handover-preview?counterId=${A.counterId}`);
      expect(preview.body.data).toMatchObject({ required: true, expectedCash: 6000 });

      const take = await post(A, A.cashierB, '/cash/open', { openingCash: 0, counterId: A.counterId });
      expect(take.status).toBe(201);
      regB = take.body.data.id;
      expect(take.body.data).toMatchObject({ openingCash: 6000, handover: { expectedCash: 6000, countedCash: 6000, variance: 0, counted: false } });
      const from = await prisma.cashRegister.findUnique({ where: { id: regA } });
      expect(from).toMatchObject({ status: 'CLOSED', clearedAmount: 6000, actualCash: 6000 });
      // Cleared through the day-end path: float (5000) was main cash already, only the sale is new money.
      const bankTxn = await prisma.bankTransaction.findFirst({ where: { tenantId: A.id, reference: `WALLET-${regA.slice(-8).toUpperCase()}` } });
      expect(bankTxn).toMatchObject({ type: 'DEPOSIT', amount: 1000 });
      const h = await prisma.cashHandover.findFirst({ where: { toRegisterId: regB } });
      expect(h).toMatchObject({ fromRegisterId: regA, fromCashierId: A.cashierAId, toCashierId: A.cashierBId, expectedCash: 6000, countedCash: 6000, performedById: A.cashierBId });
      const counterCash = await get(A, A.admin, '/cash/counters/cash');
      expect(counterCash.body.data.find((c: { counterId: string }) => c.counterId === A.counterId).total).toBe(6000);
    });

    it('a count difference above the threshold needs a manager; a manager authorises it', async () => {
      // Cashier A comes back to the counter: takes over from B with a big shortage → refused.
      const deniedNoReason = await post(A, A.cashierA, '/cash/open', { openingCash: 0, counterId: A.counterId, countedCash: 4000 });
      expect(deniedNoReason.status).toBe(400); // the variance reason is validated before the approval check
      expect(await prisma.cashRegister.findUnique({ where: { id: regB } })).toMatchObject({ status: 'OPEN', clearedAt: null });
      const denied = await post(A, A.cashierA, '/cash/open', { openingCash: 0, counterId: A.counterId, countedCash: 4000, reason: 'Counted short at handover' });
      expect(denied.status).toBe(403); // reason given, difference above the threshold: needs a manager
      expect(await prisma.cashRegister.findUnique({ where: { id: regB } })).toMatchObject({ status: 'OPEN', clearedAt: null });
      const missingReason = await post(A, A.cashierA, '/cash/open', { openingCash: 0, counterId: A.counterId, countedCash: 5900 });
      expect(missingReason.status).toBe(400);
      expect(await prisma.cashRegister.findUnique({ where: { id: regB } })).toMatchObject({ status: 'OPEN', clearedAt: null });
      // Manager (logged in on the terminal) with cashier A's PIN token is not set up here: manager takes over directly.
      const ok = await post(A, A.manager, '/cash/open', { openingCash: 0, counterId: A.counterId, countedCash: 5900, reason: 'Cash count verified at handover' });
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({ openingCash: 5900, handover: { expectedCash: 6000, countedCash: 5900, variance: -100, counted: true } });
      expect(ok.body.data.handover.authorizedById).toBe(A.managerId);
      const b = await prisma.cashRegister.findUnique({ where: { id: regB } });
      expect(b).toMatchObject({ status: 'CLOSED', actualCash: 5900, variance: -100 });
      const hist = await get(A, A.admin, `/cash/counters/${A.counterId}/history`);
      expect(hist.body.data.cashInDrawer).toBe(5900);
      expect(hist.body.data.handovers).toHaveLength(2);
      expect(hist.body.data.handovers[0]).toMatchObject({ variance: -100, authorizedByName: 'manager A' });
      // Counter day report: the two handovers inside the day are counted once, not three times.
      const day = await get(A, A.manager, `/cash/day-end-report?counterId=${A.counterId}`);
      expect(day.status).toBe(200);
      expect(day.body.data.totals).toMatchObject({ openingCash: 0, deposits: 5000, cashSales: 1000, expectedClosingCash: 6000, handedOverWithin: 11900, handoverIn: 0 });
      expect((await get(A, A.manager, '/cash/day-end-report?date=2026-13-45')).status).toBe(400);
    });

    it('concurrent transfers cannot overdraw a drawer (exactly one of two full-balance transfers succeeds)', async () => {
      const src = await post(A, A.cashierA, '/cash/open', { openingCash: 1000, counterId: A.counter2Id });
      expect(src.status).toBe(201);
      const mgrOpen = await prisma.cashRegister.findFirst({ where: { tenantId: A.id, counterId: A.counterId, status: 'OPEN' } });
      const body = { from: 'REGISTER', fromRegisterId: src.body.data.id, toRegisterId: mgrOpen!.id, amount: 1000, reason: 'race' };
      await pace();
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer()).post('/api/v1/cash/transfer').set(hdr(A, A.cashierA)).send(body),
        request(app.getHttpServer()).post('/api/v1/cash/transfer').set(hdr(A, A.cashierA)).send(body),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 400]);
      const out = await prisma.cashMovement.findMany({ where: { registerId: src.body.data.id, type: 'WITHDRAWAL' } });
      expect(out).toHaveLength(1);
      const dst = await prisma.cashMovement.findMany({ where: { registerId: mgrOpen!.id, type: 'DEPOSIT', reference: out[0].reference } });
      expect(dst).toHaveLength(1); // credited exactly once, same reference (atomic pair)
    });

    it('shop B cannot see or take over shop A counters', async () => {
      expect((await get(B, B.cashierB, `/cash/handover-preview?counterId=${A.counterId}`)).body.data).toMatchObject({ required: false });
      expect((await post(B, B.cashierB, '/cash/open', { openingCash: 0, counterId: A.counterId })).status).toBe(400);
      expect((await get(B, B.admin, `/cash/counters/${A.counterId}/history`)).status).toBe(404);
    });
  });

  // ── 4. Day-end report ─────────────────────────────────────────────────────────────────
  describe('day-end report', () => {
    it('totals by payment method for one shift; cashiers only see their own shift', async () => {
      const open = await post(B, B.cashierB, '/cash/open', { openingCash: 2000, counterId: B.counter2Id });
      const reg = open.body.data.id;
      await sale(B, B.cashierB, [{ method: 'CASH', amount: 500 }], 2, B.counter2Id);
      await sale(B, B.cashierB, [{ method: 'CARD', amount: 250, cardLast4: '9090' }], 1, B.counter2Id);
      await sale(B, B.cashierB, [{ method: 'BANK_TRANSFER', amount: 750, bankAccountId: B.bank2Id }], 3, B.counter2Id);
      await waitFor(async () => (await prisma.cashMovement.count({ where: { registerId: reg, type: 'SALE' } })) >= 1);
      await post(B, B.cashierB, `/cash/${reg}/movements`, { type: 'WITHDRAWAL', amount: 300, description: 'bank drop' });

      const r = await get(B, B.cashierB, `/cash/${reg}/day-end-report`);
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ scope: 'SHIFT', counters: ['Counter 2'], branch: { name: 'Main' }, business: { name: 'PosUp B' } });
      expect(r.body.data.totals).toMatchObject({
        transactionCount: 3, openingCash: 2000, cashSales: 500, withdrawals: 300,
        collections: { cash: 500, card: 250, qr: 0, bankTransfer: 750, other: 0 },
        totalCollections: 1500, expectedClosingCash: 2200, actualClosingCash: null, difference: null,
      });
      expect((await get(B, B.cashierA, `/cash/${reg}/day-end-report`)).status).toBe(403);
      expect((await get(A, A.admin, `/cash/${reg}/day-end-report`)).status).toBe(404);

      await post(B, B.cashierB, `/cash/${reg}/close`, { actualCash: 2150 });
      const closed = await get(B, B.manager, `/cash/day-end-report?counterId=${B.counter2Id}`);
      expect(closed.body.data.totals).toMatchObject({ actualClosingCash: 2150, difference: -50, transactionCount: 3 });
    });
  });
});
