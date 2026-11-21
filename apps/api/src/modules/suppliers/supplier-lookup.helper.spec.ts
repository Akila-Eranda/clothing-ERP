import {
  isSupplierLookupQuery,
  supplierBrowseArgs,
  supplierBrowseLimit,
  supplierBrowsePage,
  SUPPLIER_BROWSE_MAX_LIMIT,
  supplierLookupArgs,
  supplierLookupLimit,
  SUPPLIER_LOOKUP_DEFAULT_LIMIT,
  SUPPLIER_LOOKUP_MAX_LIMIT,
} from './supplier-lookup.helper';
import { SuppliersService } from './suppliers.module';

describe('supplier lookup: query rules', () => {
  it('needs at least 2 non-blank characters', () => {
    expect(isSupplierLookupQuery('a')).toBe(false);
    expect(isSupplierLookupQuery(' a ')).toBe(false);
    expect(isSupplierLookupQuery('   ')).toBe(false);
    expect(isSupplierLookupQuery('')).toBe(false);
    expect(isSupplierLookupQuery(undefined)).toBe(false);
    expect(isSupplierLookupQuery(12)).toBe(false);
    expect(isSupplierLookupQuery('ab')).toBe(true);
    expect(isSupplierLookupQuery('a b')).toBe(true);
    expect(isSupplierLookupQuery('07')).toBe(true);
  });

  it('limit defaults to 20 and is capped at 50', () => {
    expect(supplierLookupLimit(undefined)).toBe(SUPPLIER_LOOKUP_DEFAULT_LIMIT);
    expect(supplierLookupLimit('abc')).toBe(SUPPLIER_LOOKUP_DEFAULT_LIMIT);
    expect(supplierLookupLimit(0)).toBe(SUPPLIER_LOOKUP_DEFAULT_LIMIT);
    expect(supplierLookupLimit(7)).toBe(7);
    expect(supplierLookupLimit('30')).toBe(30);
    expect(supplierLookupLimit(5000)).toBe(SUPPLIER_LOOKUP_MAX_LIMIT);
  });

  it('query: tenant-scoped, only id / name / phone / code, no relations, case-insensitive partial match', () => {
    const args = supplierLookupArgs('t1', 'lanka 077', 50);
    expect(args.where.tenantId).toBe('t1');
    expect(args.select).toEqual({ id: true, name: true, phone: true, code: true });
    expect(args).not.toHaveProperty('include');
    expect(args.take).toBe(50);
    // every word must match one of name / phone / code (same rule as the existing search helper)
    expect(args.where.AND).toHaveLength(2);
    const first = (args.where.AND as Array<{ OR: Array<Record<string, { contains: string; mode: string }>> }>)[0];
    expect(first.OR.map((o) => Object.keys(o)[0])).toEqual(['name', 'phone', 'code']);
    expect(first.OR[0].name).toEqual({ contains: 'lanka', mode: 'insensitive' });
  });
});

describe('supplier browse (picker first page): query rules', () => {
  it('limit defaults to 100 and is capped at 100', () => {
    expect(supplierBrowseLimit(undefined)).toBe(100);
    expect(supplierBrowseLimit('100')).toBe(100);
    expect(supplierBrowseLimit(5)).toBe(5);
    expect(supplierBrowseLimit(5000)).toBe(SUPPLIER_BROWSE_MAX_LIMIT);
  });
  it('first page by name: tenant only, the four fields, no relations, no search filter', () => {
    const args = supplierBrowseArgs('t1', 100);
    expect(args).toEqual({
      where: { tenantId: 't1' },
      select: { id: true, name: true, phone: true, code: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 100,
    });
  });
  it('envelope carries the total so the picker knows whether to search the server', () => {
    const rows = [{ id: 'a', name: 'A', phone: null, code: null }];
    expect(supplierBrowsePage(rows, 250, 100)).toEqual({ data: rows, meta: { total: 250, limit: 100, page: 1, hasNextPage: true } });
    expect(supplierBrowsePage(rows, 1, 100).meta.hasNextPage).toBe(false);
  });
});

describe('SuppliersService.lookupSuppliers: one read, no balance work, no writes', () => {
  // Records every Prisma call; any model method other than supplier.findMany would show up here.
  function recordingPrisma(rows: unknown[]) {
    const calls: string[] = [];
    const model = (name: string) => new Proxy({}, {
      get: (_t, method: string) => async (args: unknown) => {
        calls.push(`${name}.${method}`);
        if (name === 'supplier' && method === 'findMany') return rows;
        if (name === 'supplier' && method === 'count') return 123;
        throw new Error(`unexpected ${name}.${method} ${JSON.stringify(args)}`);
      },
    });
    const prisma = new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop.startsWith('$')) return async () => { calls.push(prop); throw new Error(`unexpected ${prop}`); };
        return model(prop);
      },
    });
    return { prisma, calls };
  }
  const svc = (prisma: unknown) =>
    new SuppliersService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);

  it('one character: no database call at all', async () => {
    const { prisma, calls } = recordingPrisma([]);
    expect(await svc(prisma).lookupSuppliers('t1', 'a', 50)).toEqual([]);
    expect(await svc(prisma).lookupSuppliers('t1', ' a ', 50)).toEqual([]);
    expect(await svc(prisma).lookupSuppliers('t1', undefined, 50)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('two characters: exactly one supplier.findMany and nothing else (no PO / invoice / balance update)', async () => {
    const row = { id: 's1', name: 'Lanka Distributors', phone: '0771234567', code: 'SUP-1' };
    const { prisma, calls } = recordingPrisma([row]);
    expect(await svc(prisma).lookupSuppliers('t1', 'la', 50)).toEqual([row]);
    expect(calls).toEqual(['supplier.findMany']);
  });

  it('browse (initial load / Refresh): supplier.findMany + supplier.count only — no PO / invoice / balance update', async () => {
    const row = { id: 's1', name: 'Lanka Distributors', phone: '0771234567', code: 'SUP-1' };
    const { prisma, calls } = recordingPrisma([row]);
    const page = await svc(prisma).browseSuppliers('t1', 100);
    expect(page).toEqual({ data: [row], meta: { total: 123, limit: 100, page: 1, hasNextPage: true } });
    expect(calls.sort()).toEqual(['supplier.count', 'supplier.findMany']);
  });
});
