/**
 * Bank transfers: tenant isolation, idempotent retries, concurrent source debits,
 * and rollback when GL journal creation fails. Synthetic shops only.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { RoleType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JournalEntriesService } from '../src/modules/accounting/journal-entries.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

jest.setTimeout(180_000);

type Shop = { id: string; subdomain: string; branchId: string; token: string };

describe('Bank transfer atomicity and idempotency (isolated PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let journals: JournalEntriesService;
  const run = Date.now().toString(36);
  const password = `Transfer-${Date.now()}-pw!`;
  let passwordHash = '';
  let sequence = 0;
  let shopA: Shop;
  let shopB: Shop;

  const pace = () => new Promise((resolve) => setTimeout(resolve, 200));
  const headers = (shop: Shop) => ({
    Authorization: `Bearer ${shop.token}`,
    'x-tenant-id': shop.subdomain,
    'x-branch-id': shop.branchId,
    Host: 'localhost',
  });
  const post = async (shop: Shop, body: object) => {
    await pace();
    return request(app.getHttpServer())
      .post('/api/v1/accounting/bank-transfers')
      .set(headers(shop))
      .send(body);
  };

  async function seedShop(label: string): Promise<Shop> {
    const subdomain = `xfer${label}${run}`;
    const tenant = await prisma.tenant.create({
      data: {
        name: `Transfer ${label} ${run}`,
        subdomain,
        shopType: 'GROCERY',
        plan: 'PROFESSIONAL',
        status: 'ACTIVE',
      },
    });
    const branch = await prisma.branch.create({
      data: { tenantId: tenant.id, name: 'Main', code: 'MAIN' },
    });
    const permission = await prisma.permission.upsert({
      where: { resource_action: { resource: 'accounting', action: 'create' } },
      update: {},
      create: { resource: 'accounting', action: 'create' },
    });
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: `Transfer Admin ${label}`,
        type: RoleType.TENANT_ADMIN,
        permissions: { create: { permissionId: permission.id } },
      },
    });
    const email = `admin-${label}-${run}@transfer.test`;
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        email,
        passwordHash,
        firstName: 'Transfer',
        lastName: label,
        status: 'ACTIVE',
        emailVerified: true,
        roles: { create: { roleId: role.id } },
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set({ 'x-tenant-id': subdomain, Host: 'localhost' })
      .send({ email, password });
    if (login.status !== 200) throw new Error(`synthetic admin login failed: ${login.status}`);
    return { id: tenant.id, subdomain, branchId: branch.id, token: login.body.data.accessToken };
  }

  async function createAccounts(shop: Shop, openingBalance: number) {
    const suffix = ++sequence;
    const [fromGl, toGl] = await Promise.all([
      prisma.account.create({
        data: { tenantId: shop.id, code: `XFS${suffix}`, name: `Transfer source ${suffix}`, type: 'ASSET' },
      }),
      prisma.account.create({
        data: { tenantId: shop.id, code: `XFD${suffix}`, name: `Transfer destination ${suffix}`, type: 'ASSET' },
      }),
    ]);
    const [from, to] = await Promise.all([
      prisma.bankAccount.create({
        data: {
          tenantId: shop.id,
          branchId: shop.branchId,
          code: `XFER-S-${suffix}`,
          name: `Transfer source ${suffix}`,
          openingBalance,
          currentBalance: openingBalance,
          glAccountId: fromGl.id,
        },
      }),
      prisma.bankAccount.create({
        data: {
          tenantId: shop.id,
          branchId: shop.branchId,
          code: `XFER-D-${suffix}`,
          name: `Transfer destination ${suffix}`,
          glAccountId: toGl.id,
        },
      }),
    ]);
    return { from, to, fromGl, toGl };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    journals = moduleRef.get(JournalEntriesService);
    passwordHash = await bcrypt.hash(password, 10);
    shopA = await seedShop('a');
    shopB = await seedShop('b');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates balanced transfer legs and journal once; identical retry replays; changed payload conflicts', async () => {
    const accounts = await createAccounts(shopA, 1000);
    const body = {
      fromAccountId: accounts.from.id,
      toAccountId: accounts.to.id,
      amount: 300,
      clientRequestId: `retry-${run}`,
    };

    const first = await post(shopA, body);
    const retry = await post(shopA, body);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.data.outTxn.id).toBe(first.body.data.outTxn.id);
    expect(retry.body.data.inTxn.id).toBe(first.body.data.inTxn.id);
    expect(retry.body.data.journalEntryId).toBe(first.body.data.journalEntryId);
    expect(
      await prisma.bankTransaction.count({
        where: { tenantId: shopA.id, clientRequestId: body.clientRequestId },
      }),
    ).toBe(2);

    const changed = await post(shopA, { ...body, amount: 301 });
    expect(changed.status).toBe(409);
    const [from, to, journal, sourceGl, destinationGl] = await Promise.all([
      prisma.bankAccount.findUniqueOrThrow({ where: { id: accounts.from.id } }),
      prisma.bankAccount.findUniqueOrThrow({ where: { id: accounts.to.id } }),
      prisma.journalEntry.findFirstOrThrow({
        where: { tenantId: shopA.id, referenceType: 'BANK_TRANSFER', referenceId: body.clientRequestId },
        include: { lines: true },
      }),
      prisma.account.findUniqueOrThrow({ where: { id: accounts.fromGl.id } }),
      prisma.account.findUniqueOrThrow({ where: { id: accounts.toGl.id } }),
    ]);
    expect(from.currentBalance).toBe(700);
    expect(to.currentBalance).toBe(300);
    expect(journal.status).toBe('POSTED');
    expect(
      journal.lines
        .filter((line) => line.type === 'DEBIT')
        .reduce((sum, line) => sum + Number(line.amount), 0),
    ).toBe(300);
    expect(
      journal.lines
        .filter((line) => line.type === 'CREDIT')
        .reduce((sum, line) => sum + Number(line.amount), 0),
    ).toBe(300);
    expect(sourceGl.balance).toBe(-300);
    expect(destinationGl.balance).toBe(300);
  });

  it('does not overspend the source under concurrent transfers', async () => {
    const accounts = await createAccounts(shopA, 100);
    const send = (clientRequestId: string) =>
      post(shopA, {
        fromAccountId: accounts.from.id,
        toAccountId: accounts.to.id,
        amount: 75,
        clientRequestId,
        postToGl: false,
      });
    const [first, second] = await Promise.all([
      send(`race-a-${run}`),
      send(`race-b-${run}`),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 400]);
    const [from, to] = await Promise.all([
      prisma.bankAccount.findUniqueOrThrow({ where: { id: accounts.from.id } }),
      prisma.bankAccount.findUniqueOrThrow({ where: { id: accounts.to.id } }),
    ]);
    expect(from.currentBalance).toBe(25);
    expect(to.currentBalance).toBe(75);
  });

  it('replays concurrent identical requests even when the first transfer exhausts the source', async () => {
    const accounts = await createAccounts(shopA, 100);
    const body = {
      fromAccountId: accounts.from.id,
      toAccountId: accounts.to.id,
      amount: 100,
      clientRequestId: `parallel-retry-${run}`,
      postToGl: false,
    };
    const [first, retry] = await Promise.all([post(shopA, body), post(shopA, body)]);

    expect([first.status, retry.status]).toEqual([201, 201]);
    expect(retry.body.data.outTxn.id).toBe(first.body.data.outTxn.id);
    expect(retry.body.data.inTxn.id).toBe(first.body.data.inTxn.id);
    expect(
      await prisma.bankTransaction.count({
        where: { tenantId: shopA.id, clientRequestId: body.clientRequestId },
      }),
    ).toBe(2);
    const [from, to] = await Promise.all([
      prisma.bankAccount.findUniqueOrThrow({ where: { id: accounts.from.id } }),
      prisma.bankAccount.findUniqueOrThrow({ where: { id: accounts.to.id } }),
    ]);
    expect(from.currentBalance).toBe(0);
    expect(to.currentBalance).toBe(100);
  });

  it('rolls back both account balances and transfer rows when GL creation fails', async () => {
    const accounts = await createAccounts(shopA, 500);
    const createJournal = jest
      .spyOn(journals, 'create')
      .mockRejectedValueOnce(new Error('synthetic GL failure'));
    try {
      const response = await post(shopA, {
        fromAccountId: accounts.from.id,
        toAccountId: accounts.to.id,
        amount: 125,
        clientRequestId: `gl-failure-${run}`,
      });
      expect(response.status).toBe(500);
    } finally {
      createJournal.mockRestore();
    }

    const [from, to, count] = await Promise.all([
      prisma.bankAccount.findUniqueOrThrow({ where: { id: accounts.from.id } }),
      prisma.bankAccount.findUniqueOrThrow({ where: { id: accounts.to.id } }),
      prisma.bankTransaction.count({
        where: { tenantId: shopA.id, clientRequestId: `gl-failure-${run}` },
      }),
    ]);
    expect(from.currentBalance).toBe(500);
    expect(to.currentBalance).toBe(0);
    expect(count).toBe(0);
  });

  it('rejects a destination account from another tenant without changing either account', async () => {
    const source = await createAccounts(shopA, 200);
    const foreign = await createAccounts(shopB, 0);
    const response = await post(shopA, {
      fromAccountId: source.from.id,
      toAccountId: foreign.to.id,
      amount: 50,
      clientRequestId: `cross-tenant-${run}`,
      postToGl: false,
    });

    expect(response.status).toBe(404);
    const [from, foreignTo, rows] = await Promise.all([
      prisma.bankAccount.findUniqueOrThrow({ where: { id: source.from.id } }),
      prisma.bankAccount.findUniqueOrThrow({ where: { id: foreign.to.id } }),
      prisma.bankTransaction.count({
        where: { tenantId: shopA.id, clientRequestId: `cross-tenant-${run}` },
      }),
    ]);
    expect(from.currentBalance).toBe(200);
    expect(foreignTo.currentBalance).toBe(0);
    expect(rows).toBe(0);
  });
});
