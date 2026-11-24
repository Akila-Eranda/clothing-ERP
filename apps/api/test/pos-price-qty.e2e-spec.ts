/**
 * POS integration: server-side price guard, decimal quantities, FEFO lot deduction and
 * sale idempotency (clientRequestId).
 * Runs PosService against a real PostgreSQL database (DATABASE_URL), no Redis / Keycloak.
 * Schema must exist: `npx prisma db push --skip-generate` on an empty test database.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaymentMethod, ProductKind, RoleType, StockMovementType } from '@prisma/client';
import databaseConfig from '../src/config/database.config';
import appConfig from '../src/config/app.config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PosModule, PosService, CreateSaleDto, SaleItemDto } from '../src/modules/pos/pos.module';
import { InventoryService } from '../src/modules/inventory/inventory.service';

jest.setTimeout(60_000);

type Seeded = { variantId: string; productName: string };

describe('POS price guard & decimal quantities (integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let pos: PosService;
  let inventory: InventoryService;

  const run = Date.now().toString(36);
  let tenantId: string;
  let branchId: string;
  let cashierId: string;
  let managerId: string;
  let milk: Seeded;   // piece good: selling 100, cost 80, MRP 120
  let rice: Seeded;   // weighed (kg) with two lots
  let dhal: Seeded;   // weighed (kg) with 0.1 + 0.2 lots (float edge)
  let sugar: Seeded;  // piece good with lots for decimal-free FEFO check

  async function createRoleUser(name: string, type: RoleType) {
    const role = await prisma.role.create({ data: { tenantId, name: `${name}-${run}`, type } });
    const user = await prisma.user.create({
      data: {
        tenantId,
        branchId,
        email: `${name.toLowerCase()}-${run}@it.test`,
        passwordHash: 'not-used',
        firstName: name,
        lastName: 'IT',
        roles: { create: { roleId: role.id } },
      },
    });
    return user.id;
  }

  async function createProduct(opts: {
    name: string;
    sellingPrice: number;
    costPrice: number;
    mrp?: number;
    weighted?: boolean;
  }): Promise<Seeded> {
    const sku = `${opts.name.toUpperCase()}-${run}`;
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: opts.name,
        slug: `${opts.name.toLowerCase()}-${run}`,
        sku,
        sellingPrice: opts.sellingPrice,
        costPrice: opts.costPrice,
        mrp: opts.mrp ?? 0,
        unit: opts.weighted ? 'kg' : 'pcs',
        productKind: opts.weighted ? ProductKind.WEIGHTED : ProductKind.STANDARD,
        allowDecimalSelling: !!opts.weighted,
        variants: {
          create: {
            sku: `${sku}-V`,
            name: 'Default',
            sellingPrice: opts.sellingPrice,
            costPrice: opts.costPrice,
            mrp: opts.mrp ?? 0,
          },
        },
      },
      include: { variants: true },
    });
    return { variantId: product.variants[0].id, productName: opts.name };
  }

  async function receive(p: Seeded, quantity: number, unitCost: number, batch?: string, expiryInDays?: number) {
    await inventory.adjustStock(tenantId, branchId, managerId, {
      variantId: p.variantId,
      quantity,
      movementType: StockMovementType.PURCHASE,
      unitCost,
      batchNumber: batch,
      expiryDate:
        expiryInDays != null
          ? new Date(Date.now() + expiryInDays * 86_400_000).toISOString().slice(0, 10)
          : undefined,
    });
  }

  function line(p: Seeded, quantity: number, unitPrice: number, extra: Partial<SaleItemDto> = {}): SaleItemDto {
    return {
      variantId: p.variantId,
      productName: p.productName,
      variantName: 'Default',
      sku: 'SKU',
      quantity,
      unitPrice,
      costPrice: 1, // deliberately wrong: server must replace it with catalog cost
      ...extra,
    } as SaleItemDto;
  }

  function saleDto(items: SaleItemDto[], pay = 100_000): CreateSaleDto {
    return {
      items,
      payments: [{ method: PaymentMethod.CASH, amount: pay }],
      applyTierDiscount: false,
    } as CreateSaleDto;
  }

  const onHand = async (p: Seeded) =>
    (await prisma.inventory.findFirst({ where: { tenantId, variantId: p.variantId } }))?.quantity ?? 0;
  const lots = async (p: Seeded) =>
    prisma.inventoryLot.findMany({
      where: { tenantId, variantId: p.variantId },
      orderBy: { expiryDate: 'asc' },
      select: { batchNumber: true, quantity: true, isActive: true },
    });
  const saleCount = async () => prisma.sale.count({ where: { tenantId } });

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
      // Negative stock defaults to ON in production; the suite runs strict and toggles it where needed.
      data: {
        name: `IT Grocery ${run}`,
        subdomain: `it-${run}`,
        shopType: 'GROCERY',
        settings: { pos: { allowNegativeStock: false } },
      },
    });
    tenantId = tenant.id;
    branchId = (await prisma.branch.create({ data: { tenantId, name: 'Main', code: 'MAIN' } })).id;
    cashierId = await createRoleUser('Cashier', RoleType.CASHIER);
    managerId = await createRoleUser('Manager', RoleType.BRANCH_MANAGER);

    milk = await createProduct({ name: 'Milk', sellingPrice: 100, costPrice: 80, mrp: 120 });
    rice = await createProduct({ name: 'Rice', sellingPrice: 250, costPrice: 200, weighted: true });
    dhal = await createProduct({ name: 'Dhal', sellingPrice: 400, costPrice: 300, weighted: true });
    sugar = await createProduct({ name: 'Sugar', sellingPrice: 300, costPrice: 240, mrp: 320 });

    await receive(milk, 20, 80);
    await receive(rice, 2, 200, 'RICE-LATE', 30);
    await receive(rice, 0.3, 200, 'RICE-EARLY', 5);
    await receive(dhal, 0.1, 300, 'DHAL-A', 5);
    await receive(dhal, 0.2, 300, 'DHAL-B', 10);
    await receive(sugar, 3, 240, 'SUGAR-A', 5);
    await receive(sugar, 5, 240, 'SUGAR-B', 20);
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  describe('normal sales', () => {
    it('sells at catalog price, stores server cost, and deducts stock', async () => {
      const before = await onHand(milk);
      const sale = await pos.createSale(tenantId, branchId, cashierId, saleDto([line(milk, 2, 100)]));

      expect(sale.total).toBe(200);
      const item = await prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
      expect(item.unitPrice).toBe(100);
      expect(item.costPrice).toBe(80); // client sent 1
      expect(await onHand(milk)).toBe(before - 2);
    });

    it('allows a cashier price at MRP and a price cut down to cost', async () => {
      await expect(
        pos.createSale(tenantId, branchId, cashierId, saleDto([line(milk, 1, 120)])),
      ).resolves.toBeDefined();
      await expect(
        pos.createSale(tenantId, branchId, cashierId, saleDto([line(milk, 1, 80)])),
      ).resolves.toBeDefined();
    });

    it('stores no priceOverrides metadata on ordinary sales', async () => {
      const sale = await pos.createSale(tenantId, branchId, cashierId, saleDto([line(milk, 1, 100)]));
      const row = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
      expect((row.metadata as Record<string, unknown>).priceOverrides).toBeUndefined();
    });
  });

  describe('cashier price restrictions', () => {
    it('rejects a price below cost and leaves stock and sales untouched', async () => {
      const [stock, count] = [await onHand(milk), await saleCount()];
      await expect(
        pos.createSale(tenantId, branchId, cashierId, saleDto([line(milk, 1, 50)])),
      ).rejects.toThrow(/below cost LKR 80\.00/);
      expect(await onHand(milk)).toBe(stock);
      expect(await saleCount()).toBe(count);
    });

    it('a Cashier may apply a manual line discount without a manager approval (owner decision) as long as the net price stays above cost', async () => {
      const stock = await onHand(milk);
      const count = await saleCount();
      await pos.createSale(
        tenantId, branchId, cashierId,
        saleDto([line(milk, 2, 100, { discount: 10, discountType: 'FIXED' })]),
      );
      expect(await onHand(milk)).toBe(stock - 2);
      expect(await saleCount()).toBe(count + 1);
      // ...but a discount that pushes the net price below cost is still refused by the price guard
      await expect(
        pos.createSale(
          tenantId, branchId, cashierId,
          saleDto([line(milk, 2, 100, { discount: 50, discountType: 'FIXED' })]),
        ),
      ).rejects.toThrow(/below cost/);
      expect(await saleCount()).toBe(count + 1);
    });

    it('rejects a price above MRP', async () => {
      await expect(
        pos.createSale(tenantId, branchId, cashierId, saleDto([line(milk, 1, 150)])),
      ).rejects.toThrow(/above the allowed maximum LKR 120\.00/);
    });

    it('rejects a bogus price even when other lines are valid', async () => {
      await expect(
        pos.createSale(tenantId, branchId, cashierId, saleDto([line(milk, 1, 100), line(sugar, 1, 1)])),
      ).rejects.toThrow(/Sugar/);
    });
  });

  describe('manager overrides', () => {
    it('lets a branch manager sell below cost and records the override', async () => {
      const sale = await pos.createSale(tenantId, branchId, managerId, saleDto([line(milk, 1, 50)]));
      const row = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
      expect((row.metadata as { priceOverrides?: unknown[] }).priceOverrides).toEqual([
        { variantId: milk.variantId, kind: 'BELOW_COST', unitPrice: 50, limit: 80 },
      ]);
      const item = await prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
      expect(item.costPrice).toBe(80);
    });

    it('an authorised manager may sell above MRP with or without a reason; the sale and an audit record carry user, reason (when sent) and details', async () => {
      const count = await saleCount();
      const stock = await onHand(milk);
      // no reason asked for: the sale goes through and is still audited (reason empty)
      const noReason = await pos.createSale(tenantId, branchId, managerId, saleDto([line(milk, 1, 130)]));
      expect(await saleCount()).toBe(count + 1);
      expect(await onHand(milk)).toBe(stock - 1);
      const noReasonAudit = await prisma.auditLog.findMany({ where: { tenantId, resource: 'SalePriceOverride', resourceId: noReason.id } });
      expect(noReasonAudit).toHaveLength(1);
      expect(noReasonAudit[0].newData).toMatchObject({ kind: 'ABOVE_MAX_PRICE', reason: '' });

      const sale = await pos.createSale(tenantId, branchId, managerId, { ...saleDto([line(milk, 1, 130)]), priceOverrideReason: ' price tag misprinted ' } as CreateSaleDto);
      const row = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
      const overrides = (row.metadata as { priceOverrides?: Array<{ kind: string; overriddenBy?: string; reason?: string }> }).priceOverrides;
      expect(overrides?.[0]).toMatchObject({ kind: 'ABOVE_MAX_PRICE', overriddenBy: managerId, reason: 'price tag misprinted' });
      const audit = await prisma.auditLog.findMany({ where: { tenantId, resource: 'SalePriceOverride', resourceId: sale.id } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ userId: managerId, action: 'APPROVE' });
      expect(audit[0].newData).toMatchObject({
        kind: 'ABOVE_MAX_PRICE', invoiceNumber: sale.invoiceNumber, branchId, saleTotal: 130, reason: 'price tag misprinted',
        lines: [{ variantId: milk.variantId, unitPrice: 130, maximumPrice: 120 }],
      });
    });

    it('a Cashier still cannot sell above MRP, even when sending a reason; nothing is written or audited', async () => {
      const count = await saleCount();
      await expect(
        pos.createSale(tenantId, branchId, cashierId, { ...saleDto([line(milk, 1, 130)]), priceOverrideReason: 'please' } as CreateSaleDto),
      ).rejects.toThrow(/above the allowed maximum/);
      expect(await saleCount()).toBe(count);
    });

    it('a below-cost manager override keeps its existing behaviour (no reason needed, no MRP audit row)', async () => {
      const before = await prisma.auditLog.count({ where: { tenantId, resource: 'SalePriceOverride' } });
      const sale = await pos.createSale(tenantId, branchId, managerId, saleDto([line(milk, 1, 50)]));
      expect(sale.id).toBeTruthy();
      expect(await prisma.auditLog.count({ where: { tenantId, resource: 'SalePriceOverride' } })).toBe(before);
    });
  });

  describe('decimal quantities & FEFO lots', () => {
    it('sells 0.5 kg FEFO: drains the early lot (0.3) then takes 0.2 from the later lot', async () => {
      expect(await onHand(rice)).toBe(2.3);
      const sale = await pos.createSale(tenantId, branchId, cashierId, saleDto([line(rice, 0.5, 250)]));

      expect(sale.total).toBe(125);
      expect(await onHand(rice)).toBe(1.8);
      expect(await lots(rice)).toEqual([
        { batchNumber: 'RICE-EARLY', quantity: 0, isActive: false },
        { batchNumber: 'RICE-LATE', quantity: 1.8, isActive: true },
      ]);
      const allocations = await prisma.inventoryLog.findMany({
        where: { tenantId, referenceId: sale.id, notes: 'LOT_ALLOCATION' },
        select: { quantityChange: true, batchNumber: true },
        orderBy: { quantityChange: 'asc' },
      });
      expect(allocations).toEqual([
        { quantityChange: -0.3, batchNumber: 'RICE-EARLY' },
        { quantityChange: -0.2, batchNumber: 'RICE-LATE' },
      ]);
    });

    it('sells exactly 0.3 kg across 0.1 + 0.2 lots with no float leftovers', async () => {
      await pos.createSale(tenantId, branchId, cashierId, saleDto([line(dhal, 0.3, 400)]));
      expect(await onHand(dhal)).toBe(0);
      expect((await lots(dhal)).map((l) => [l.quantity, l.isActive])).toEqual([
        [0, false],
        [0, false],
      ]);
    });

    it('rejects selling more kg than is on hand when negative stock is off', async () => {
      await expect(
        pos.createSale(tenantId, branchId, cashierId, saleDto([line(dhal, 0.001, 400)])),
      ).rejects.toThrow(/Insufficient stock/);
      expect(await onHand(dhal)).toBe(0);
    });

    it('still allows overselling when the tenant enables negative stock (production default)', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { settings: { pos: { allowNegativeStock: true } } } });
      try {
        await pos.createSale(tenantId, branchId, cashierId, saleDto([line(dhal, 0.25, 400)]));
        expect(await onHand(dhal)).toBe(-0.25);
        await receive(dhal, 0.25, 300); // restore to zero for later tests
        expect(await onHand(dhal)).toBe(0);
      } finally {
        await prisma.tenant.update({ where: { id: tenantId }, data: { settings: { pos: { allowNegativeStock: false } } } });
      }
    });

    it('weighed goods no longer bypass the price floor: a bare "qty 1 at LKR 100" rice line (cost 200/kg) is refused for a Cashier', async () => {
      const stock = await onHand(rice);
      const count = await saleCount();
      await expect(
        pos.createSale(tenantId, branchId, cashierId, saleDto([line(rice, 1, 100)])),
      ).rejects.toThrow(/below cost LKR 200\.00/);
      expect(await onHand(rice)).toBe(stock);
      expect(await saleCount()).toBe(count);
    });

    it('a genuine price-embedded scale label (LKR 100 = 0.4 kg @ 250) is accepted with its barcode evidence; wrong evidence is refused', async () => {
      await prisma.productVariant.update({ where: { id: rice.variantId }, data: { barcode: '12345' } });
      const check = (twelve: string) => {
        const sum = twelve.split('').map(Number).reduce((x, d, i) => x + d * (i % 2 === 0 ? 1 : 3), 0);
        return `${twelve}${(10 - (sum % 10)) % 10}`;
      };
      const label = check('201234510000');                // PLU 12345, embedded value 10000 -> LKR 100.00
      const forged = check('201234510100');               // value 101.00 does not divide to a 3-decimal quantity at 250
      const before = await onHand(rice);
      await expect(
        pos.createSale(tenantId, branchId, cashierId, saleDto([line(rice, 0.4, 250, { scaleBarcodes: [forged] })])),
      ).rejects.toThrow(BadRequestException);
      expect(await onHand(rice)).toBe(before);
      await expect(
        pos.createSale(tenantId, branchId, cashierId, saleDto([line(rice, 1, 250, { scaleBarcodes: [label] })])),
      ).rejects.toThrow(/quantity does not match/);       // claimed quantity must equal the label's
      expect(await onHand(rice)).toBe(before);
      await expect(
        pos.createSale(tenantId, branchId, cashierId, saleDto([line(rice, 0.4, 250, { scaleBarcodes: [label] })])),
      ).resolves.toBeDefined();
      expect(await onHand(rice)).toBeCloseTo(before - 0.4, 6);
    });

    it('deducts piece goods from lots FEFO as before', async () => {
      await pos.createSale(tenantId, branchId, cashierId, saleDto([line(sugar, 4, 300)]));
      expect((await lots(sugar)).map((l) => [l.batchNumber, l.quantity])).toEqual([
        ['SUGAR-A', 0],
        ['SUGAR-B', 4],
      ]);
    });
  });

  describe('sale idempotency (clientRequestId)', () => {
    const key = (label: string) => `it-${run}-${label}`;
    const withKey = (dto: CreateSaleDto, k: string) => ({ ...dto, clientRequestId: k }) as CreateSaleDto;
    const completedEvents = () =>
      emitSpy.mock.calls.filter(([event]) => event === 'pos.sale.completed').length;
    let emitSpy: jest.SpyInstance;

    beforeAll(() => {
      emitSpy = jest.spyOn(moduleRef.get(EventEmitter2), 'emit');
    });
    afterAll(() => emitSpy.mockRestore());

    it('returns the original sale on retry without charging or deducting stock twice', async () => {
      const k = key('retry');
      const [stock, count, events] = [await onHand(milk), await saleCount(), completedEvents()];

      const first = await pos.createSale(tenantId, branchId, cashierId, withKey(saleDto([line(milk, 2, 100)]), k));
      const second = await pos.createSale(tenantId, branchId, cashierId, withKey(saleDto([line(milk, 2, 100)]), k));

      expect(second.id).toBe(first.id);
      expect(second.invoiceNumber).toBe(first.invoiceNumber);
      expect((second as { idempotentReplay?: boolean }).idempotentReplay).toBe(true);
      expect((first as { idempotentReplay?: boolean }).idempotentReplay).toBeUndefined();
      expect(second.items).toHaveLength(1);
      expect(second.payments).toHaveLength(1);
      expect(await saleCount()).toBe(count + 1);
      expect(await onHand(milk)).toBe(stock - 2);
      expect(await prisma.salePayment.count({ where: { saleId: first.id } })).toBe(1);
      expect(completedEvents()).toBe(events + 1);
    });

    it('creates exactly one sale when the same request races in parallel', async () => {
      const k = key('race');
      // Warm the INVOICE number series: its first-ever creation has its own (pre-existing) race.
      await pos.createSale(tenantId, branchId, cashierId, saleDto([line(milk, 1, 100)]));
      const [stock, count] = [await onHand(milk), await saleCount()];

      const results = await Promise.all(
        [1, 2, 3].map(() =>
          pos.createSale(tenantId, branchId, cashierId, withKey(saleDto([line(milk, 1, 100)]), k)),
        ),
      );

      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(await saleCount()).toBe(count + 1);
      expect(await onHand(milk)).toBe(stock - 1);
      expect(await prisma.sale.count({ where: { tenantId, clientRequestId: k } })).toBe(1);
    });

    it('rejects reusing a key for a different cart with 409', async () => {
      const k = key('reuse');
      await pos.createSale(tenantId, branchId, cashierId, withKey(saleDto([line(milk, 1, 100)]), k));
      const count = await saleCount();
      await expect(
        pos.createSale(tenantId, branchId, cashierId, withKey(saleDto([line(milk, 3, 100)]), k)),
      ).rejects.toThrow(ConflictException);
      expect(await saleCount()).toBe(count);
    });

    it('rejects a key already used by another cashier with 409', async () => {
      const k = key('cashier');
      await pos.createSale(tenantId, branchId, cashierId, withKey(saleDto([line(milk, 1, 100)]), k));
      await expect(
        pos.createSale(tenantId, branchId, managerId, withKey(saleDto([line(milk, 1, 100)]), k)),
      ).rejects.toThrow(/another cashier/);
    });

    it('does not burn the key when the first attempt fails validation', async () => {
      const k = key('fix');
      await expect(
        pos.createSale(tenantId, branchId, cashierId, withKey(saleDto([line(milk, 1, 10)]), k)),
      ).rejects.toThrow(/below cost/);
      const sale = await pos.createSale(tenantId, branchId, cashierId, withKey(saleDto([line(milk, 1, 100)]), k));
      expect(sale.clientRequestId).toBe(k);
    });

    it('keeps old behaviour when no key is sent (two identical submits = two sales)', async () => {
      const count = await saleCount();
      await pos.createSale(tenantId, branchId, cashierId, saleDto([line(milk, 1, 100)]));
      await pos.createSale(tenantId, branchId, cashierId, saleDto([line(milk, 1, 100)]));
      expect(await saleCount()).toBe(count + 2);
    });

    it('validates the key format at the DTO layer', async () => {
      const errors = async (clientRequestId: unknown) =>
        (await validate(plainToInstance(CreateSaleDto, { items: [], payments: [], clientRequestId })))
          .map((e) => e.property);
      expect(await errors('3f2b8c1e-9a4d-4c7e-8b1a-2d3e4f5a6b7c')).not.toContain('clientRequestId');
      expect(await errors(undefined)).not.toContain('clientRequestId');
      expect(await errors('bad key!')).toContain('clientRequestId');
      expect(await errors('x'.repeat(65))).toContain('clientRequestId');
    });
  });

  describe('returns & receiving with decimals', () => {
    it('returns 0.25 kg into stock (against the original sale, with a clientRequestId)', async () => {
      const sale = await pos.createSale(tenantId, branchId, cashierId, saleDto([line(rice, 0.25, 250)]));
      const afterSale = await onHand(rice);
      const returnDto = {
        clientRequestId: `pq-ret-${Date.now().toString(36)}`,
        originalSaleId: sale.id,
        items: [{ variantId: rice.variantId, quantity: 0.25, unitPrice: 250, productName: 'Rice', variantName: 'Default', sku: 'SKU' }],
        reason: 'DEFECTIVE',
        refundMethod: 'CASH',
      };
      await pos.processReturn(tenantId, branchId, { id: cashierId, roles: ['CASHIER'] }, returnDto as never);
      expect(await onHand(rice)).toBe(afterSale + 0.25);
      // the same request again changes nothing (idempotent replay)
      await pos.processReturn(tenantId, branchId, { id: cashierId, roles: ['CASHIER'] }, returnDto as never);
      expect(await onHand(rice)).toBe(afterSale + 0.25);
    });

    it('receives 12.5 kg into a new lot', async () => {
      await receive(dhal, 12.5, 300, 'DHAL-C', 60);
      expect(await onHand(dhal)).toBe(12.5);
      expect((await lots(dhal)).find((l) => l.batchNumber === 'DHAL-C')?.quantity).toBe(12.5);
    });
  });
});
