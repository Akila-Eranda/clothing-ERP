/**
 * createSale / PosController wiring for audit fixes P-F1, P-F2, P-F9, P-F10, P-F18 — no database:
 * PosService runs against an in-memory recording fake of the Prisma client.
 */
import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentMethod, RoleType } from '@prisma/client';
import { PERMISSIONS_KEY, ANY_PERMISSIONS_KEY } from '@/common/decorators/permissions.decorator';
import { calculateCartTotals } from '@/modules/pricing/pricing.helper';
import { CreateSaleDto, PosController, PosService } from './pos.module';

type Call = { model: string; method: string; args: any };

/** Recording fake: findMany -> [], findFirst -> null, create -> { id, ...data }, deleteMany -> { count: 1 }. */
function fakeDb(handlers: Record<string, (args: any) => any> = {}) {
  const calls: Call[] = [];
  let seq = 0;
  const defaults = (method: string, args: any) => {
    switch (method) {
      case 'findMany': return [];
      case 'findFirst': case 'findUnique': return null;
      case 'count': return 0;
      case 'aggregate': return { _sum: {} };
      case 'create': case 'update': case 'upsert': return { id: `fake-${++seq}`, ...(args?.data ?? args?.create ?? {}) };
      case 'updateMany': case 'deleteMany': case 'createMany': return { count: 1 };
      case 'delete': return { id: args?.where?.id };
      default: return undefined;
    }
  };
  const db: any = new Proxy({}, {
    get(_t, model: string) {
      if (model === 'calls') return calls;
      if (model === 'then') return undefined;
      if (model === '$transaction') return async (fn: any) => (typeof fn === 'function' ? fn(db) : Promise.all(fn));
      if (model === '$queryRaw' || model === '$executeRaw') {
        return async (args: any) => {
          calls.push({ model, method: 'call', args });
          const h = handlers[model];
          return h ? h(args) : [];
        };
      }
      return new Proxy({}, {
        get(_m, method: string) {
          if (method === 'then') return undefined;
          return async (args: any) => {
            calls.push({ model, method, args });
            const h = handlers[`${model}.${method}`];
            return h ? h(args) : defaults(method, args);
          };
        },
      });
    },
  });
  return db as any;
}

const MILK = {
  id: 'v-milk', sellingPrice: 200, costPrice: 150, mrp: 220,
  product: { sellingPrice: 200, wholesalePrice: 0, costPrice: 150, mrp: 220, productKind: 'STANDARD', unit: 'pcs' },
};
const CUSTOMER = { id: 'cust-1', firstName: 'Ann', lastName: null, loyaltyPoints: 0, walletBalance: 10_000, creditLimit: 0, creditBalance: 0, creditDays: 30, tier: 'BRONZE' };

function makeService(handlers: Record<string, (args: any) => any> = {}) {
  const prisma = fakeDb({
    'productVariant.findMany': () => [MILK],
    'customer.findFirst': () => CUSTOMER,
    ...handlers,
  });
  const inventory = {
    assertSaleStockAvailable: jest.fn(async () => undefined),
    releaseReservations: jest.fn(async () => ({ released: 0 })),
    expandSaleStockItems: jest.fn(async () => []),
    adjustStock: jest.fn(async () => undefined),
  };
  const numbering = { isEngineEnabled: () => true, allocate: jest.fn(async () => 'INV-0001') };
  const pricing = {
    calculateCheckout: jest.fn(async (_t: string, input: any) => ({ ...calculateCartTotals(input), promotionId: null, couponName: null })),
    recordCouponUsage: jest.fn(),
  };
  const events = { emit: jest.fn() };
  const svc = new PosService(prisma, inventory as any, numbering as any, pricing as any, events as any, {} as any, {} as any);
  return { svc, prisma, inventory, events };
}

const milkLine = (unitPrice = 200, extra: object = {}) => ({
  variantId: 'v-milk', productName: 'Milk', variantName: 'Default', sku: 'MILK', quantity: 1, unitPrice, costPrice: 1, ...extra,
});
const dto = (over: Partial<CreateSaleDto> & Record<string, unknown> = {}) =>
  ({ items: [milkLine()], payments: [{ method: PaymentMethod.CASH, amount: 200 }], applyTierDiscount: false, ...over }) as CreateSaleDto;
const writes = (prisma: any) =>
  (prisma.calls as Call[]).filter((c) => /^(create|update|upsert|delete|deleteMany|updateMany|createMany)$/.test(c.method));

describe('createSale security guards', () => {
  describe('P-F1 reloadType on a catalog line', () => {
    it('refuses a catalog line flagged reloadType (LKR 1 milk) with 400 before any write', async () => {
      const { svc, prisma, events } = makeService();
      await expect(svc.createSale('t1', 'b1', 'c1', dto({ items: [milkLine(1, { reloadType: 'DIGITAL' })] as any })))
        .rejects.toThrow(/cannot be sold as a reload/);
      expect(writes(prisma)).toEqual([]);
      expect(events.emit).not.toHaveBeenCalled();
    });
    it('CONTROL: the same LKR 1 line without reloadType is refused by the price guard', async () => {
      const { svc } = makeService();
      await expect(svc.createSale('t1', 'b1', 'c1', dto({ items: [milkLine(1)] as any }))).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('P-F2 bill discount cap', () => {
    it('refuses discountAmount 100 000 on a 200 bill with 400 before any write', async () => {
      const { svc, prisma } = makeService();
      await expect(svc.createSale('t1', 'b1', 'c1', dto({ discountAmount: 100_000, payments: [{ method: PaymentMethod.CASH, amount: 0 }] as any })))
        .rejects.toThrow(/discount approval policy/);
      expect(writes(prisma)).toEqual([]);
    });

    describe('P-F19 gift voucher redemption', () => {
      it('aggregates repeated voucher payment lines and redeems under a transaction row lock', async () => {
        const { svc, prisma } = makeService({
          $queryRaw: () => [{
            id: 'voucher-1',
            balance: 200,
            status: 'ACTIVE',
            expiresAt: null,
          }],
        });
        await svc.createSale('t1', 'b1', 'c1', dto({
          payments: [
            { method: PaymentMethod.GIFT_VOUCHER, amount: 100, reference: 'same-code' },
            { method: PaymentMethod.GIFT_VOUCHER, amount: 100, reference: 'SAME-CODE' },
          ],
        }));
        const locks = (prisma.calls as Call[]).filter((c) => c.model === '$queryRaw');
        expect(locks).toHaveLength(1);
        const voucherUpdate = (prisma.calls as Call[]).find(
          (c) => c.model === 'giftVoucher' && c.method === 'updateMany',
        );
        expect(voucherUpdate?.args.where).toEqual(expect.objectContaining({
          id: 'voucher-1',
          tenantId: 't1',
          balance: { gte: 200 },
        }));
      });
    });

    it('blocks a normal cashier discount before pricing or any write', async () => {
      const { svc, prisma } = makeService();
      await expect(svc.createSale('t1', 'b1', 'c1', dto({ discountAmount: 10 })))
        .rejects.toThrow(/discount approval policy/);
      expect(writes(prisma)).toEqual([]);
    });

    it('keeps the approved owner bypass subject to the existing bill cap', async () => {
      const { svc } = makeService({
        'userRole.findMany': () => [{ role: { type: RoleType.TENANT_ADMIN } }],
      });
      await expect(svc.createSale('t1', 'b1', 'admin', dto({
        discountAmount: 100_000,
        payments: [{ method: PaymentMethod.CASH, amount: 0 }],
      }))).rejects.toThrow(/more than the bill/);
    });

    it('blocks line discounts and held-bill resume cannot bypass authorization', async () => {
      const { svc, prisma } = makeService();
      await expect(svc.createSale('t1', 'b1', 'c1', dto({
        heldBillId: 'held-1',
        items: [milkLine(200, { discount: 10 })] as any,
      }))).rejects.toThrow(/discount approval policy/);
      expect(writes(prisma)).toEqual([]);
    });
  });

  describe('P-F10 held bill checked out with the sale', () => {
    it('a heldBillId this cashier may not use (other tenant / branch / cashier) -> 404 before any write', async () => {
      const { svc, prisma, inventory } = makeService();
      await expect(svc.createSale('t1', 'b1', 'c1', dto({ heldBillId: 'held-of-shop-b' }))).rejects.toBeInstanceOf(NotFoundException);
      const lookup = (prisma.calls as Call[]).find((c) => c.model === 'heldBill' && c.method === 'findFirst');
      expect(lookup?.args.where).toEqual({ id: 'held-of-shop-b', tenantId: 't1', branchId: 'b1', cashierId: 'c1' });
      expect(writes(prisma)).toEqual([]);
      expect(inventory.releaseReservations).not.toHaveBeenCalled();
    });

    it('deleteHeldBill scopes the lookup to the active branch and releases inside the transaction', async () => {
      const { svc, prisma, inventory } = makeService({
        'branch.findFirst': () => ({ id: 'b1' }),
        'heldBill.findFirst': () => ({ id: 'h1', branchId: 'b1' }),
      });
      await svc.deleteHeldBill('h1', 't1', 'b1', { cashierId: 'c1' });
      const lookup = (prisma.calls as Call[]).find((c) => c.model === 'heldBill' && c.method === 'findFirst');
      expect(lookup?.args.where).toEqual({ id: 'h1', tenantId: 't1', branchId: 'b1', cashierId: 'c1' });
      expect(inventory.releaseReservations).toHaveBeenCalledWith('t1', 'HELD_BILL', 'h1', false, expect.anything());
    });

    it('manager scope: any hold of the branch, still tenant + branch scoped', async () => {
      const { svc, prisma } = makeService();
      await expect(svc.createSale('t1', 'b1', 'c1', dto({ heldBillId: 'h1' }), undefined, { scopeAll: true })).rejects.toBeInstanceOf(NotFoundException);
      const lookup = (prisma.calls as Call[]).find((c) => c.model === 'heldBill' && c.method === 'findFirst');
      expect(lookup?.args.where).toEqual({ id: 'h1', tenantId: 't1', branchId: 'b1' });
    });

    it('own hold: sale completes and the hold is removed with a scoped deleteMany (never delete-by-id)', async () => {
      const { svc, prisma, inventory } = makeService({ 'heldBill.findFirst': () => ({ id: 'h-own' }) });
      await svc.createSale('t1', 'b1', 'c1', dto({ heldBillId: 'h-own' }));
      const heldWrites = writes(prisma).filter((c) => c.model === 'heldBill');
      expect(heldWrites).toEqual([{ model: 'heldBill', method: 'deleteMany', args: { where: { id: 'h-own', tenantId: 't1', branchId: 'b1', cashierId: 'c1' } } }]);
      expect(inventory.releaseReservations).toHaveBeenCalledWith('t1', 'HELD_BILL', 'h-own', true, expect.anything());
    });
  });

  describe('P-F18 customer ledger descriptions use the created invoice number', () => {
    it('wallet / loyalty rows say "INV-0001", never "null" (numbering engine on)', async () => {
      const { svc, prisma } = makeService();
      await svc.createSale('t1', 'b1', 'c1', dto({
        customerId: 'cust-1',
        items: [milkLine(200, { quantity: 1 })] as any,
        payments: [{ method: PaymentMethod.WALLET, amount: 200 }] as any,
      }));
      const descs = (prisma.calls as Call[])
        .filter((c) => ['walletTransaction', 'loyaltyTransaction', 'customerCreditTransaction'].includes(c.model) && c.method === 'create')
        .map((c) => c.args.data.description);
      expect(descs.length).toBeGreaterThan(0);
      for (const d of descs) {
        expect(d).toContain('INV-0001');
        expect(d).not.toContain('null');
      }
    });
  });

  describe('customer account balances with ordinary tenders', () => {
    it.each([
      ['cash', { method: PaymentMethod.CASH, amount: 200 }],
      ['card', { method: PaymentMethod.CARD, amount: 200, cardLast4: '1234' }],
      ['bank transfer', { method: PaymentMethod.BANK_TRANSFER, amount: 200, bankAccountId: 'bank-1' }],
      ['QR', { method: PaymentMethod.QR, amount: 200, bankAccountId: 'bank-1' }],
    ])('%s checkout does not mutate wallet or credit balances', async (_label, payment) => {
      const bankHandlers: Record<string, (args: any) => any> =
        payment.method === PaymentMethod.BANK_TRANSFER || payment.method === PaymentMethod.QR
          ? {
              'bankAccount.findMany': () => [{ id: 'bank-1', name: 'Main', code: 'MAIN' }],
              'bankAccount.count': () => 1,
            }
          : {};
      const { svc, prisma } = makeService(bankHandlers);

      await svc.createSale('t1', 'b1', 'c1', dto({
        customerId: 'cust-1',
        payments: [payment] as CreateSaleDto['payments'],
      }));

      const update = (prisma.calls as Call[]).find(
        (call) => call.model === 'customer' && call.method === 'updateMany',
      );
      expect(update?.args.data).not.toHaveProperty('walletBalance');
      expect(update?.args.data).not.toHaveProperty('creditBalance');
      expect((prisma.calls as Call[]).some(
        (call) =>
          ['walletTransaction', 'customerCreditTransaction'].includes(call.model) &&
          call.method === 'create',
      )).toBe(false);
    });
  });

  it('uses wallet first for Credit / Wallet and charges the remainder to customer credit', async () => {
    const { svc, prisma } = makeService({
      'customer.findFirst': () => ({ ...CUSTOMER, walletBalance: 50, creditLimit: 500 }),
    });

    await svc.createSale('t1', 'b1', 'c1', dto({
      customerId: 'cust-1',
      payments: [{ method: PaymentMethod.CUSTOMER_CREDIT, amount: 200 }],
    }));

    const customerUpdate = (prisma.calls as Call[]).find(
      (call) => call.model === 'customer' && call.method === 'updateMany',
    );
    expect(customerUpdate?.args.data.walletBalance).toEqual({ increment: -50 });
    expect(customerUpdate?.args.data.creditBalance).toEqual({ increment: 150 });
    const saleCreate = (prisma.calls as Call[]).find(
      (call) => call.model === 'sale' && call.method === 'create',
    );
    expect(saleCreate?.args.data.payments.create).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: PaymentMethod.WALLET, amount: 50 }),
      expect.objectContaining({ method: PaymentMethod.CUSTOMER_CREDIT, amount: 150 }),
    ]));
    expect((prisma.calls as Call[]).find(
      (call) => call.model === 'walletTransaction' && call.method === 'create',
    )?.args.data).toMatchObject({ amount: -50, type: 'SALE_DEBIT', tenantId: 't1' });
    expect((prisma.calls as Call[]).find(
      (call) => call.model === 'customerCreditTransaction' && call.method === 'create',
    )?.args.data).toMatchObject({ amount: 150, type: 'CHARGE', tenantId: 't1' });
  });
});

describe('PosController permission metadata (P-F9)', () => {
  const perms = (handler: string) => [
    ...(Reflect.getMetadata(PERMISSIONS_KEY, (PosController.prototype as any)[handler]) ?? []),
    ...(Reflect.getMetadata(ANY_PERMISSIONS_KEY, (PosController.prototype as any)[handler]) ?? []),
  ];
  it.each([
    ['holdBill', 'sales:create'],
    ['getHeldBills', 'sales:read'],
    ['deleteHeldBill', 'sales:create'],
    ['getProducts', 'products:read'],
    ['lookupBarcode', 'products:read'],
    ['validateCoupon', 'sales:create'],
    ['createSale', 'sales:create'],
  ])('%s requires %s', (handler, perm) => {
    expect(perms(handler)).toEqual([perm]);
  });

  it('holdBill refuses an invalid payload (quantity 0) before any write', async () => {
    const { svc, prisma } = makeService();
    await expect(svc.holdBill('t1', 'b1', 'c1', { data: { items: [{ variantId: 'v-milk', quantity: 0 }] } } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(writes(prisma)).toEqual([]);
  });
});
