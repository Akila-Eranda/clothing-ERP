import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AccountingBootstrapService } from '../src/modules/accounting/accounting-bootstrap.service';
import { ACCOUNT_MAPPING_KEYS } from '../src/modules/accounting/account-mapping.helper';
import { DocumentNumberingService } from '../src/modules/document-numbering/document-numbering.service';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(300_000);

describe('isolated accounting concurrency regressions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let numbering: DocumentNumberingService;
  let bootstrap: AccountingBootstrapService;
  const run = Date.now().toString(36);

  async function createTenant(label: string) {
    return prisma.tenant.create({
      data: {
        name: `Accounting concurrency ${label} ${run}`,
        subdomain: `acct-${label}-${run}`,
        shopType: 'GROCERY',
        plan: 'PROFESSIONAL',
        status: 'ACTIVE',
      },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    numbering = moduleFixture.get(DocumentNumberingService);
    bootstrap = moduleFixture.get(AccountingBootstrapService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates one first-use series and allocates distinct sequential numbers concurrently', async () => {
    const tenant = await createTenant('number');
    const key = `RACE-${run}`;
    const date = new Date(Date.UTC(2026, 0, 1));

    const numbers = await Promise.all(
      Array.from({ length: 8 }, () =>
        prisma.$transaction((tx) => numbering.allocate(tx, tenant.id, key, date)),
      ),
    );

    const series = await prisma.documentNumberSeries.findMany({
      where: { tenantId: tenant.id, key },
    });
    const sequences = numbers.map((number) => Number(number.match(/(\d{5})$/)?.[1]));
    expect(series).toHaveLength(1);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(sequences.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(series[0].nextValue).toBe(9);
  });

  it('bootstraps cold tenants concurrently without duplicates or replacing custom mappings', async () => {
    const tenantA = await createTenant('bootstrap-a');
    const tenantB = await createTenant('bootstrap-b');
    const customAccount = await prisma.account.create({
      data: {
        tenantId: tenantA.id,
        code: `CUSTOM-${run}`,
        name: 'User configured cash account',
        type: 'ASSET',
      },
    });
    await prisma.accountMapping.create({
      data: {
        tenantId: tenantA.id,
        key: 'CASH',
        accountId: customAccount.id,
        label: 'User configured cash mapping',
      },
    });

    await Promise.all([
      ...Array.from({ length: 3 }, () => bootstrap.bootstrapTenant(tenantA.id)),
      ...Array.from({ length: 3 }, () => bootstrap.bootstrapTenant(tenantB.id)),
    ]);

    const [mappingsA, mappingsB] = await Promise.all([
      prisma.accountMapping.findMany({ where: { tenantId: tenantA.id } }),
      prisma.accountMapping.findMany({ where: { tenantId: tenantB.id } }),
    ]);
    expect(mappingsA).toHaveLength(ACCOUNT_MAPPING_KEYS.length);
    expect(new Set(mappingsA.map((mapping) => mapping.key)).size).toBe(ACCOUNT_MAPPING_KEYS.length);
    expect(mappingsB).toHaveLength(ACCOUNT_MAPPING_KEYS.length);
    expect(new Set(mappingsB.map((mapping) => mapping.key)).size).toBe(ACCOUNT_MAPPING_KEYS.length);

    const cashA = mappingsA.find((mapping) => mapping.key === 'CASH');
    const cashB = mappingsB.find((mapping) => mapping.key === 'CASH');
    expect(cashA).toMatchObject({
      accountId: customAccount.id,
      label: 'User configured cash mapping',
    });
    expect(cashB?.accountId).not.toBe(customAccount.id);
    expect(
      await prisma.account.findFirst({
        where: { id: cashB?.accountId, tenantId: tenantB.id },
        select: { id: true },
      }),
    ).not.toBeNull();
    expect(
      await prisma.accountMapping.findFirst({
        where: { tenantId: tenantB.id, accountId: customAccount.id },
        select: { id: true },
      }),
    ).toBeNull();

    for (const tenantId of [tenantA.id, tenantB.id]) {
      expect(await prisma.accountingPreference.count({ where: { tenantId } })).toBe(1);
      expect(await prisma.bankAccount.count({ where: { tenantId } })).toBe(3);
      expect(await prisma.fiscalYear.count({ where: { tenantId } })).toBe(1);
    }
  });
});
