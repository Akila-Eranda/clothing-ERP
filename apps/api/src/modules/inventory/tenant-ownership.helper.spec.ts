/**
 * S-F8 (tenant ownership) and S-F10 (transfer double dispatch / receive) — no database.
 * Real repo functions run against a tiny in-memory Prisma stand-in that records every call.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { assertVariantsInTenant, missingIds } from './tenant-ownership.helper';
import { assertTransferClaimed } from './transfer-claim.helper';
import { addToLot } from './inventory-lots.helper';
import { InventoryService } from './inventory.service';

type Call = { model: string; method: string; args: any };
function fakeDb(handlers: Record<string, (args: any) => any> = {}) {
  const calls: Call[] = [];
  const defaults = (method: string, args: any) => {
    if (method === 'findMany') return [];
    if (method.startsWith('find')) return null;
    if (method === 'updateMany' || method === 'deleteMany') return { count: 1 };
    if (method === 'create' || method === 'update' || method === 'upsert') return { id: 'fake', ...(args?.data ?? {}) };
    return undefined;
  };
  const db: any = new Proxy({}, {
    get(_t, model: string) {
      if (model === 'calls') return calls;
      if (model === 'then') return undefined;
      if (model === '$transaction') return async (fn: any) => (typeof fn === 'function' ? fn(db) : Promise.all(fn));
      if (model === '$queryRaw') return async () => [];
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

const T = 'tenant-A';

describe('missingIds (pure)', () => {
  it('returns requested ids that were not found, once, in request order', () => {
    expect(missingIds(['a', 'b', 'a', 'c'], ['b'])).toEqual(['a', 'c']);
  });
  it('treats empty and non-string ids as missing', () => {
    expect(missingIds(['', 5 as unknown as string], ['x'])).toEqual(['', '5']);
  });
  it('returns [] when every id is found', () => {
    expect(missingIds(['a', 'b'], new Set(['a', 'b']))).toEqual([]);
  });
});

describe('assertVariantsInTenant (S-F8)', () => {
  it('queries by product.tenantId and refuses a variant of another tenant', async () => {
    const db = fakeDb({ 'productVariant.findMany': () => [{ id: 'v-A' }] });
    await expect(assertVariantsInTenant(db, T, ['v-A', 'v-B'])).rejects.toThrow('Variant not found: v-B');
    expect(callsOf(db, 'productVariant', 'findMany')[0].args.where).toEqual({ id: { in: ['v-A', 'v-B'] }, product: { tenantId: T } });
  });
  it('passes when every variant is the tenant\'s', async () => {
    const db = fakeDb({ 'productVariant.findMany': () => [{ id: 'v-A' }] });
    await expect(assertVariantsInTenant(db, T, ['v-A', 'v-A'])).resolves.toBeUndefined();
  });
  it('does not query for an empty list', async () => {
    const db = fakeDb();
    await assertVariantsInTenant(db, T, []);
    expect(db.calls).toHaveLength(0);
  });
  it('refuses an empty id without querying', async () => {
    const db = fakeDb();
    await expect(assertVariantsInTenant(db, T, [''])).rejects.toThrow(BadRequestException);
    expect(db.calls).toHaveLength(0);
  });
});

describe('addToLot with lotId (S-F8)', () => {
  const lotOfB = { id: 'lot-B', tenantId: 'tenant-B', branchId: 'b-B', variantId: 'v-B', quantity: 5 };
  const lotOfA = { id: 'lot-A', tenantId: T, branchId: 'b1', variantId: 'v-1', quantity: 5 };
  const lots = [lotOfA, lotOfB];
  const handlers = {
    'inventoryLot.findFirst': (a: any) =>
      lots.find((l) => Object.entries(a?.where ?? {}).every(([k, v]) => (l as any)[k] === v)) ?? null,
    'inventoryLot.findUnique': (a: any) => lots.find((l) => l.id === a?.where?.id) ?? null,
  };
  const writes = (db: any) => callsOf(db, 'inventoryLot').filter((c) => ['update', 'updateMany', 'upsert', 'create'].includes(c.method));

  it('refuses a lot of another tenant and writes nothing', async () => {
    const db = fakeDb(handlers);
    await expect(addToLot(db, { tenantId: T, branchId: 'b1', variantId: 'v-1', quantity: 100, lotId: 'lot-B' })).rejects.toThrow(BadRequestException);
    expect(writes(db)).toHaveLength(0);
  });
  it('refuses a same-tenant lot of a different variant or branch', async () => {
    const db = fakeDb(handlers);
    await expect(addToLot(db, { tenantId: T, branchId: 'b1', variantId: 'v-OTHER', quantity: 1, lotId: 'lot-A' })).rejects.toThrow(BadRequestException);
    await expect(addToLot(db, { tenantId: T, branchId: 'b2', variantId: 'v-1', quantity: 1, lotId: 'lot-A' })).rejects.toThrow(BadRequestException);
    expect(writes(db)).toHaveLength(0);
  });
  it('CONTROL: tops up the tenant\'s own lot', async () => {
    const db = fakeDb(handlers);
    await addToLot(db, { tenantId: T, branchId: 'b1', variantId: 'v-1', quantity: 2, lotId: 'lot-A' });
    const w = writes(db);
    expect(w).toHaveLength(1);
    expect(w[0].args.where).toEqual({ id: 'lot-A' });
    expect(w[0].args.data.quantity).toEqual({ increment: 2 });
  });
});

describe('assertTransferClaimed (pure, S-F10)', () => {
  it('accepts exactly one claimed row', () => {
    expect(() => assertTransferClaimed({ count: 1 }, 'dispatch')).not.toThrow();
  });
  it.each([0, 2])('refuses count=%s with 409', (count) => {
    expect(() => assertTransferClaimed({ count }, 'receive')).toThrow(ConflictException);
  });
  it('refuses a missing result', () => {
    expect(() => assertTransferClaimed(undefined, 'cancel')).toThrow(ConflictException);
  });
});

describe('InventoryService.updateTransferStatus claim (S-F10)', () => {
  const harness = (initial: 'PENDING' | 'IN_TRANSIT') => {
    const state = { status: initial as string };
    const snapshot = () => ({
      id: 'tr-1', tenantId: T, status: state.status, approvedBy: 'admin', fromBranchId: 'b1', toBranchId: 'b2',
      fromWarehouseId: 'wh1', toWarehouseId: 'wh2',
      items: [{ id: 'ti-1', variantId: 'v-1', requestedQty: 5, sentQty: initial === 'IN_TRANSIT' ? 5 : 0, variant: { sku: 'S', name: 'S' } }],
    });
    const prisma = fakeDb({
      'stockTransfer.findFirst': () => snapshot(),
      'stockTransfer.findFirstOrThrow': () => snapshot(),
      // Plain update would bypass the claim: count it so a regression is visible.
      'stockTransfer.update': (a: any) => { if (a?.data?.status) state.status = a.data.status; return snapshot(); },
      'stockTransfer.updateMany': (a: any) => {
        const ok = a?.where?.status === state.status && a?.where?.tenantId === T && a?.where?.id === 'tr-1';
        if (ok && a?.data?.status) state.status = a.data.status;
        return { count: ok ? 1 : 0 };
      },
      'inventory.findFirst': () => ({ quantity: 100, reservedQty: 0 }),
    });
    const svc = Object.create(InventoryService.prototype);
    const adjustStock = jest.fn(async () => ({ _lotAllocations: [] }));
    Object.assign(svc, { prisma, adjustStock, resolveWarehouseId: async () => 'wh', enrichTransfers: async (x: unknown[]) => x });
    return { svc, adjustStock, prisma, state };
  };

  it('two concurrent dispatches deduct stock once; the second gets 409', async () => {
    const { svc, adjustStock, prisma } = harness('PENDING');
    const r = await Promise.allSettled([1, 2].map(() => svc.updateTransferStatus('tr-1', T, 'IN_TRANSIT', 'u1', ['TENANT_ADMIN'])));
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rejected = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(adjustStock).toHaveBeenCalledTimes(1);
    expect(callsOf(prisma, 'stockTransfer', 'update')).toHaveLength(0);
  });

  it('two concurrent receives add stock once; the second gets 409', async () => {
    const { svc, adjustStock } = harness('IN_TRANSIT');
    const r = await Promise.allSettled([1, 2].map(() => svc.updateTransferStatus('tr-1', T, 'RECEIVED', 'u1', ['TENANT_ADMIN'])));
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(adjustStock).toHaveBeenCalledTimes(1);
  });

  it('receive claim records receivedAt and the receiver, scoped by tenant and expected status', async () => {
    const { svc, prisma } = harness('IN_TRANSIT');
    await svc.updateTransferStatus('tr-1', T, 'RECEIVED', 'u9', ['TENANT_ADMIN']);
    const claim = callsOf(prisma, 'stockTransfer', 'updateMany')[0].args;
    expect(claim.where).toEqual({ id: 'tr-1', tenantId: T, status: 'IN_TRANSIT' });
    expect(claim.data.status).toBe('RECEIVED');
    expect(claim.data.approvedBy).toBe('u9');
    expect(claim.data.receivedAt).toBeInstanceOf(Date);
  });

  it('cancel racing a dispatch: the cancel claim refuses once the transfer left PENDING', async () => {
    const { svc, state } = harness('PENDING');
    // The pre-check read sees PENDING, but the row moved on before the claim.
    const p = svc.updateTransferStatus('tr-1', T, 'CANCELLED', 'u1', ['TENANT_ADMIN']);
    state.status = 'IN_TRANSIT';
    await expect(p).rejects.toThrow(ConflictException);
    expect(state.status).toBe('IN_TRANSIT');
  });

  it('CONTROL: a sequential second dispatch is refused by the status pre-check (400)', async () => {
    const { svc, adjustStock } = harness('PENDING');
    await svc.updateTransferStatus('tr-1', T, 'IN_TRANSIT', 'u1', ['TENANT_ADMIN']);
    await expect(svc.updateTransferStatus('tr-1', T, 'IN_TRANSIT', 'u1', ['TENANT_ADMIN'])).rejects.toThrow(BadRequestException);
    expect(adjustStock).toHaveBeenCalledTimes(1);
  });

  it('limits branch-manager dispatch claims to the source branch', async () => {
    const { svc, prisma } = harness('PENDING');
    await svc.updateTransferStatus('tr-1', T, 'IN_TRANSIT', 'u1', ['BRANCH_MANAGER'], 'b1');
    expect(callsOf(prisma, 'stockTransfer', 'updateMany')[0].args.where).toMatchObject({
      fromBranchId: 'b1',
    });
  });

  it('hides transfers outside the acting branch and performs no stock write', async () => {
    const { svc, adjustStock, prisma } = harness('PENDING');
    await expect(
      svc.updateTransferStatus('tr-1', T, 'IN_TRANSIT', 'u1', ['BRANCH_MANAGER'], 'b2'),
    ).rejects.toThrow('Transfer not found');
    expect(adjustStock).not.toHaveBeenCalled();
    expect(callsOf(prisma, 'stockTransfer', 'updateMany')).toHaveLength(0);
  });

  it('limits branch-manager receipt claims to the destination branch', async () => {
    const { svc, prisma } = harness('IN_TRANSIT');
    await svc.updateTransferStatus('tr-1', T, 'RECEIVED', 'u1', ['BRANCH_MANAGER'], 'b2');
    expect(callsOf(prisma, 'stockTransfer', 'updateMany')[0].args.where).toMatchObject({
      toBranchId: 'b2',
    });
  });
});
