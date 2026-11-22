/**
 * QA-007: custom / "demo product" lines at POS checkout. They are bill-only (non-stock) lines by design
 * (SaleItemDto.isCustom doc, SaleItem.variantId nullable): no stock check, no stock movement, no catalog price
 * guard. Because the price guard does not apply to them, only a manager / admin may sell one (P-F1).
 * No database: PosService runs against an in-memory recording fake of the Prisma client.
 */
import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { PaymentMethod, RoleType } from '@prisma/client';
import { calculateCartTotals } from '@/modules/pricing/pricing.helper';
import { CreateSaleDto, PosService, SALE_TX_MAX_WAIT_MS, SALE_TX_TIMEOUT_MS } from './pos.module';

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
      if (model === '$transaction') return async (fn: any, opts?: any) => { calls.push({ model: '$transaction', method: 'options', args: opts }); return typeof fn === 'function' ? fn(db) : Promise.all(fn); };
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


const CUSTOMER = { id: 'cust-1', firstName: 'Ann', lastName: null, loyaltyPoints: 0, walletBalance: 10_000, creditLimit: 0, creditBalance: 0, creditDays: 30, tier: 'BRONZE' };
const MILK = {
  id: 'v-milk', sellingPrice: 200, costPrice: 150, mrp: 220,
  product: { sellingPrice: 200, wholesalePrice: 0, costPrice: 150, mrp: 220, productKind: 'STANDARD', unit: 'pcs' },
};
function makeService(handlers: Record<string, (args: any) => any> = {}) {
  const prisma = fakeDb({
    'productVariant.findMany': () => [MILK],
    'customer.findFirst': () => CUSTOMER,
    ...handlers,
  });
  const inventory = {
    assertSaleStockAvailable: jest.fn(async (..._a: any[]) => undefined),
    releaseReservations: jest.fn(async () => ({ released: 0 })),
    expandSaleStockItems: jest.fn(async (_t: string, items: any[]) => items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }))),
    adjustStock: jest.fn(async (..._a: any[]) => undefined),
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


/** Exactly what the POS "Demo Product" panel + checkout payload send (pos-overlay.tsx payload builder). */
const demoLine = (over: object = {}) => ({
  isCustom: true, productName: 'Demo cake', variantName: '', sku: 'CUSTOM', quantity: 2, unitPrice: 500, costPrice: 0,
  discount: 0, discountType: 'FIXED', taxRate: 0, ...over,
});
const sale = (items: object[], total: number) =>
  ({ items, payments: [{ method: PaymentMethod.CASH, amount: total }], applyTierDiscount: false }) as unknown as CreateSaleDto;
const adminRoles = { 'userRole.findMany': () => [{ role: { type: RoleType.TENANT_ADMIN } }] };
const writes = (prisma: any) => (prisma.calls as Call[]).filter((c) => /^(create|update|upsert|delete|deleteMany|updateMany|createMany)$/.test(c.method));

describe('QA-007 custom / demo items at checkout', () => {
  it('manager/admin: a demo item sells as a bill-only line — no stock check, no stock movement, null variant', async () => {
    const { svc, prisma, inventory, events } = makeService(adminRoles);
    await svc.createSale('t1', 'b1', 'admin', sale([demoLine()], 1000));
    expect(inventory.assertSaleStockAvailable).toHaveBeenCalledWith('t1', 'b1', [], undefined, expect.anything());
    expect(inventory.adjustStock).not.toHaveBeenCalled();
    const created = (prisma.calls as Call[]).find((c) => c.model === 'sale' && c.method === 'create')!;
    const line = created.args.data.items.create[0];
    expect(line.variantId).toBeNull();
    expect(line.sku).toBe('CUSTOM');
    expect(line.total).toBe(1000);
    expect(events.emit).toHaveBeenCalledWith('pos.sale.completed', expect.objectContaining({ total: 1000 }));
  });

  it('mixed cart: the catalog line is still stock-checked and deducted; only the demo line is exempt', async () => {
    const { svc, inventory } = makeService(adminRoles);
    const milk = { variantId: 'v-milk', productName: 'Milk', variantName: 'Default', sku: 'MILK', quantity: 1, unitPrice: 200, costPrice: 1 };
    await svc.createSale('t1', 'b1', 'admin', sale([milk, demoLine({ quantity: 1, unitPrice: 300 })], 500));
    expect(inventory.assertSaleStockAvailable).toHaveBeenCalledWith('t1', 'b1', [{ variantId: 'v-milk', quantity: 1 }], undefined, expect.anything());
    expect(inventory.adjustStock).toHaveBeenCalledTimes(1);
    expect(inventory.adjustStock.mock.calls[0][3]).toEqual(expect.objectContaining({ variantId: 'v-milk', quantity: 1 }));
  });

  it('a normal cashier is refused (403) before any write — by design, the price guard does not cover custom lines', async () => {
    const { svc, prisma } = makeService();
    await expect(svc.createSale('t1', 'b1', 'c1', sale([demoLine()], 1000))).rejects.toBeInstanceOf(ForbiddenException);
    expect(writes(prisma)).toEqual([]);
  });

  it('a catalog variant id cannot be smuggled in as a custom line to skip stock and price checks', async () => {
    const { svc } = makeService(adminRoles);
    await expect(svc.createSale('t1', 'b1', 'admin', sale([demoLine({ variantId: 'v-milk' })], 1000)))
      .rejects.toThrow(/cannot be submitted as a custom bill item/);
  });

  it('QA-005: the sale transaction runs with explicit limits above the 5 s Prisma default', async () => {
    const { svc, prisma } = makeService(adminRoles);
    await svc.createSale('t1', 'b1', 'admin', sale([demoLine()], 1000));
    const opts = (prisma.calls as Call[]).find((c) => c.model === '$transaction' && c.method === 'options')!.args;
    expect(opts).toEqual({ maxWait: SALE_TX_MAX_WAIT_MS, timeout: SALE_TX_TIMEOUT_MS });
    expect(SALE_TX_TIMEOUT_MS).toBeGreaterThan(5000);
  });
});
