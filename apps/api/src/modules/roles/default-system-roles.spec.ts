import { RoleType } from '@prisma/client';
import { PERMISSION_CATALOGUE } from '@/shared/security/permission-catalogue';
import { ensureSystemRoles, ensureSystemRolesExist, planSystemRoleChanges, systemRoleDefinitions } from './default-system-roles';

/** The full catalogue plus two rows that are not in it (stray / platform). */
const ALL_KEYS = [...PERMISSION_CATALOGUE, 'platform:manage', 'reports:create'];
const permissions = ALL_KEYS.map((key) => { const [resource, action] = key.split(':'); return { id: key, resource, action }; });

/** Runs ensureSystemRoles against an in-memory db and returns role name -> granted "resource:action" keys. */
async function grantedByRole() {
  const granted = new Map<string, string[]>();
  const db = {
    permission: { findMany: async () => permissions },
    role: { upsert: async ({ create }: { create: { name: string } }) => ({ id: create.name }) },
    rolePermission: {
      deleteMany: async ({ where }: { where: { roleId: string } }) => { granted.set(where.roleId, []); },
      createMany: async ({ data }: { data: { roleId: string; permissionId: string }[] }) => {
        for (const d of data) granted.get(d.roleId)!.push(d.permissionId);
      },
    },
  };
  await ensureSystemRoles(db as never, 't1');
  return granted;
}

describe('ensureSystemRoles (new tenants) — default Cashier', () => {
  it('cannot change prices, adjust stock or post accounting entries', async () => {
    const cashier = (await grantedByRole()).get('Cashier')!;
    for (const denied of [
      'products:update', 'inventory:update', 'accounting:create', 'accounting:update', 'accounting:delete',
      'sales:delete', 'customers:delete', 'products:delete', 'users:read', 'roles:update',
    ]) {
      expect(cashier).not.toContain(denied);
    }
  });

  it('keeps everything the POS counter needs', async () => {
    const cashier = (await grantedByRole()).get('Cashier')!;
    for (const needed of [
      'sales:create', 'sales:read', 'customers:create', 'customers:read', 'customers:update',
      'products:read', 'products:create', 'inventory:read', 'cash:create', 'cash:read',
      'suppliers:read', 'suppliers:create', 'purchases:create', 'purchases:read', 'accounting:read',
    ]) {
      expect(cashier).toContain(needed);
    }
  });

  it('gives Tenant Admin exactly the catalogue (incl. the formerly missing permissions), never stray rows', async () => {
    const admin = (await grantedByRole()).get('Tenant Admin')!;
    expect([...admin].sort()).toEqual([...PERMISSION_CATALOGUE].sort());
    expect(admin).toEqual(expect.arrayContaining(['accounting:update', 'suppliers:update', 'returns:read', 'settings:read']));
    expect(admin).not.toContain('platform:manage');
  });

  it('keeps Branch Manager with stock control and no accounting write', async () => {
    const bm = (await grantedByRole()).get('Branch Manager')!;
    expect(bm).toEqual(expect.arrayContaining(['inventory:update', 'customers:update']));
    expect(bm).not.toContain('accounting:update');
  });

  it('only grants permissions that exist in the database', () => {
    const defs = systemRoleDefinitions(['sales:create', 'sales:read']);
    for (const d of defs) for (const k of d.permissions) expect(['sales:create', 'sales:read']).toContain(k);
  });
});

describe('ensureSystemRolesExist (safe for existing tenants)', () => {
  it('creates only missing roles and never touches an existing role or its permissions', async () => {
    const existing = new Set(['Cashier']);
    const created: string[] = [];
    let writesToExisting = 0;
    const db = {
      permission: { findMany: async () => permissions },
      role: {
        findUnique: async ({ where }: { where: { tenantId_name: { name: string } } }) => (existing.has(where.tenantId_name.name) ? { id: 'r' } : null),
        create: async ({ data }: { data: { name: string } }) => { created.push(data.name); return { id: data.name }; },
        upsert: async () => { writesToExisting++; return { id: 'x' }; },
      },
      rolePermission: { deleteMany: async () => { writesToExisting++; }, createMany: async () => { writesToExisting++; } },
    };
    const result = await ensureSystemRolesExist(db as never, 't1');
    expect(result.sort()).toEqual(['Branch Manager', 'Tenant Admin']);
    expect(created.sort()).toEqual(['Branch Manager', 'Tenant Admin']);
    expect(writesToExisting).toBe(0);
  });
});

describe('planSystemRoleChanges (reviewed per-tenant step)', () => {
  it('reports adds and removes per role without applying anything', () => {
    const plans = planSystemRoleChanges(
      [
        { name: 'Tenant Admin', permissions: PERMISSION_CATALOGUE.filter((k) => !['accounting:update', 'returns:read'].includes(k)) },
        { name: 'Cashier', permissions: ['sales:create', 'products:update', 'custom:thing'] },
      ],
      [...PERMISSION_CATALOGUE],
    );
    const admin = plans.find((p) => p.role === 'Tenant Admin')!;
    expect(admin.add).toEqual(['accounting:update', 'returns:read']);
    expect(admin.remove).toEqual([]);
    const cashier = plans.find((p) => p.role === 'Cashier')!;
    expect(cashier.remove).toEqual(['custom:thing', 'products:update']);
    expect(cashier.add).toContain('sales:read');
    const bm = plans.find((p) => p.role === 'Branch Manager')!;
    expect(bm.exists).toBe(false);
  });

  it('is empty for a tenant that already matches the defaults', () => {
    const defs = systemRoleDefinitions([...PERMISSION_CATALOGUE]);
    const plans = planSystemRoleChanges(defs.map((d) => ({ name: d.name, permissions: d.permissions })), [...PERMISSION_CATALOGUE]);
    for (const p of plans) { expect(p.add).toEqual([]); expect(p.remove).toEqual([]); }
  });

  it('uses the expected role types', () => {
    expect(systemRoleDefinitions([]).map((d) => d.type)).toEqual([RoleType.CASHIER, RoleType.TENANT_ADMIN, RoleType.BRANCH_MANAGER]);
  });
});
