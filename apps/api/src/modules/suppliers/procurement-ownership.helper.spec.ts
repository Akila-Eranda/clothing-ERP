/**
 * S-F7 (supplier return line validation), S-F8 (cross-tenant ids) and H4 (supplier invoice amounts) — no database.
 * Real DTOs / services run against a tiny in-memory Prisma stand-in that records every call.
 */
import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { findReturnQtyViolation, assertPurchaseItemsInTenant, assertReturnLotsInTenant } from './procurement-ownership.helper';
import { CreateSupplierInvoiceDto, CreateSupplierReturnDto } from './suppliers.module';
import { ProcurementService } from './procurement.service';
import { syncSupplierBalance } from './supplier-ap.helper';

type Call = { model: string; method: string; args: any };
function fakeDb(handlers: Record<string, (args: any) => any> = {}) {
  const calls: Call[] = [];
  const defaults = (method: string, args: any) => {
    if (method === 'findMany') return [];
    if (method.startsWith('find')) return null;
    if (method === 'count') return 0;
    if (method === 'updateMany' || method === 'deleteMany') return { count: 1 };
    if (method === 'create' || method === 'update' || method === 'upsert') return { id: 'fake', ...(args?.data ?? {}) };
    return undefined;
  };
  const db: any = new Proxy({}, {
    get(_t, model: string) {
      if (model === 'calls') return calls;
      if (model === 'then') return undefined;
      if (model === '$transaction') return async (fn: any) => (typeof fn === 'function' ? fn(db) : Promise.all(fn));
      if (model === '$queryRaw') return async () => { calls.push({ model, method: 'raw', args: null }); return []; };
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
  return db;
}
const callsOf = (db: any, model: string, method?: string): Call[] =>
  db.calls.filter((c: Call) => c.model === model && (!method || c.method === method));
const writesTo = (db: any, model: string) =>
  callsOf(db, model).filter((c) => ['create', 'update', 'updateMany', 'upsert', 'createMany'].includes(c.method));

const T = 'tenant-A';
const S = 'supplier-A';
const errorsOf = async (cls: any, body: object) =>
  validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true });

// ── Pure ────────────────────────────────────────────────────────────────

describe('findReturnQtyViolation (pure, S-F7)', () => {
  const rec = [{ variantId: 'v-1', qty: 10 }, { variantId: 'v-2', qty: 4.5 }];
  it('allows up to received - already returned', () => {
    expect(findReturnQtyViolation([{ variantId: 'v-1', quantity: 7 }], rec, [{ variantId: 'v-1', qty: 3 }], 'GRN 1')).toBeNull();
  });
  it('refuses more than what is left', () => {
    expect(findReturnQtyViolation([{ variantId: 'v-1', quantity: 8, label: 'Rice' }], rec, [{ variantId: 'v-1', qty: 3 }], 'GRN 1'))
      .toBe('Return quantity for Rice (8) exceeds what is left to return on GRN 1 (7)');
  });
  it('sums several lines of the same variant', () => {
    expect(findReturnQtyViolation([{ variantId: 'v-1', quantity: 6 }, { variantId: 'v-1', quantity: 5 }], rec, [], 'GRN 1')).not.toBeNull();
  });
  it('refuses a variant that is not on the source document', () => {
    expect(findReturnQtyViolation([{ variantId: 'v-X', quantity: 1, label: 'Soap' }], rec, [], 'PO 7')).toBe('Soap was not received on PO 7');
  });
  it('compares decimals at 3 dp (no float noise)', () => {
    expect(findReturnQtyViolation([{ variantId: 'v-2', quantity: 0.1 + 0.2 }], [{ variantId: 'v-2', qty: 0.3 }], [], 'GRN')).toBeNull();
    expect(findReturnQtyViolation([{ variantId: 'v-2', quantity: 4.501 }], rec, [], 'GRN')).not.toBeNull();
  });
});

// ── DTO validation ───────────────────────────────────────────────────────

describe('CreateSupplierReturnDto lines (S-F7)', () => {
  const line = (over: object = {}) => ({ variantId: 'v-1', productName: 'Rice', sku: 'R', quantity: 1, unitCost: 100, ...over });
  it.each([
    ['negative quantity', line({ quantity: -5 })],
    ['zero quantity', line({ quantity: 0 })],
    ['more than 3 dp', line({ quantity: 1.2345 })],
    ['negative unit cost', line({ unitCost: -1 })],
    ['numeric variantId', line({ variantId: 123 })],
    ['missing variantId', { productName: 'Rice', sku: 'R', quantity: 1 }],
    ['empty variantId', line({ variantId: '' })],
    ['quantity as string', line({ quantity: '5' })],
    ['unknown field', line({ tenantId: 'tenant-B' })],
  ])('400 for %s', async (_n, bad) => {
    expect((await errorsOf(CreateSupplierReturnDto, { supplierId: S, items: [bad] })).length).toBeGreaterThan(0);
  });
  it('400 for an empty item list', async () => {
    expect((await errorsOf(CreateSupplierReturnDto, { supplierId: S, items: [] })).length).toBeGreaterThan(0);
  });
  it('CONTROL: the web purchase-return payload validates (incl. kg quantity)', async () => {
    const body = { supplierId: S, purchaseId: 'po-1', reason: 'Damaged', notes: 'x', items: [line(), line({ variantId: 'v-2', quantity: 2.5, unitCost: 12.3456 })] };
    expect(await errorsOf(CreateSupplierReturnDto, body)).toHaveLength(0);
  });
});

describe('CreateSupplierInvoiceDto amounts (H4)', () => {
  const base = { supplierId: S, invoiceNumber: 'INV-1', subtotal: 100 };
  it.each([
    ['negative taxAmount', { taxAmount: -5 }],
    ['negative subtotal', { subtotal: -1 }],
    ['NaN subtotal', { subtotal: NaN }],
    ['Infinity taxAmount', { taxAmount: Infinity }],
    ['absurd subtotal', { subtotal: 1e12 }],
  ])('400 for %s', async (_n, over) => {
    expect((await errorsOf(CreateSupplierInvoiceDto, { ...base, ...over })).length).toBeGreaterThan(0);
  });
  it('CONTROL: the web supplier-invoice payload validates', async () => {
    expect(await errorsOf(CreateSupplierInvoiceDto, { ...base, subtotal: 1234.5, post: true })).toHaveLength(0);
    expect(await errorsOf(CreateSupplierInvoiceDto, { ...base, taxAmount: 0 })).toHaveLength(0);
  });
});

// ── Services (S-F7 / S-F8) ──────────────────────────────────────────────

const procurement = (handlers: Record<string, (a: any) => any>) => {
  const prisma = fakeDb({
    'supplier.findFirst': (a) => (a?.where?.tenantId === T && a?.where?.id === S ? { id: S } : null),
    'productVariant.findMany': (a) => (a?.where?.product?.tenantId === T ? (a.where.id.in as string[]).filter((id) => id.startsWith('v-')).map((id) => ({ id })) : []),
    ...handlers,
  });
  const svc = Object.create(ProcurementService.prototype);
  const emit = jest.fn();
  const adjustStock = jest.fn(async () => ({}));
  Object.assign(svc, {
    prisma, nextNumber: async () => 'SRET-1', eventEmitter: { emit },
    inventoryService: { adjustStock }, numbering: { isEngineEnabled: () => false },
  });
  return { svc, prisma, emit, adjustStock };
};
const rline = (over: object = {}) => ({ variantId: 'v-1', productName: 'Rice', sku: 'R', quantity: 1, unitCost: 100, ...over });
const grnOfA = { id: 'grn-1', grnNumber: 'GRN-1', tenantId: T, supplierId: S, purchaseId: null, items: [{ variantId: 'v-1', receivedQty: 10 }] };
const grnHandler = (a: any) => (a?.where?.id === 'grn-1' && a?.where?.tenantId === T ? grnOfA : null);

describe('ProcurementService.createSupplierReturn (S-F7 / S-F8)', () => {
  it('refuses a negative quantity before any read or write', async () => {
    const { svc, prisma } = procurement({});
    await expect(svc.createSupplierReturn(T, 'b1', 'u1', { supplierId: S, items: [rline({ quantity: -5 })] })).rejects.toThrow(BadRequestException);
    expect(writesTo(prisma, 'supplierReturn')).toHaveLength(0);
  });

  it('refuses more than the GRN received minus already posted returns', async () => {
    const { svc, prisma } = procurement({
      'goodsReceipt.findFirst': grnHandler,
      'supplierReturnItem.findMany': () => [{ variantId: 'v-1', quantity: 4 }],
    });
    await expect(svc.createSupplierReturn(T, 'b1', 'u1', { supplierId: S, goodsReceiptId: 'grn-1', items: [rline({ quantity: 7 })] }))
      .rejects.toThrow('exceeds what is left to return on GRN GRN-1 (6)');
    expect(writesTo(prisma, 'supplierReturn')).toHaveLength(0);
    // already-returned is counted from POSTED returns of this GRN, in this tenant
    const where = callsOf(prisma, 'supplierReturnItem', 'findMany')[0].args.where.returnDoc;
    expect(where).toMatchObject({ tenantId: T, goodsReceiptId: 'grn-1', status: 'POSTED' });
  });

  it('refuses a variant that is not on the GRN', async () => {
    const { svc } = procurement({ 'goodsReceipt.findFirst': grnHandler });
    await expect(svc.createSupplierReturn(T, 'b1', 'u1', { supplierId: S, goodsReceiptId: 'grn-1', items: [rline({ variantId: 'v-9' })] }))
      .rejects.toThrow('was not received on GRN GRN-1');
  });

  it('refuses a supplier / variant / GRN / PO / lot of another tenant', async () => {
    const cases: [string, object, Record<string, (a: any) => any>][] = [
      ['supplier', { supplierId: 'sup-B', items: [rline()] }, {}],
      ['variant', { supplierId: S, items: [rline({ variantId: 'x-of-B' })] }, {}],
      ['GRN', { supplierId: S, goodsReceiptId: 'grn-B', items: [rline()] }, { 'goodsReceipt.findFirst': grnHandler }],
      ['PO', { supplierId: S, purchaseId: 'po-B', items: [rline()] }, {}],
      ['lot', { supplierId: S, items: [rline({ lotId: 'lot-B' })] }, {}],
    ];
    for (const [name, dto, h] of cases) {
      const { svc, prisma } = procurement(h);
      await expect(svc.createSupplierReturn(T, 'b1', 'u1', dto)).rejects.toThrow(name === 'variant' || name === 'lot' ? BadRequestException : NotFoundException);
      expect(writesTo(prisma, 'supplierReturn')).toHaveLength(0);
    }
  });

  it('CONTROL: a return within the GRN quantity is created as a draft with the client unit cost (credit unchanged)', async () => {
    const { svc, prisma } = procurement({ 'goodsReceipt.findFirst': grnHandler });
    await svc.createSupplierReturn(T, 'b1', 'u1', { supplierId: S, goodsReceiptId: 'grn-1', items: [rline({ quantity: 10, unitCost: 95 })] });
    const created = callsOf(prisma, 'supplierReturn', 'create')[0].args.data;
    expect(created.items.create[0]).toMatchObject({ quantity: 10, unitCost: 95 });
  });

  it('CONTROL: a return with no GRN / PO is not quantity-checked here (stock is checked on post)', async () => {
    const { svc, prisma } = procurement({});
    await svc.createSupplierReturn(T, 'b1', 'u1', { supplierId: S, items: [rline({ quantity: 50 })] });
    expect(callsOf(prisma, 'supplierReturn', 'create')).toHaveLength(1);
  });
});

describe('ProcurementService.postSupplierReturn (S-F7 / S-F8)', () => {
  const draft = (over: object = {}) => ({
    id: 'sr-1', tenantId: T, branchId: 'b1', status: 'DRAFT', returnNumber: 'SRET-1', supplierId: S,
    purchaseId: null, goodsReceiptId: null, items: [{ variantId: 'v-1', productName: 'Rice', sku: 'R', quantity: 1, unitCost: 100, lotId: null, batchNumber: null }],
    ...over,
  });

  it('a purchaseId of another tenant is refused and never updated', async () => {
    const { svc, prisma, adjustStock } = procurement({
      'supplierReturn.findFirst': () => draft({ purchaseId: 'po-of-B' }),
      'purchaseOrder.findFirst': (a) => (a?.where?.tenantId === T ? null : { id: 'po-of-B', tenantId: 'tenant-B' }),
    });
    await expect(svc.postSupplierReturn('sr-1', T, 'u1')).rejects.toThrow(NotFoundException);
    expect(writesTo(prisma, 'purchaseOrder')).toHaveLength(0);
    expect(adjustStock).not.toHaveBeenCalled();
  });

  it('re-checks quantity against other POSTED returns of the GRN (excluding itself) under a GRN row lock', async () => {
    const { svc, prisma, adjustStock } = procurement({
      'supplierReturn.findFirst': () => draft({ goodsReceiptId: 'grn-1', items: [{ ...draft().items[0], quantity: 3 }] }),
      'goodsReceipt.findFirst': grnHandler,
      'supplierReturnItem.findMany': () => [{ variantId: 'v-1', quantity: 8 }],
    });
    await expect(svc.postSupplierReturn('sr-1', T, 'u1')).rejects.toThrow(BadRequestException);
    expect(adjustStock).not.toHaveBeenCalled();
    expect(callsOf(prisma, '$queryRaw')).toHaveLength(1);
    expect(callsOf(prisma, 'supplierReturnItem', 'findMany')[0].args.where.returnDoc.id).toEqual({ not: 'sr-1' });
  });

  it('CONTROL: a valid PO-linked return posts; PO credit update is scoped by tenant and computed as before', async () => {
    const po = { id: 'po-1', poNumber: 'PO-1', supplierId: S, items: [{ variantId: 'v-1', receivedQty: 5 }] };
    const { svc, prisma, adjustStock, emit } = procurement({
      'supplierReturn.findFirst': () => draft({ purchaseId: 'po-1', items: [{ ...draft().items[0], quantity: 2, unitCost: 40 }] }),
      'purchaseOrder.findFirst': (a) => (a?.where?.tenantId === T && a?.where?.id === 'po-1' ? po : null),
    });
    await svc.postSupplierReturn('sr-1', T, 'u1');
    expect(adjustStock).toHaveBeenCalledTimes(1);
    const upd = writesTo(prisma, 'purchaseOrder');
    expect(upd).toHaveLength(1);
    expect(upd[0].method).toBe('updateMany');
    expect(upd[0].args).toEqual({ where: { id: 'po-1', tenantId: T }, data: { paidAmount: { increment: 80 } } });
    expect(emit).toHaveBeenCalledWith('accounting.supplier-return.posted', expect.objectContaining({ returnId: 'sr-1', tenantId: T }));
  });
});

describe('ProcurementService.createSupplierInvoice (S-F8 / H4)', () => {
  it.each([
    ['supplier of another tenant', { supplierId: 'sup-B', invoiceNumber: 'X', subtotal: 10 }],
    ['PO of another tenant', { supplierId: S, invoiceNumber: 'X', purchaseId: 'po-B', subtotal: 10 }],
    ['GRN of another tenant', { supplierId: S, invoiceNumber: 'X', goodsReceiptId: 'grn-B', subtotal: 10 }],
  ])('refuses a %s and creates nothing', async (_n, dto) => {
    const { svc, prisma } = procurement({});
    await expect(svc.createSupplierInvoice(T, 'u1', dto)).rejects.toThrow(NotFoundException);
    expect(writesTo(prisma, 'supplierInvoice')).toHaveLength(0);
  });

  it('refuses a PO of a different supplier of the same tenant', async () => {
    const { svc, prisma } = procurement({ 'purchaseOrder.findFirst': () => ({ id: 'po-1', supplierId: 'other' }) });
    await expect(svc.createSupplierInvoice(T, 'u1', { supplierId: S, invoiceNumber: 'X', purchaseId: 'po-1', subtotal: 10 })).rejects.toThrow(BadRequestException);
    expect(writesTo(prisma, 'supplierInvoice')).toHaveLength(0);
  });

  it.each([[{ taxAmount: -5 }], [{ subtotal: NaN }], [{ taxAmount: Infinity }]])('refuses non-finite / negative amounts %j', async (over) => {
    const { svc, prisma } = procurement({});
    await expect(svc.createSupplierInvoice(T, 'u1', { supplierId: S, invoiceNumber: 'X', subtotal: 10, ...over })).rejects.toThrow(BadRequestException);
    expect(writesTo(prisma, 'supplierInvoice')).toHaveLength(0);
  });

  it('CONTROL: a draft invoice of the tenant\'s own supplier is created with total = subtotal + tax', async () => {
    const { svc, prisma } = procurement({});
    await svc.createSupplierInvoice(T, 'u1', { supplierId: S, invoiceNumber: 'X', subtotal: 100, taxAmount: 18 });
    expect(callsOf(prisma, 'supplierInvoice', 'create')[0].args.data).toMatchObject({ tenantId: T, supplierId: S, subtotal: 100, taxAmount: 18, total: 118 });
  });
});

describe('Direct GRN / GRN core (S-F8)', () => {
  const gline = (over: object = {}) => ({ variantId: 'v-1', productName: 'Rice', variantName: 'Std', sku: 'R', receivedQty: 2, unitCost: 10, ...over });

  it('a supplier of another tenant is refused before anything is written', async () => {
    const { svc, prisma, adjustStock } = procurement({});
    await expect(svc.createDirectGrn(T, 'b1', 'u1', { supplierId: 'sup-B', lines: [gline()] })).rejects.toThrow(NotFoundException);
    expect(adjustStock).not.toHaveBeenCalled();
    expect(writesTo(prisma, 'goodsReceipt')).toHaveLength(0);
  });

  it('a variant of another tenant is refused before anything is written', async () => {
    const { svc, prisma, adjustStock } = procurement({});
    await expect(svc.createDirectGrn(T, 'b1', 'u1', { supplierId: S, lines: [gline(), gline({ variantId: 'x-of-B' })] })).rejects.toThrow('Variant not found: x-of-B');
    expect(adjustStock).not.toHaveBeenCalled();
    expect(writesTo(prisma, 'goodsReceipt')).toHaveLength(0);
    expect(writesTo(prisma, 'productVariant')).toHaveLength(0);
  });

  it('a purchaseItemId of another tenant\'s PO is refused', async () => {
    const { svc, adjustStock } = procurement({});
    await expect(svc.createDirectGrn(T, 'b1', 'u1', { supplierId: S, lines: [gline({ purchaseItemId: 'pi-B' })] })).rejects.toThrow(BadRequestException);
    expect(adjustStock).not.toHaveBeenCalled();
  });

  it('CONTROL: an own GRN posts; selling price / MRP update is scoped by product.tenantId', async () => {
    const { svc, prisma, adjustStock } = procurement({
      'goodsReceipt.create': (a) => ({ id: 'grn-9', ...a.data, items: [{ id: 'gi-1', variantId: 'v-1', lotId: null }] }),
      'goodsReceipt.findFirst': () => ({ id: 'grn-9', items: [] }),
      'supplier.findFirst': (a) => (a?.where?.tenantId === T && a?.where?.id === S ? { id: S, creditLimit: 0, creditDays: 30 } : null),
    });
    await svc.createDirectGrn(T, 'b1', 'u1', { supplierId: S, lines: [gline({ sellingPrice: 15, mrp: 16 })] }, ['BRANCH_MANAGER']);
    expect(adjustStock).toHaveBeenCalledTimes(1);
    const pv = writesTo(prisma, 'productVariant');
    expect(pv).toHaveLength(1);
    expect(pv[0]).toMatchObject({ method: 'updateMany', args: { where: { id: 'v-1', product: { tenantId: T } }, data: { sellingPrice: 15, mrp: 16 } } });
  });

  it('refuses direct GRN pricing edits from an unauthorised role', async () => {
    const { svc, adjustStock } = procurement({
      'supplier.findFirst': () => ({ id: S, creditLimit: 0, creditDays: 30 }),
    });
    await expect(
      svc.createDirectGrn(T, 'b1', 'u1', { supplierId: S, lines: [gline({ sellingPrice: 15, mrp: 16 })] }, ['CASHIER']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(adjustStock).not.toHaveBeenCalled();
  });
});

describe('assertPurchaseItemsInTenant / assertReturnLotsInTenant', () => {
  it('purchase line must be a line of a tenant PO for the same variant', async () => {
    const db = fakeDb({ 'purchaseOrderItem.findMany': () => [{ id: 'pi-1', variantId: 'v-1' }] });
    await expect(assertPurchaseItemsInTenant(db, T, [{ purchaseItemId: 'pi-1', variantId: 'v-2' }])).rejects.toThrow(BadRequestException);
    await expect(assertPurchaseItemsInTenant(db, T, [{ purchaseItemId: 'pi-1', variantId: 'v-1' }])).resolves.toBeUndefined();
    expect(callsOf(db, 'purchaseOrderItem', 'findMany')[0].args.where.purchase).toEqual({ tenantId: T });
  });
  it('lot must be the tenant\'s, at the branch, for the line variant', async () => {
    const db = fakeDb({ 'inventoryLot.findMany': () => [{ id: 'lot-1', variantId: 'v-1' }] });
    await expect(assertReturnLotsInTenant(db, T, 'b1', [{ lotId: 'lot-1', variantId: 'v-2' }])).rejects.toThrow(BadRequestException);
    await expect(assertReturnLotsInTenant(db, T, 'b1', [{ lotId: 'lot-1', variantId: 'v-1' }])).resolves.toBeUndefined();
    expect(callsOf(db, 'inventoryLot', 'findMany')[0].args.where).toMatchObject({ tenantId: T, branchId: 'b1' });
  });
  it('no ids, no query', async () => {
    const db = fakeDb();
    await assertPurchaseItemsInTenant(db, T, [{ variantId: 'v-1' }]);
    await assertReturnLotsInTenant(db, T, 'b1', [{ variantId: 'v-1', lotId: null }]);
    expect(db.calls).toHaveLength(0);
  });
});

describe('syncSupplierBalance (S-F8)', () => {
  it('writes the balance with updateMany scoped by tenant', async () => {
    const db = fakeDb();
    await syncSupplierBalance(db, T, 'sup-X');
    const w = writesTo(db, 'supplier');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ method: 'updateMany', args: { where: { id: 'sup-X', tenantId: T } } });
  });
});
