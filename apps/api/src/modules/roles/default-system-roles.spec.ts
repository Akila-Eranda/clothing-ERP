import { ensureSystemRoles } from './default-system-roles';

const RESOURCES = ['sales', 'customers', 'inventory', 'products', 'cash', 'suppliers', 'purchases', 'accounting', 'users', 'roles'];
const ACTIONS = ['create', 'read', 'update', 'delete'];

/** Runs ensureSystemRoles against an in-memory db and returns role name -> granted "resource:action" keys. */
async function grantedByRole() {
  const permissions = RESOURCES.flatMap((resource) => ACTIONS.map((action) => ({ id: `${resource}:${action}`, resource, action })));
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

describe('ensureSystemRoles — default Cashier', () => {
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

  it('leaves Tenant Admin with every permission and Branch Manager with stock control', async () => {
    const roles = await grantedByRole();
    expect(roles.get('Tenant Admin')).toHaveLength(RESOURCES.length * ACTIONS.length);
    expect(roles.get('Branch Manager')).toEqual(expect.arrayContaining(['inventory:update', 'customers:update']));
  });
});
