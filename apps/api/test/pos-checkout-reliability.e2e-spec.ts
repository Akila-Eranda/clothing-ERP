/**
 * Part 5 - POS checkout reliability on REAL PostgreSQL (PosService, real inventory / numbering / pricing engines).
 * Critical scenarios: two cashiers selling the same limited stock; many parallel requests with one idempotency key;
 * a client retry after a timeout; failure AFTER stock was deducted (complete rollback, no invoice-number gap);
 * database failure mid-checkout; the ledger intent committed with the sale; mixed custom / stock carts; credit
 * limit; a large basket against the transaction limits. Throw-away database only (run via test-int/run-e2e-local.cjs).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PaymentMethod, RoleType, StockMovementType } from '@prisma/client';
import databaseConfig from '../src/config/database.config';
import appConfig from '../src/config/app.config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PosModule, PosService, CreateSaleDto, SaleItemDto } from '../src/modules/pos/pos.module';
import { InventoryService } from '../src/modules/inventory/inventory.service';

jest.setTimeout(240_000);

type Seeded = { variantId: string; productName: string };

describe('POS checkout reliability (real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let pos: PosService;
  let inventory: InventoryService;

  const run = Date.now().toString(36);
  let tenantId: string;
  let branchId: string;
  let cashierA: string;
  let cashierB: string;
  let managerId: string;
  let seq = 0;
  const key = () => `rel-${run}-${++seq}-${Math.random().toString(36).slice(2, 8)}`;

  async function user(name: string, type: RoleType) {
    const role = await prisma.role.create({ data: { tenantId, name: `${name}-${run}`, type } });
    return (await prisma.user.create({
      data: { tenantId, branchId, email: `${name.toLowerCase()}-${run}@rel.test`, passwordHash: 'not-used', firstName: name, lastName: 'REL', roles: { create: { roleId: role.id } } },
    })).id;
  }

  async function product(name: string, price: number, cost: number): Promise<Seeded> {
    const sku = `${name.toUpperCase()}-${run}`;
    const p = await prisma.product.create({
      data: { tenantId, name, slug: `${name.toLowerCase()}-${run}`, sku, sellingPrice: price, costPrice: cost, mrp: price + 20, unit: 'pcs',
        variants: { create: { sku: `${sku}-V`, name: 'Default', sellingPrice: price, costPrice: cost, mrp: price + 20 } } },
      include: { variants: true },
    });
    return { variantId: p.variants[0].id, productName: name };
  }
  const receive = (p: Seeded, quantity: number, unitCost = 50) =>
    inventory.adjustStock(tenantId, branchId, managerId, { variantId: p.variantId, quantity, movementType: StockMovementType.PURCHASE, unitCost });
  const onHand = async (p: Seeded) => (await prisma.inventory.findFirst({ where: { tenantId, variantId: p.variantId } }))?.quantity ?? 0;

  const line = (p: Seeded, quantity: number, unitPrice: number): SaleItemDto =>
    ({ variantId: p.variantId, productName: p.productName, variantName: 'Default', sku: 'SKU', quantity, unitPrice, costPrice: 1 }) as SaleItemDto;
  const customLine = (name: string, quantity: number, unitPrice: number): SaleItemDto =>
    ({ isCustom: true, productName: name, variantName: '', sku: 'CUSTOM', quantity, unitPrice, costPrice: 0 }) as SaleItemDto;
  const dto = (items: SaleItemDto[], total: number, extra: Partial<CreateSaleDto> = {}) =>
    ({ items, payments: [{ method: PaymentMethod.CASH, amount: total }], applyTierDiscount: false, ...extra }) as CreateSaleDto;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig, databaseConfig], ignoreEnvFile: true }),
        EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
        PrismaModule,
        PosModule,
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    pos = moduleRef.get(PosService);
    inventory = moduleRef.get(InventoryService);
    const tenant = await prisma.tenant.create({
      data: { name: `REL Grocery ${run}`, subdomain: `rel-${run}`, shopType: 'GROCERY', settings: { pos: { allowNegativeStock: false } } },
    });
    tenantId = tenant.id;
    branchId = (await prisma.branch.create({ data: { tenantId, name: 'Main', code: 'MAIN' } })).id;
    cashierA = await user('CashierA', RoleType.CASHIER);
    cashierB = await user('CashierB', RoleType.CASHIER);
    managerId = await user('Manager', RoleType.BRANCH_MANAGER);
  });
  afterAll(async () => { await moduleRef?.close(); });

  /** Units deducted by SALE movements (per-lot LOT_ALLOCATION detail rows are excluded - they repeat the same units). */
  const unitsDeducted = async (variantId: string, referenceId?: string) => {
    const rows = await prisma.inventoryLog.findMany({
      where: { tenantId, variantId, movementType: StockMovementType.SALE, ...(referenceId ? { referenceId } : {}) },
      select: { quantityChange: true, notes: true },
    });
    return Math.round(rows.filter((r) => r.notes !== 'LOT_ALLOCATION').reduce((s, r) => s - r.quantityChange, 0) * 1000) / 1000;
  };
  const salesFor = (id: string) => prisma.saleItem.aggregate({ where: { variantId: id, sale: { tenantId } }, _sum: { quantity: true }, _count: true });

  it('TWO CASHIERS, ONE LAST UNIT: exactly one sale succeeds, stock never goes negative, no duplicate deduction', async () => {
    const p = await product('LastUnit', 100, 50);
    await receive(p, 1);
    const results = await Promise.allSettled([
      pos.createSale(tenantId, branchId, cashierA, dto([line(p, 1, 100)], 100, { clientRequestId: key() })),
      pos.createSale(tenantId, branchId, cashierB, dto([line(p, 1, 100)], 100, { clientRequestId: key() })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(failure.reason?.message)).toMatch(/Insufficient stock/);
    expect(await onHand(p)).toBe(0);
    expect((await salesFor(p.variantId))._count).toBe(1);
    expect(await unitsDeducted(p.variantId)).toBe(1); // one unit left the shelf exactly once
  });

  it('LIMITED STOCK, MANY CASHIERS: 12 simultaneous single-unit sales of 4 units sell exactly 4', async () => {
    const p = await product('Limited4', 100, 50);
    await receive(p, 4);
    const cashiers = [cashierA, cashierB, managerId];
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => pos.createSale(tenantId, branchId, cashiers[i % 3], dto([line(p, 1, 100)], 100, { clientRequestId: key() }))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    expect(await onHand(p)).toBe(0);
    expect((await salesFor(p.variantId))._sum.quantity).toBe(4);
  });

  it('SAME IDEMPOTENCY KEY, 8 PARALLEL REQUESTS: one sale, one payment, one stock deduction, everyone gets the same sale', async () => {
    const p = await product('Idem', 100, 50);
    await receive(p, 10);
    const k = key();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => pos.createSale(tenantId, branchId, cashierA, dto([line(p, 2, 100)], 200, { clientRequestId: k }))));
    const ok = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
    expect(ok.length).toBe(8);
    expect(new Set(ok.map((r) => r.value.id)).size).toBe(1);
    expect(await onHand(p)).toBe(8);
    expect(await prisma.sale.count({ where: { tenantId, clientRequestId: k } })).toBe(1);
    expect(await prisma.salePayment.count({ where: { saleId: ok[0].value.id } })).toBe(1);
  });

  it('CLIENT RETRY AFTER A TIMEOUT returns the original sale; reusing the key for a different cart is refused', async () => {
    const p = await product('Retry', 100, 50);
    await receive(p, 10);
    const k = key();
    const first = await pos.createSale(tenantId, branchId, cashierA, dto([line(p, 1, 100)], 100, { clientRequestId: k }));
    const retry = await pos.createSale(tenantId, branchId, cashierA, dto([line(p, 1, 100)], 100, { clientRequestId: k }));
    expect(retry.id).toBe(first.id);
    expect((retry as any).idempotentReplay).toBe(true);
    expect(await onHand(p)).toBe(9);
    await expect(pos.createSale(tenantId, branchId, cashierA, dto([line(p, 5, 100)], 500, { clientRequestId: k }))).rejects.toBeInstanceOf(ConflictException);
    expect(await onHand(p)).toBe(9);
  });

  it('FAILURE AFTER STOCK WAS DEDUCTED: complete rollback - stock, sale, payments, stock log, ledger intent, and NO invoice-number gap', async () => {
    const p = await product('Rollback', 100, 50);
    await receive(p, 5);
    const before = await pos.createSale(tenantId, branchId, cashierA, dto([line(p, 1, 100)], 100, { clientRequestId: key() })); // consumes a number
    const num = (inv: string) => Number(String(inv).match(/(\d+)$/)?.[1]);
    const stockBefore = await onHand(p);
    const counts = async () => ({
      sales: await prisma.sale.count({ where: { tenantId } }),
      payments: await prisma.salePayment.count({ where: { sale: { tenantId } } }),
      logs: await prisma.inventoryLog.count({ where: { tenantId, variantId: p.variantId } }),
      outbox: await prisma.accountingOutboxEvent.count({ where: { tenantId } }),
    });
    const snapshot = await counts();

    // fails AFTER stock deduction and after the sale rows were written, inside the same transaction
    const spy = jest.spyOn(pos as any, 'recordReloadSalesFromItems').mockRejectedValueOnce(new Error('simulated failure after stock deduction'));
    await expect(pos.createSale(tenantId, branchId, cashierA, dto([line(p, 2, 100)], 200, { clientRequestId: key() }))).rejects.toThrow('simulated failure');
    spy.mockRestore();

    expect(await onHand(p)).toBe(stockBefore);
    expect(await counts()).toEqual(snapshot);
    const after = await pos.createSale(tenantId, branchId, cashierA, dto([line(p, 1, 100)], 100, { clientRequestId: key() }));
    expect(num(after.invoiceNumber)).toBe(num(before.invoiceNumber) + 1); // the failed attempt did not burn an invoice number
  });

  it('DATABASE CONNECTION FAILS mid-checkout: nothing is written and the same request can simply be retried', async () => {
    const p = await product('DbFail', 100, 50);
    await receive(p, 5);
    const k = key();
    const spy = jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));
    await expect(pos.createSale(tenantId, branchId, cashierA, dto([line(p, 1, 100)], 100, { clientRequestId: k }))).rejects.toThrow('Connection terminated');
    spy.mockRestore();
    expect(await onHand(p)).toBe(5);
    expect(await prisma.sale.count({ where: { tenantId, clientRequestId: k } })).toBe(0);
    const retry = await pos.createSale(tenantId, branchId, cashierA, dto([line(p, 1, 100)], 100, { clientRequestId: k }));
    expect(retry.id).toBeDefined();
    expect(await onHand(p)).toBe(4);
  });

  it('SALE SUCCEEDS BUT LEDGER POSTING IS UNAVAILABLE: the ledger intent was committed with the sale (nothing can silently disconnect)', async () => {
    const p = await product('Outbox', 100, 50);
    await receive(p, 5);
    const sale = await pos.createSale(tenantId, branchId, cashierA, dto([line(p, 1, 100)], 100, { clientRequestId: key() }));
    const rows = await prisma.accountingOutboxEvent.findMany({ where: { tenantId, sourceType: 'SALE', sourceId: sale.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('PENDING'); // posting happens later (fast path / sweeper); the intent already exists
    // a replay of the same request never creates a second intent
    const k = key();
    await pos.createSale(tenantId, branchId, cashierA, dto([line(p, 1, 100)], 100, { clientRequestId: k }));
    await pos.createSale(tenantId, branchId, cashierA, dto([line(p, 1, 100)], 100, { clientRequestId: k }));
    expect(await prisma.accountingOutboxEvent.count({ where: { tenantId, sourceType: 'SALE' } })).toBe(await prisma.sale.count({ where: { tenantId } }));
  });

  it('MIXED CART: stock line is validated / deducted, custom (bill-only) line is not; cashier is refused, manager succeeds', async () => {
    const p = await product('Mixed', 100, 50);
    await receive(p, 3);
    const items = [line(p, 2, 100), customLine('Gift wrap', 1, 150)];
    await expect(pos.createSale(tenantId, branchId, cashierA, dto(items, 350, { clientRequestId: key() }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(await onHand(p)).toBe(3);

    const sale = await pos.createSale(tenantId, branchId, managerId, dto(items, 350, { clientRequestId: key() }));
    expect(sale.total).toBe(350);
    expect(await onHand(p)).toBe(1); // only the stock line moved stock
    const rows = await prisma.saleItem.findMany({ where: { saleId: sale.id }, orderBy: { unitPrice: 'asc' } });
    expect(rows.map((r) => [r.variantId, r.sku])).toEqual([[p.variantId, 'SKU'], [null, 'CUSTOM']]);
    expect(await unitsDeducted(p.variantId, sale.id)).toBe(2); // only the stock line (2 units) moved stock
    // a stock line that is NOT available is still refused even when a custom line is present (no bypass)
    await expect(pos.createSale(tenantId, branchId, managerId, dto([line(p, 5, 100), customLine('Wrap', 1, 50)], 550, { clientRequestId: key() })))
      .rejects.toThrow(/Insufficient stock/);
    expect(await onHand(p)).toBe(1);
  });

  it('CUSTOM-ONLY SALE by a manager: no stock movement at all, invoice and payment recorded', async () => {
    const sale = await pos.createSale(tenantId, branchId, managerId, dto([customLine('Delivery fee', 1, 250)], 250, { clientRequestId: key() }));
    expect(sale.total).toBe(250);
    expect(await prisma.inventoryLog.count({ where: { tenantId, referenceId: sale.id } })).toBe(0);
    expect(await prisma.salePayment.count({ where: { saleId: sale.id } })).toBe(1);
  });

  it('CREDIT LIMIT: a credit sale above the customer\'s limit is refused and leaves stock, balance and sales untouched', async () => {
    const p = await product('Credit', 100, 50);
    await receive(p, 5);
    const customer = await prisma.customer.create({ data: { tenantId, firstName: 'Limited', phone: `07${Math.floor(Math.random() * 1e8)}`, creditLimit: 150, creditBalance: 0 } });
    const salesBefore = await prisma.sale.count({ where: { tenantId } });
    await expect(pos.createSale(tenantId, branchId, cashierA, {
      items: [line(p, 2, 100)], customerId: customer.id, payments: [{ method: PaymentMethod.CUSTOMER_CREDIT, amount: 200 }], applyTierDiscount: false, clientRequestId: key(),
    } as CreateSaleDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(await onHand(p)).toBe(5);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).creditBalance).toBe(0);
    expect(await prisma.sale.count({ where: { tenantId } })).toBe(salesBefore);
    // within the limit it works and creates exactly one open charge
    const ok = await pos.createSale(tenantId, branchId, cashierA, {
      items: [line(p, 1, 100)], customerId: customer.id, payments: [{ method: PaymentMethod.CUSTOMER_CREDIT, amount: 100 }], applyTierDiscount: false, clientRequestId: key(),
    } as CreateSaleDto);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).creditBalance).toBe(100);
    expect(await prisma.customerCreditTransaction.count({ where: { customerId: customer.id, type: 'CHARGE', referenceId: ok.id } })).toBe(1);
  });

  it('LARGE BASKET: a 40-line sale completes well inside the transaction limit (performance probe)', async () => {
    const items: SaleItemDto[] = [];
    for (let i = 0; i < 40; i++) {
      const p = await product(`Bulk${i}`, 100, 50);
      await receive(p, 5);
      items.push(line(p, 2, 100));
    }
    const started = Date.now();
    const sale = await pos.createSale(tenantId, branchId, cashierA, dto(items, 8000, { clientRequestId: key() }));
    const elapsedMs = Date.now() - started;
    // eslint-disable-next-line no-console
    console.log(`PERF 40-line checkout: ${elapsedMs} ms`);
    expect(sale.total).toBe(8000);
    expect(elapsedMs).toBeLessThan(30_000); // SALE_TX_TIMEOUT_MS
    expect(await prisma.saleItem.count({ where: { saleId: sale.id } })).toBe(40);
  });

  it('CONNECTION POOL: 25 simultaneous checkouts (pool limit is 9) all complete - a checkout never borrows a second connection while holding one', async () => {
    const products: Seeded[] = [];
    for (let i = 0; i < 25; i++) { const p = await product(`Pool${i}`, 100, 50); await receive(p, 3); products.push(p); }
    const cashiers = [cashierA, cashierB, managerId];
    const started = Date.now();
    const results = await Promise.allSettled(
      products.map((p, i) => pos.createSale(tenantId, branchId, cashiers[i % 3], dto([line(p, 1, 100)], 100, { clientRequestId: key() }))),
    );
    const failed = results.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason?.message).slice(-160));
    // eslint-disable-next-line no-console
    console.log(`PERF 25 concurrent checkouts: ${Date.now() - started} ms, failures=${failed.length}`);
    expect(failed).toEqual([]);
    for (const p of products) expect(await onHand(p)).toBe(2);
  });
});
