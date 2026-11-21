/**
 * Bank accounts managed by shop administrators and used for QR payments:
 * create / edit / disable / enable with validation, duplicate protection, stale-edit protection and audit logging;
 * cashiers can see and use active accounts but never change them (enforced by the API); shop isolation;
 * and the QR payload (what the POS and the Customer Display show) carries the exact selected account's five details.
 * Full AppModule over HTTP against PostgreSQL + Redis (TEST database).
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
import { systemRoleDefinitions } from '../src/modules/roles/default-system-roles';
import { crc16Ccitt } from '../src/modules/payment-qr/payment-qr.helper';

jest.setTimeout(400_000);

const tlv = (tag: string, v: string) => `${tag}${String(v.length).padStart(2, '0')}${v}`;
function lankaQr(name: string, merchantId: string) {
  const body = [tlv('00', '01'), tlv('01', '11'), tlv('26', tlv('00', 'lk.lankaqr') + tlv('01', merchantId)), tlv('52', '5411'), tlv('53', '144'), tlv('58', 'LK'), tlv('59', name), tlv('60', 'COLOMBO')].join('') + '6304';
  return body + crc16Ccitt(body);
}

type Shop = { id: string; sub: string; admin: string; cashier: string };

describe('Bank account management + QR payment details', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = `Bnk-${Date.now()}-pw!`;
  const run = Date.now().toString(36);
  let hash = '';
  let A: Shop;
  let B: Shop;

  const pace = () => new Promise((r) => setTimeout(r, 250));
  const hdr = (token: string, sub: string) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': sub, Host: 'localhost' });
  const call = async (method: 'get' | 'post' | 'put', s: Shop, who: 'admin' | 'cashier', url: string, body?: object) => {
    await pace();
    const r = request(app.getHttpServer())[method](`/api/v1${url}`).set(hdr(s[who], s.sub));
    return body ? r.send(body) : r;
  };
  const withToken = async (method: 'get' | 'put', token: string, sub: string, url: string, body?: object) => {
    await pace();
    const r = request(app.getHttpServer())[method](`/api/v1${url}`).set(hdr(token, sub));
    return body ? r.send(body) : r;
  };

  async function login(sub: string, email: string) {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email, password: PASSWORD });
    if (r.status !== 200) throw new Error(`login ${r.status}`);
    await pace();
    return r.body.data.accessToken as string;
  }

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `bnk${label}${run}`;
    const t = await prisma.tenant.create({ data: { name: `BNK ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WH-${label}`, isDefault: true } });
    const perms = await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    const byKey = new Map(perms.map((p) => [`${p.resource}:${p.action}`, p.id]));
    // the real default roles of a shop
    const defs = systemRoleDefinitions([...PERMISSION_CATALOGUE]);
    const mkRole = (name: string) => {
      const d = defs.find((x) => x.name === name)!;
      return prisma.role.create({ data: { tenantId: t.id, name, type: d.type as RoleType, permissions: { create: d.permissions.map((k) => ({ permissionId: byKey.get(k)! })) } } });
    };
    const adminRole = await mkRole('Tenant Admin');
    const cashierRole = await mkRole('Cashier');
    const mk = (email: string, roleId: string) => prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email, passwordHash: hash, firstName: 'U', lastName: label, status: 'ACTIVE', emailVerified: true, roles: { create: { roleId } } },
    });
    await mk(`admin-${run}@bnk${label}.test`, adminRole.id);
    await mk(`cashier-${run}@bnk${label}.test`, cashierRole.id);
    return { id: t.id, sub, admin: await login(sub, `admin-${run}@bnk${label}.test`), cashier: await login(sub, `cashier-${run}@bnk${label}.test`) };
  }

  const good = (n: number, extra: object = {}) => ({
    code: `BNK-${n}`, name: `Test bank ${n}`, type: 'CURRENT', bankName: 'Bank of Ceylon', accountNumber: `0081 2345 ${String(1000 + n)}`,
    accountHolderName: `Holder ${n} (Pvt) Ltd`, branchName: 'Colombo Fort', branchCode: `00${n}`, ...extra,
  });
  const row = (id: string) => prisma.bankAccount.findUniqueOrThrow({ where: { id } });
  const audits = (tenantId: string, resourceId: string) => prisma.auditLog.findMany({ where: { tenantId, resource: 'bank_accounts', resourceId }, orderBy: { createdAt: 'asc' } });

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
    hash = await bcrypt.hash(PASSWORD, 10);
    A = await seed('a');
    B = await seed('b');
  });

  afterAll(async () => {
    await new Promise((res) => setTimeout(res, 1000));
    await app?.close();
  });

  let boc!: { id: string; updatedAt: string };
  let hnb!: { id: string };

  // ── 1. admin creates ─────────────────────────────────────────────────────────────────────────────────────
  it('1. admin creates a bank account with all details; stored trimmed; audit entry without the full number', async () => {
    const r = await call('post', A, 'admin', '/accounting/bank-accounts', good(1, { bankName: '  Bank of   Ceylon ', accountHolderName: ' Holder 1 (Pvt)  Ltd ' }));
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({
      code: 'BNK-1', bankName: 'Bank of Ceylon', accountNumber: '0081 2345 1001', accountHolderName: 'Holder 1 (Pvt) Ltd', branchName: 'Colombo Fort', branchCode: '001', isActive: true,
    });
    boc = { id: r.body.data.id, updatedAt: r.body.data.updatedAt };
    const logs = await audits(A.id, boc.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('CREATE');
    const text = JSON.stringify(logs[0]);
    expect(text).not.toContain('0081 2345 1001');
    expect(text).not.toContain('008123451001');
    expect(text).toContain('••••1001');
    expect(text).toContain('Bank of Ceylon');
  });

  it('1b. a second account for the same shop (used later to switch the QR account)', async () => {
    const r = await call('post', A, 'admin', '/accounting/bank-accounts', good(2, { bankName: 'Hatton National Bank', accountNumber: '9876543210', accountHolderName: 'Second Holder', branchName: 'Kandy', branchCode: 'KDY' }));
    expect(r.status).toBe(201);
    hnb = { id: r.body.data.id };
  });

  it('2. incomplete or invalid details are refused and nothing is saved', async () => {
    const before = await prisma.bankAccount.count({ where: { tenantId: A.id } });
    const missing = await call('post', A, 'admin', '/accounting/bank-accounts', { code: 'BNK-X', name: 'No details', type: 'CURRENT' });
    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.body.message)).toMatch(/Bank name is required.*Account number is required.*Account holder name is required.*Branch is required.*Branch code is required/);
    for (const patch of [{ accountNumber: '123' }, { branchCode: 'bad code!' }, { accountHolderName: '12345' }, { bankName: 'B' }, { branchName: '<x>' }, { accountHolderName: undefined }, { branchCode: '   ' }]) {
      const r = await call('post', A, 'admin', '/accounting/bank-accounts', good(9, { code: 'BNK-9', accountNumber: '5555666677', ...patch }));
      expect(r.status).toBe(400);
    }
    expect(await prisma.bankAccount.count({ where: { tenantId: A.id } })).toBe(before);
  });

  it('3. duplicates are refused (same bank + number, ignoring spaces / hyphens / case; same code)', async () => {
    const dupNumber = await call('post', A, 'admin', '/accounting/bank-accounts', good(3, { bankName: 'bank of ceylon', accountNumber: '0081-2345-1001' }));
    expect(dupNumber.status).toBe(409);
    expect(JSON.stringify(dupNumber.body.message)).toContain('BNK-1');
    const dupCode = await call('post', A, 'admin', '/accounting/bank-accounts', good(3, { code: 'BNK-1', accountNumber: '7777888899' }));
    expect(dupCode.status).toBe(409);
    // the same number at a different bank is a different account
    expect((await call('post', A, 'admin', '/accounting/bank-accounts', good(4, { bankName: 'Sampath Bank', accountNumber: '0081 2345 1001' }))).status).toBe(201);
    // cash accounts need no bank details
    const cash = await call('post', A, 'admin', '/accounting/bank-accounts', { code: 'CASH-1', name: 'Shop safe', type: 'CASH_IN_HAND' });
    expect(cash.status).toBe(201);
    expect(cash.body.data.accountNumber).toBeNull();
  });

  // ── 2. admin edits ───────────────────────────────────────────────────────────────────────────────────────
  it('4. admin edits details; a stale editor is refused; incomplete edits are refused; every change is audited', async () => {
    const stale = await call('put', A, 'admin', `/accounting/bank-accounts/${boc.id}`, { branchName: 'Stale edit', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' });
    expect(stale.status).toBe(409);
    expect((await row(boc.id)).branchName).toBe('Colombo Fort');

    const ok = await call('put', A, 'admin', `/accounting/bank-accounts/${boc.id}`, { branchName: 'Colombo City', branchCode: '002', accountHolderName: 'Renamed Holder Ltd', expectedUpdatedAt: boc.updatedAt });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ branchName: 'Colombo City', branchCode: '002', accountHolderName: 'Renamed Holder Ltd', bankName: 'Bank of Ceylon', accountNumber: '0081 2345 1001' });
    boc = { id: boc.id, updatedAt: ok.body.data.updatedAt };

    // a second save with the now-stale timestamp is refused (no silent overwrite)
    const again = await call('put', A, 'admin', `/accounting/bank-accounts/${boc.id}`, { branchCode: '003', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' });
    expect(again.status).toBe(409);

    for (const patch of [{ branchCode: '' }, { accountHolderName: '   ' }, { accountNumber: '12' }, { bankName: '' }]) {
      expect((await call('put', A, 'admin', `/accounting/bank-accounts/${boc.id}`, patch)).status).toBe(400);
    }
    const dup = await call('put', A, 'admin', `/accounting/bank-accounts/${hnb.id}`, { bankName: 'Bank of Ceylon', accountNumber: '0081-2345-1001' });
    expect(dup.status).toBe(409);
    expect(await row(hnb.id)).toMatchObject({ bankName: 'Hatton National Bank', accountNumber: '9876543210' });

    const logs = await audits(A.id, boc.id);
    expect(logs.map((l) => l.action)).toEqual(['CREATE', 'UPDATE']);
    const upd = JSON.stringify(logs[1]);
    expect(upd).toContain('Colombo Fort');       // old value
    expect(upd).toContain('Colombo City');       // new value
    expect(upd).not.toContain('008123451001');
    expect(upd).not.toContain('0081 2345 1001');
  });

  it('4b. a legacy account (saved before these fields existed) can be disabled / renamed, but editing its bank details requires completing them', async () => {
    const legacy = await prisma.bankAccount.create({ data: { tenantId: A.id, code: 'LEGACY', name: 'Old account', type: 'CURRENT', bankName: 'People\'s Bank', accountNumber: '1234567890' } });
    expect((await call('put', A, 'admin', `/accounting/bank-accounts/${legacy.id}`, { name: 'Old account (renamed)' })).status).toBe(200);
    expect((await call('put', A, 'admin', `/accounting/bank-accounts/${legacy.id}`, { isActive: false })).status).toBe(200);
    expect((await call('put', A, 'admin', `/accounting/bank-accounts/${legacy.id}`, { isActive: true })).status).toBe(200);
    expect((await call('put', A, 'admin', `/accounting/bank-accounts/${legacy.id}`, { bankName: 'People\'s Bank PLC' })).status).toBe(400);   // holder / branch still missing
    const full = await call('put', A, 'admin', `/accounting/bank-accounts/${legacy.id}`, { accountHolderName: 'Legacy Holder', branchName: 'Galle', branchCode: 'GLE' });
    expect(full.status).toBe(200);
    expect(full.body.data).toMatchObject({ bankName: 'People\'s Bank', accountNumber: '1234567890', accountHolderName: 'Legacy Holder', branchCode: 'GLE' });
  });

  // ── 3. cashier: view + use, never edit ───────────────────────────────────────────────────────────────────
  it('5. cashier cannot add or edit bank accounts (API rejects; nothing changes)', async () => {
    const before = await row(boc.id);
    const countBefore = await prisma.bankAccount.count({ where: { tenantId: A.id } });
    expect((await call('post', A, 'cashier', '/accounting/bank-accounts', good(7, { accountNumber: '4444333322' }))).status).toBe(403);
    expect((await call('put', A, 'cashier', `/accounting/bank-accounts/${boc.id}`, { branchName: 'Cashier edit' })).status).toBe(403);
    expect((await call('put', A, 'cashier', `/accounting/bank-accounts/${boc.id}`, { isActive: false })).status).toBe(403);
    expect((await call('post', A, 'cashier', '/payment-qr', { label: 'x', bankAccountId: boc.id })).status).toBe(403);
    expect(await row(boc.id)).toEqual(before);
    expect(await prisma.bankAccount.count({ where: { tenantId: A.id } })).toBe(countBefore);
  });

  // ── 4. disable / enable ──────────────────────────────────────────────────────────────────────────────────
  it('6. disable and enable: the cashier sees only active accounts; the admin can list disabled ones', async () => {
    const activeNames = async (who: 'admin' | 'cashier', qs = '') => ((await call('get', A, who, `/accounting/bank-accounts${qs}`)).body.data as { code: string }[]).map((b) => b.code);
    expect(await activeNames('cashier')).toEqual(expect.arrayContaining(['BNK-1', 'BNK-2']));

    expect((await call('put', A, 'admin', `/accounting/bank-accounts/${hnb.id}`, { isActive: false })).status).toBe(200);
    expect(await activeNames('cashier')).not.toContain('BNK-2');
    expect(await activeNames('cashier', '?includeInactive=true')).not.toContain('BNK-2');   // a cashier cannot list disabled accounts
    expect(await activeNames('admin')).not.toContain('BNK-2');
    expect(await activeNames('admin', '?includeInactive=true')).toContain('BNK-2');

    expect((await call('put', A, 'admin', `/accounting/bank-accounts/${hnb.id}`, { isActive: true })).status).toBe(200);
    expect(await activeNames('cashier')).toContain('BNK-2');
    const logs = (await audits(A.id, hnb.id)).map((l) => l.action);
    expect(logs).toEqual(['CREATE', 'UPDATE', 'UPDATE']);
  });

  // ── 5. QR: selected account → exact details ─────────────────────────────────────────────────────────────
  let qrBoc = ''; let qrHnb = '';
  it('7. QR codes are linked to a bank account; the cashier gets that account\'s five details with the QR', async () => {
    const q1 = await call('post', A, 'admin', '/payment-qr', { label: 'BOC LankaQR', bankAccountId: boc.id, mode: 'DYNAMIC', merchantPayload: lankaQr('BOC SHOP', '11112222'), isDefault: true });
    const q2 = await call('post', A, 'admin', '/payment-qr', { label: 'HNB LankaQR', bankAccountId: hnb.id, mode: 'DYNAMIC', merchantPayload: lankaQr('HNB SHOP', '33334444') });
    expect([q1.status, q2.status]).toEqual([201, 201]);
    qrBoc = q1.body.data.id; qrHnb = q2.body.data.id;

    const pos = (await call('get', A, 'cashier', '/payment-qr/pos')).body.data as { id: string; bankAccount: Record<string, string> }[];
    const forBoc = pos.find((c) => c.id === qrBoc)!;
    const forHnb = pos.find((c) => c.id === qrHnb)!;
    expect(forBoc.bankAccount).toMatchObject({ id: boc.id, bankName: 'Bank of Ceylon', accountNumber: '0081 2345 1001', accountHolderName: 'Renamed Holder Ltd', branchName: 'Colombo City', branchCode: '002' });
    expect(forHnb.bankAccount).toMatchObject({ id: hnb.id, bankName: 'Hatton National Bank', accountNumber: '9876543210', accountHolderName: 'Second Holder', branchName: 'Kandy', branchCode: 'KDY' });

    // rendering for an amount returns the same account's details, the exact amount and a scannable image
    const r1 = (await call('post', A, 'cashier', `/payment-qr/${qrBoc}/render`, { amount: 4000 })).body.data;
    expect(r1).toMatchObject({ qrCodeId: qrBoc, bankAccountId: boc.id, amount: 4000, mode: 'DYNAMIC', merchantName: 'BOC SHOP' });
    expect(r1.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(r1.bankAccount).toMatchObject({ bankName: 'Bank of Ceylon', accountNumber: '0081 2345 1001', accountHolderName: 'Renamed Holder Ltd', branchName: 'Colombo City', branchCode: '002' });
    const r2 = (await call('post', A, 'cashier', `/payment-qr/${qrHnb}/render`, { amount: 4000 })).body.data;
    expect(r2.bankAccount).toMatchObject({ bankName: 'Hatton National Bank', accountNumber: '9876543210', accountHolderName: 'Second Holder', branchName: 'Kandy', branchCode: 'KDY' });
    expect(r2.dataUrl).not.toBe(r1.dataUrl);                                                // different account → different QR
  });

  it('7b. editing the account is reflected immediately; a disabled account\'s QR disappears and cannot be rendered', async () => {
    const e = await call('put', A, 'admin', `/accounting/bank-accounts/${hnb.id}`, { branchCode: 'KDY2' });
    expect(e.status).toBe(200);
    const r = (await call('post', A, 'cashier', `/payment-qr/${qrHnb}/render`, { amount: 100 })).body.data;
    expect(r.bankAccount.branchCode).toBe('KDY2');

    await call('put', A, 'admin', `/accounting/bank-accounts/${hnb.id}`, { isActive: false });
    const pos = (await call('get', A, 'cashier', '/payment-qr/pos')).body.data as { id: string }[];
    expect(pos.map((c) => c.id)).toEqual([qrBoc]);
    expect((await call('post', A, 'cashier', `/payment-qr/${qrHnb}/render`, { amount: 100 })).status).toBe(404);
    await call('put', A, 'admin', `/accounting/bank-accounts/${hnb.id}`, { isActive: true });
    expect((await call('post', A, 'cashier', `/payment-qr/${qrHnb}/render`, { amount: 100 })).status).toBe(201);
  });

  // ── 6. shop isolation ───────────────────────────────────────────────────────────────────────────────────
  it('8. shop isolation: another shop sees, edits and renders none of this', async () => {
    const bOwn = await call('post', B, 'admin', '/accounting/bank-accounts', good(1, { code: 'B-ONLY', accountNumber: '0081 2345 1001' }));   // same number as A's: allowed in another shop
    expect(bOwn.status).toBe(201);
    const bList = (await call('get', B, 'admin', '/accounting/bank-accounts?includeInactive=true')).body.data as { code: string }[];
    expect(bList.map((x) => x.code)).toEqual(['B-ONLY']);
    expect(JSON.stringify((await call('get', B, 'cashier', '/payment-qr/pos')).body.data)).not.toContain('Renamed Holder');

    expect((await call('put', B, 'admin', `/accounting/bank-accounts/${boc.id}`, { branchName: 'Cross-shop edit' })).status).toBe(404);
    expect((await call('put', B, 'admin', `/accounting/bank-accounts/${boc.id}`, { isActive: false })).status).toBe(404);
    expect((await call('post', B, 'cashier', `/payment-qr/${qrBoc}/render`, { amount: 100 })).status).toBe(404);
    expect((await call('post', B, 'admin', '/payment-qr', { label: 'Steal', bankAccountId: boc.id })).status).toBe(400);
    expect((await row(boc.id)).branchName).toBe('Colombo City');
    // a token of shop B sent with shop A's header is rejected
    expect((await withToken('get', B.admin, A.sub, '/accounting/bank-accounts')).status).toBe(403);
    expect((await withToken('put', B.admin, A.sub, `/accounting/bank-accounts/${boc.id}`, { branchName: 'x' })).status).toBe(403);
  });

  it('9. every account change by an admin is in the audit log; no entry holds a full account number', async () => {
    const all = await prisma.auditLog.findMany({ where: { tenantId: A.id, resource: 'bank_accounts' } });
    expect(all.length).toBeGreaterThanOrEqual(8);
    const text = JSON.stringify(all);
    for (const full of ['008123451001', '0081 2345 1001', '9876543210', '1234567890']) expect(text).not.toContain(full);
  });
});
