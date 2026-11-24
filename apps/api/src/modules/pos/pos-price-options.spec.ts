import { PosService } from './pos.module';

/**
 * The POS screen and the checkout price guard must agree on which purchase-order selling prices exist.
 * Before: both used one shared row cap, so a busy variant in the cart could hide another variant's PO price and a
 * price the screen had offered (e.g. LKR 250) was refused at checkout as "above the allowed maximum".
 */
describe('POS purchase-order price options', () => {
  function service(rows: unknown[]) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const svc = Object.create(PosService.prototype) as PosService;
    (svc as unknown as { prisma: unknown }).prisma = { purchaseOrderItem: { findMany } };
    return { svc, findMany };
  }
  const row = (variantId: string, unitCost: number, sellingPrice: number, day: number) => ({
    variantId,
    unitCost,
    sellingPrice,
    mrp: null,
    purchase: { poNumber: `PO-${day}`, orderDate: new Date(Date.UTC(2026, 10, day)) },
  });

  it('reads distinct (variant, cost, price) rows and does not use a tiny shared row cap', async () => {
    const { svc, findMany } = service([]);
    await svc.attachPurchasePriceOptions('t1', ['a', 'b']);
    const args = findMany.mock.calls[0][0];
    expect(args.distinct).toEqual(['variantId', 'unitCost', 'sellingPrice']);
    expect(args.take).toBeGreaterThanOrEqual(2 * 100);
  });

  it('screen view keeps the newest 6 options per variant', async () => {
    const rows = Array.from({ length: 9 }, (_, i) => row('a', 100 + i, 200 + i, 20 - i));
    const { svc } = service(rows);
    const out = await svc.attachPurchasePriceOptions('t1', ['a']);
    expect(out.get('a')).toHaveLength(6);
  });

  it('price guard view keeps every distinct selling price, including old ones the screen may offer', async () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => row('a', 100 + i, 200 + i, 20 - i)),
      row('a', 130, 250, 1), // oldest PO line, sells at 250
    ];
    const { svc } = service(rows);
    const out = await svc.attachPurchasePriceOptions('t1', ['a'], Number.POSITIVE_INFINITY);
    expect(out.get('a')!.map((o) => o.sellingPrice)).toContain(250);
    expect(out.get('a')).toHaveLength(9);
  });
});
