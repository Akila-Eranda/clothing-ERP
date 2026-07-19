import { Prisma, RoleType } from '@prisma/client';

type Db = Prisma.TransactionClient | { permission: Prisma.TransactionClient['permission']; role: Prisma.TransactionClient['role']; rolePermission: Prisma.TransactionClient['rolePermission'] };

/** Ensure standard shop staff roles exist for a tenant (idempotent). */
export async function ensureSystemRoles(db: Db, tenantId: string): Promise<void> {
  const permissions = await db.permission.findMany();

  const permIds = (...keys: string[]) =>
    permissions
      .filter((p) => keys.includes(`${p.resource}:${p.action}`))
      .map((p) => p.id);

  const syncRolePermissions = async (roleId: string, permissionIds: string[]) => {
    await db.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length) {
      await db.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      });
    }
  };

  const upsertRole = async (
    name: string,
    type: RoleType,
    permissionIds: string[],
  ) => {
    const role = await db.role.upsert({
      where: { tenantId_name: { tenantId, name } },
      update: { type, isSystem: true },
      create: { tenantId, name, type, isSystem: true },
    });
    await syncRolePermissions(role.id, permissionIds);
  };

  const cashierBase = permissions
    .filter(
      (p) =>
        ['sales', 'customers', 'inventory', 'products', 'cash'].includes(p.resource) &&
        p.action !== 'delete',
    )
    .map((p) => p.id);
  // POS Quick GRN / supplier pay need list + register supplier at the counter
  const cashierExtra = permIds(
    'suppliers:read',
    'suppliers:create',
    'purchases:read',
    'purchases:create',
    'purchases:update',
    'accounting:create',
    'accounting:read',
  );
  const cashierPermIds = [...new Set([...cashierBase, ...cashierExtra])];

  await upsertRole('Cashier', RoleType.CASHIER, cashierPermIds);

  await upsertRole('Branch Manager', RoleType.BRANCH_MANAGER, permIds(
    'inventory:read', 'inventory:update',
    'purchases:read', 'purchases:create', 'purchases:update',
    'sales:read', 'reports:read', 'products:read',
    'customers:read', 'customers:create', 'customers:update',
    'cash:read', 'cash:update',
  ));
}
