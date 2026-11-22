import { randomBytes } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';

/** Returns the integration DB url, or null when integration tests are not enabled. Throws on an unsafe target. */
export function integrationDatabaseUrl(): string | null {
  const url = process.env.HEXA_INT_DATABASE_URL;
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('HEXA_INT_DATABASE_URL is not a valid URL');
  }
  const db = parsed.pathname.replace(/^\//, '');
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !/^hexa_qa/.test(db)) {
    throw new Error(
      `Refusing to run integration tests: the database must be on localhost and named hexa_qa* (got host=${parsed.hostname} db=${db}).`,
    );
  }
  return url;
}

export const integrationEnabled = !!process.env.HEXA_INT_DATABASE_URL;
/** `describeInt(...)` = describe when a safe DB is configured, otherwise skipped. */
// (typeof guard: this module is also imported by plain scripts such as the browser-test seeder, where there is no jest)
export const describeInt: jest.Describe = (typeof describe === 'function' ? (integrationEnabled ? describe : describe.skip) : undefined) as unknown as jest.Describe;

export async function connectPrisma(): Promise<PrismaService> {
  const url = integrationDatabaseUrl();
  if (!url) throw new Error('HEXA_INT_DATABASE_URL not set');
  process.env.DATABASE_URL = url;
  const prisma = new PrismaService({ get: () => undefined } as never);
  await prisma.$connect();
  return prisma;
}

const rid = () => randomBytes(4).toString('hex');

export type SeededTenant = { tenantId: string; branchId: string; userId: string };

/** A fresh isolated shop (tenant + branch + user). Unique subdomain per call, so suites never collide. */
export async function seedTenant(prisma: PrismaService, label = 'int'): Promise<SeededTenant> {
  const suffix = rid();
  const tenant = await prisma.tenant.create({ data: { name: `${label}-${suffix}`, subdomain: `${label}-${suffix}` } });
  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Main', code: `B${suffix}` } });
  const user = await prisma.user.create({
    data: { tenantId: tenant.id, email: `u-${suffix}@example.test`, passwordHash: 'x'.repeat(20), firstName: 'Int', lastName: 'Tester' },
  });
  return { tenantId: tenant.id, branchId: branch.id, userId: user.id };
}

export async function seedCustomer(
  prisma: PrismaService,
  tenantId: string,
  over: { creditLimit?: number; creditBalance?: number; walletBalance?: number } = {},
) {
  return prisma.customer.create({
    data: { tenantId, firstName: 'Cust', phone: `07${Math.floor(Math.random() * 1e8)}`, creditLimit: over.creditLimit ?? 100_000, creditBalance: over.creditBalance ?? 0, walletBalance: over.walletBalance ?? 0 },
  });
}

/** Adds an open CHARGE (credit sale) and keeps customer.creditBalance in step, exactly like the POS does. */
export async function addCharge(
  prisma: PrismaService,
  tenantId: string,
  customerId: string,
  amount: number,
  dueDate: Date,
  referenceId?: string,
) {
  await prisma.customer.update({ where: { id: customerId }, data: { creditBalance: { increment: amount } } });
  return prisma.customerCreditTransaction.create({
    data: { tenantId, customerId, amount, type: 'CHARGE', status: 'OPEN', paidAmount: 0, dueDate, description: 'int charge', referenceId },
  });
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The reconciliation law (Part 1):
 *   customer.creditBalance = opening(0) + charges - payments - credit notes +/- adjustments
 *   and every payment unit is allocated to a charge:  sum(charge.paidAmount) = payments + credit notes.
 * Returns the figures so tests can also assert specific numbers.
 */
export async function reconcileCustomer(prisma: PrismaService, tenantId: string, customerId: string) {
  const [customer, txns] = await Promise.all([
    prisma.customer.findFirstOrThrow({ where: { id: customerId, tenantId } }),
    prisma.customerCreditTransaction.findMany({ where: { tenantId, customerId } }),
  ]);
  let ledger = 0;
  let allocatedCharge = 0;
  let paymentLike = 0;
  let charges = 0;
  for (const t of txns) {
    const amt = r2(Math.abs(t.amount));
    if (t.type === 'CHARGE') { ledger += amt; charges += amt; allocatedCharge += t.paidAmount; }
    else if (t.type === 'PAYMENT' || t.type === 'CREDIT_NOTE') { ledger -= amt; paymentLike += amt; }
    else if (t.type === 'ADJUSTMENT_DOWN') ledger -= amt;
    else if (t.type === 'ADJUSTMENT_UP') ledger += amt;
  }
  return {
    customerBalance: r2(customer.creditBalance),
    ledgerBalance: r2(ledger),
    openOnCharges: r2(charges - allocatedCharge),
    allocatedOnCharges: r2(allocatedCharge),
    paymentsAndCreditNotes: r2(paymentLike),
    walletBalance: r2(customer.walletBalance),
  };
}
