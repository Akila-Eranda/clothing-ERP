/**
 * Customer bank details (admin only, validated, never leaked) and the customer bill message (shop template,
 * real invoice data, current credit balance). Full AppModule over HTTP against PostgreSQL + Redis (TEST database).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { RoleType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PERMISSION_CATALOGUE } from '../src/shared/security/permission-catalogue';
import { DEFAULT_BILL_TEMPLATE } from '../src/shared/bill-message.helper';

jest.setTimeout(300_000);
const CASHIER_PERMS = ['sales:create', 'sales:read', 'cash:create', 'cash:read', 'products:read', 'customers:read', 'customers:update'];
const MANAGER_PERMS = ['sales:read', 'cash:read', 'products:read', 'customers:read', 'customers:update'];
const ACCOUNT = '0012 3456 7890';

type Shop = { id: string; sub: string; counterId: string; variantId: string; admin: string; manager: string; cashier: string };

describe('Customer bank details and bill message', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = `Cbm-${Date.now()}-pw!`;
  const run = Date.now().toString(36);
  let A: Shop;
  let B: Shop;
  let customerId = '';
  let walkInSaleId = '';

  const pace = () => new Promise((r) => setTimeout(r, 250));
  const hdr = (s: Shop, token: string) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': s.sub, Host: 'localhost', 'x-pos-counter-id': s.counterId });
  const call = async (method: 'get' | 'post' | 'put', s: Shop, token: string, url: string, body?: unknown) => {
    await pace();
    const r = request(app.getHttpServer())[method](`/api/v1${url}`).set(hdr(s, token));
    return body === undefined ? r : r.send(body as object);
  };

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `cbm${label}${run}`;
    const t = await prisma.tenant.create({ data: { name: `CBM ${label} Mart`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE', phone: '0112223334' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WH-${label}`, isDefault: true } });
    const counter = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 1', code: 'C1' } });
    const role = async (name: string, type: RoleType, keys: readonly string[]) => {
      const ps = await Promise.all(keys.map((k) => {
        const [resource, action] = k.split(':');
        return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
      }));
      return prisma.role.create({ data: { tenantId: t.id, name, type, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    };
    const adminRole = await role('Admin', RoleType.TENANT_ADMIN, PERMISSION_CATALOGUE);
    const managerRole = await role('Manager', RoleType.BRANCH_MANAGER, MANAGER_PERMS);
    const cashierRole = await role('Cashier', RoleType.CASHIER, CASHIER_PERMS);
    const hash = await bcrypt.hash(PASSWORD, 10);
    const mk = (who: string, roleId: string) => prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `${who}-${run}@cbm${label}.test`, passwordHash: hash, firstName: who, lastName: label.toUpperCase(), status: 'ACTIVE', emailVerified: true, roles: { create: { roleId } } },
    });
    const sign = async (email: string) => {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${r.status}`);
      await pace();
      return r.body.data.accessToken as string;
    };
    const admin = await sign((await mk('admin', adminRole.id)).email);
    const manager = await sign((await mk('manager', managerRole.id)).email);
    const cashier = await sign((await mk('cashier', cashierRole.id)).email);
    const product = await prisma.product.create({
      data: { tenantId: t.id, name: 'Tea', slug: `tea-${label}-${run}`, sku: `TEA-${label}-${run}`, sellingPrice: 250, costPrice: 150, mrp: 300, status: 'ACTIVE', variants: { create: { sku: `TEA-${label}-${run}-V`, name: 'Default', sellingPrice: 250, costPrice: 150, mrp: 300 } } },
      include: { variants: true },
    });
    await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: product.variants[0].id, quantity: 1000 } });
    return { id: t.id, sub, counterId: counter.id, variantId: product.variants[0].id, admin, manager, cashier };
  }

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
    A = await seed('a');
    B = await seed('b');
    customerId = (await prisma.customer.create({ data: { tenantId: A.id, firstName: 'Nimal', lastName: 'Perera', phone: '0771234567', creditBalance: 1500.5, creditLimit: 50000 } })).id;
    expect((await call('post', A, A.admin, '/cash/open', { openingCash: 5000, counterId: A.counterId })).status).toBe(201);
  });

  afterAll(async () => {
    for (let i = 0; i < 60; i++) {
      const busy = await prisma.accountingOutboxEvent.count({ where: { tenantId: { in: [A.id, B.id] }, status: { in: ['PENDING', 'PROCESSING'] } } });
      if (!busy) break;
      await new Promise((res) => setTimeout(res, 500));
    }
    await new Promise((res) => setTimeout(res, 1500));
    await app?.close();
  });

  // ── customer bank details ──────────────────────────────────────────────
  describe('bank details', () => {
    const body = { bankName: 'Bank of Ceylon', accountNumber: ACCOUNT, accountHolderName: 'K. Nimal Perera', branchName: 'Colombo Fort', branchCode: '7010' };

    it('a customer without details returns null; nothing changes for existing customers', async () => {
      const r = await call('get', A, A.admin, `/customers/${customerId}/bank-details`);
      expect(r.status).toBe(200);
      expect(r.body.data).toBeNull();
      expect(await prisma.customerBankDetail.count({ where: { tenantId: A.id } })).toBe(0);
    });

    it('only an admin can read or change them (manager and cashier are refused, even with customers:update)', async () => {
      for (const token of [A.manager, A.cashier]) {
        expect((await call('get', A, token, `/customers/${customerId}/bank-details`)).status).toBe(403);
        expect((await call('put', A, token, `/customers/${customerId}/bank-details`, body)).status).toBe(403);
      }
      expect(await prisma.customerBankDetail.count({ where: { tenantId: A.id } })).toBe(0);
    });

    it('an admin saves, reads and updates them', async () => {
      const saved = await call('put', A, A.admin, `/customers/${customerId}/bank-details`, body);
      expect(saved.status).toBe(200);
      expect(saved.body.data).toMatchObject(body);
      expect((await call('get', A, A.admin, `/customers/${customerId}/bank-details`)).body.data).toMatchObject(body);
      const changed = await call('put', A, A.admin, `/customers/${customerId}/bank-details`, { ...body, branchName: 'Kandy', branchCode: '' });
      expect(changed.body.data).toMatchObject({ branchName: 'Kandy', branchCode: null });
      expect(await prisma.customerBankDetail.count({ where: { customerId } })).toBe(1);
    });

    it('validation: required fields, format and length', async () => {
      for (const bad of [
        { ...body, bankName: '' }, { ...body, accountNumber: '12' }, { ...body, accountNumber: '1234-<script>' }, { ...body, accountNumber: '9'.repeat(40) },
        { ...body, accountHolderName: '' }, { ...body, accountHolderName: 'x'.repeat(101) }, { ...body, branchCode: 'AB 12' }, { ...body, branchName: '$$$' },
        { ...body, unknownField: 'x' },
      ]) {
        expect((await call('put', A, A.admin, `/customers/${customerId}/bank-details`, bad)).status).toBe(400);
      }
      expect((await call('get', A, A.admin, `/customers/${customerId}/bank-details`)).body.data.accountNumber).toBe(ACCOUNT);
    });

    it('the account number is never returned by the customer endpoints used by the POS and customer screens', async () => {
      for (const token of [A.admin, A.manager, A.cashier]) {
        const one = await call('get', A, token, `/customers/${customerId}`);
        expect(one.status).toBe(200);
        expect(JSON.stringify(one.body)).not.toContain('0012');
        const list = await call('get', A, token, '/customers?limit=50');
        expect(JSON.stringify(list.body)).not.toContain('0012');
      }
    });

    it('the audit trail never holds the account number', async () => {
      await new Promise((res) => setTimeout(res, 1500));
      const rows = await prisma.auditLog.findMany({ where: { tenantId: A.id }, orderBy: { createdAt: 'desc' }, take: 200 });
      expect(rows.some((r) => JSON.stringify(r.newData ?? '').includes('bankName') || JSON.stringify(r.newData ?? '').includes('accountHolderName'))).toBe(true); // it was audited
      expect(JSON.stringify(rows)).not.toContain('0012 3456 7890');
      expect(JSON.stringify(rows)).not.toContain('0012345678');
    });

    it('another shop cannot read or change them; clearing every field removes them', async () => {
      expect((await call('get', B, B.admin, `/customers/${customerId}/bank-details`)).status).toBe(404);
      expect((await call('put', B, B.admin, `/customers/${customerId}/bank-details`, body)).status).toBe(404);
      const cleared = await call('put', A, A.admin, `/customers/${customerId}/bank-details`, {});
      expect(cleared.status).toBe(200);
      expect((await call('get', A, A.admin, `/customers/${customerId}/bank-details`)).body.data).toBeNull();
    });
  });

  // ── bill message ───────────────────────────────────────────────────────
  describe('bill message', () => {
    let saleId = '';

    it('the default template is returned with its placeholders; a shop that never edited it uses it', async () => {
      const r = await call('get', A, A.cashier, '/tenants/bill-message-template');
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ isDefault: true, template: DEFAULT_BILL_TEMPLATE });
      expect(r.body.data.placeholders.map((p: { key: string }) => p.key)).toEqual(expect.arrayContaining(['customer_name', 'shop_name', 'shop_phone', 'invoice_number', 'items', 'total', 'payment_method', 'customer_credit_balance']));
    });

    it('the message of a real sale: items with price, quantity and line total, total, payment, current credit balance', async () => {
      const sale = await call('post', A, A.admin, '/pos/sale', {
        customerId, applyTierDiscount: false,
        items: [{ variantId: A.variantId, productName: 'Tea', variantName: 'Default', sku: 'S', quantity: 3, unitPrice: 250, costPrice: 150 }, { isCustom: true, productName: 'Gift wrap', variantName: '', sku: 'CUSTOM', quantity: 1, unitPrice: 100, costPrice: 1 }],
        payments: [{ method: 'CASH', amount: 850 }],
      });
      if (sale.status !== 201) throw new Error(`sale ${sale.status} ${JSON.stringify(sale.body.message)}`);
      saleId = sale.body.data.id;
      const r = await call('get', A, A.admin, `/sales/${saleId}/bill-message`);
      expect(r.status).toBe(200);
      const m: string = r.body.data.message;
      expect(r.body.data.phone).toBe('0771234567');
      expect(m).toContain('Hi Nimal Perera');
      expect(m).toContain('CBM a Mart');
      expect(m).toContain('Shop no - 0112223334');
      expect(m).toContain(`Bill: ${sale.body.data.invoiceNumber}`);
      expect(m).toContain('• Tea — 3 × 250.00 = 750.00');
      expect(m).toContain('• Gift wrap — 1 × 100.00 = 100.00');
      expect(m).toContain('Total: LKR 850.00');
      expect(m).toContain('Payment: Cash');
      expect(m).toContain('Total Credit Balance: LKR 1,500.50');
      expect(m.split('\n').length).toBeGreaterThan(15);            // line breaks are kept
      expect(m).not.toMatch(/\{[a-z_]+\}/);
    });

    it("the credit balance is the customer's CURRENT balance, not the one at the time of the sale", async () => {
      await prisma.customer.update({ where: { id: customerId }, data: { creditBalance: 2750.25 } });
      const m: string = (await call('get', A, A.admin, `/sales/${saleId}/bill-message`)).body.data.message;
      expect(m).toContain('Total Credit Balance: LKR 2,750.25');
      expect(m).not.toContain('1,500.50');
    });

    it('a walk-in sale (no customer, no phone) still gives a clean message', async () => {
      const sale = await call('post', A, A.admin, '/pos/sale', { applyTierDiscount: false, items: [{ isCustom: true, productName: 'Loose item', variantName: '', sku: 'CUSTOM', quantity: 2, unitPrice: 100, costPrice: 1 }], payments: [{ method: 'CASH', amount: 200 }] });
      walkInSaleId = sale.body.data.id;
      const r = await call('get', A, A.admin, `/sales/${walkInSaleId}/bill-message`);
      expect(r.body.data.phone).toBeNull();
      expect(r.body.data.message).toContain('Hi Customer');
      expect(r.body.data.message).toContain('• Loose item — 2 × 100.00 = 200.00');
      expect(r.body.data.message).not.toMatch(/\{[a-z_]+\}/);
    });

    it('an admin edits the template; unknown placeholders and empty text are handled; the cashier cannot edit', async () => {
      expect((await call('put', A, A.cashier, '/tenants/bill-message-template', { template: 'x' })).status).toBe(403);
      expect((await call('put', A, A.manager, '/tenants/bill-message-template', { template: 'x' })).status).toBe(403);
      expect((await call('put', A, A.admin, '/tenants/bill-message-template', { template: 'Hello {customer_name} {nope}' })).status).toBe(400);
      expect((await call('put', A, A.admin, '/tenants/bill-message-template', { template: 'x'.repeat(2001) })).status).toBe(400);
      const saved = await call('put', A, A.admin, '/tenants/bill-message-template', { template: 'Dear {customer_name}\r\nBill {invoice_number}\n{items}\nPay: {total} ({payment_method}). Credit: {customer_credit_balance}' });
      expect(saved.status).toBe(200);
      expect(saved.body.data.isDefault).toBe(false);
      expect(saved.body.data.template).not.toContain('\r');
      const m: string = (await call('get', A, A.admin, `/sales/${saleId}/bill-message`)).body.data.message;
      expect(m.startsWith('Dear Nimal Perera\nBill INV-')).toBe(true);
      expect(m).toContain('Pay: 850.00 (Cash). Credit: 2,750.25');
      // other shops keep their own template
      expect((await call('get', B, B.admin, '/tenants/bill-message-template')).body.data.isDefault).toBe(true);
    });

    it('an empty template restores the default', async () => {
      const r = await call('put', A, A.admin, '/tenants/bill-message-template', { template: '   ' });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ isDefault: true, template: DEFAULT_BILL_TEMPLATE });
    });

    it('WhatsApp sending uses the same message path: refuses a sale without a phone; in test mode a send is refused with 503 (no real send)', async () => {
      const noPhone = await call('post', A, A.admin, '/whatsapp/send-sale-bill', { saleId: walkInSaleId });
      expect(noPhone.status).toBe(400);
      expect(JSON.stringify(noPhone.body)).toMatch(/no customer phone/);
      const notConnected = await call('post', A, A.admin, '/whatsapp/send-sale-bill', { saleId });
      // Isolated test mode: the runner disables every WhatsApp connection and send (whatsapp-connect.guard) -> 503,
      // never a real send. The "not connected" branch itself cannot be reached in test mode.
      expect(notConnected.status).toBe(503);
      expect(JSON.stringify(notConnected.body)).toMatch(/WhatsApp connections and sends are disabled in test mode/);
    });

    it('shops are isolated: another shop cannot read this sale\'s message; a cashier only reads their own sales', async () => {
      expect((await call('get', B, B.admin, `/sales/${saleId}/bill-message`)).status).toBe(404);
      expect((await call('get', A, A.cashier, `/sales/${saleId}/bill-message`)).status).toBe(404); // sold by the admin
    });
  });
});
