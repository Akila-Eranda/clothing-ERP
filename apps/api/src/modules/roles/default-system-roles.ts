import { Prisma, RoleType } from '@prisma/client';
import { PERMISSION_CATALOGUE } from '@/shared/security/permission-catalogue';

type Db = Prisma.TransactionClient | { permission: Prisma.TransactionClient['permission']; role: Prisma.TransactionClient['role']; rolePermission: Prisma.TransactionClient['rolePermission'] };

/**
 * Never granted to the default Cashier role: they change prices / cost / MRP (and so defeat the
 * POS price guard), adjust stock and lots directly, or post journals and bank / cash transfers.
 */
export const CASHIER_DENIED_PERMISSIONS: ReadonlySet<string> = new Set([
  'sales:delete',
  'customers:delete',
  'inventory:delete',
  'products:delete',
  'cash:delete',
  'products:update',
  'inventory:update',
  'accounting:create',
  'accounting:update',
  'accounting:delete',
]);

export interface SystemRoleDefinition {
  name: string;
  type: RoleType;
  /** "resource:action" keys, limited to permissions that exist. */
  permissions: string[];
}

/** Default permission packs for the standard shop roles, given the permissions that exist. */
export function systemRoleDefinitions(existingKeys: readonly string[]): SystemRoleDefinition[] {
  const exists = new Set(existingKeys);
  const catalogue = (PERMISSION_CATALOGUE as readonly string[]).filter((k) => exists.has(k));
  const pick = (...keys: string[]) => keys.filter((k) => exists.has(k));

  const cashierBase = catalogue.filter(
    (k) => ['sales', 'customers', 'inventory', 'products', 'cash'].includes(k.split(':')[0]) && !CASHIER_DENIED_PERMISSIONS.has(k),
  );
  // POS Quick GRN / supplier pay need list + register supplier at the counter.
  // Drawer expenses use cash:create (POST /accounting/expenses accepts it); no accounting:create.
  const cashierExtra = pick('suppliers:read', 'suppliers:create', 'purchases:read', 'purchases:create', 'purchases:update', 'accounting:read');

  return [
    { name: 'Cashier', type: RoleType.CASHIER, permissions: [...new Set([...cashierBase, ...cashierExtra])] },
    // Full shop scope: every catalogue permission (never stray or platform rows).
    { name: 'Tenant Admin', type: RoleType.TENANT_ADMIN, permissions: catalogue },
    {
      name: 'Branch Manager', type: RoleType.BRANCH_MANAGER, permissions: pick(
        'inventory:read', 'inventory:update',
        'purchases:read', 'purchases:create', 'purchases:update',
        // sales:create (Step 1B decision): a Branch Manager can ring sales. This does NOT grant discounts: manual
        // discounts stay Tenant/Super Admin only until a discount approval policy is configured.
        'sales:create', 'sales:read', 'reports:read', 'products:read',
        'customers:read', 'customers:create', 'customers:update',
        'cash:read', 'cash:update',
      ),
    },
  ];
}

const keyOf = (p: { resource: string; action: string }) => `${p.resource}:${p.action}`;

/**
 * NEW tenants only (tenant registration): create the standard roles with their default packs.
 * Never call this for an existing shop — it replaces the system roles' permissions. Existing shops
 * change roles only through the reviewed per-tenant step (scripts/review-system-roles.ts).
 */
export async function ensureSystemRoles(db: Db, tenantId: string): Promise<void> {
  const permissions = await db.permission.findMany();
  const idByKey = new Map(permissions.map((p) => [keyOf(p), p.id]));
  for (const def of systemRoleDefinitions([...idByKey.keys()])) {
    const role = await db.role.upsert({
      where: { tenantId_name: { tenantId, name: def.name } },
      update: { type: def.type, isSystem: true },
      create: { tenantId, name: def.name, type: def.type, isSystem: true },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (def.permissions.length) {
      await db.rolePermission.createMany({
        data: def.permissions.map((k) => ({ roleId: role.id, permissionId: idByKey.get(k)! })),
        skipDuplicates: true,
      });
    }
  }
}

/**
 * Create any missing standard role (with its default pack). Existing roles — and their permissions —
 * are never modified. Safe to call for an existing tenant.
 */
export async function ensureSystemRolesExist(db: Db, tenantId: string): Promise<string[]> {
  const permissions = await db.permission.findMany();
  const idByKey = new Map(permissions.map((p) => [keyOf(p), p.id]));
  const created: string[] = [];
  for (const def of systemRoleDefinitions([...idByKey.keys()])) {
    const existing = await db.role.findUnique({ where: { tenantId_name: { tenantId, name: def.name } } });
    if (existing) continue;
    await db.role.create({
      data: {
        tenantId, name: def.name, type: def.type, isSystem: true,
        permissions: { create: def.permissions.map((k) => ({ permissionId: idByKey.get(k)! })) },
      },
    });
    created.push(def.name);
  }
  return created;
}

export interface RoleChangePlan {
  role: string;
  exists: boolean;
  add: string[];
  remove: string[];
  /** Number of permissions the role already has that are in its default pack (kept as they are). */
  unchanged: number;
}

/**
 * Pure diff between a tenant's current system roles and the default packs. Used by the reviewed
 * per-tenant step; nothing is applied here.
 */
export function planSystemRoleChanges(
  current: { name: string; permissions: string[] }[],
  existingKeys: readonly string[],
): RoleChangePlan[] {
  const byName = new Map(current.map((r) => [r.name, new Set(r.permissions)]));
  return systemRoleDefinitions(existingKeys).map((def) => {
    const have = byName.get(def.name);
    const want = new Set(def.permissions);
    if (!have) return { role: def.name, exists: false, add: [...want].sort(), remove: [], unchanged: 0 };
    return {
      role: def.name,
      exists: true,
      add: [...want].filter((k) => !have.has(k)).sort(),
      remove: [...have].filter((k) => !want.has(k)).sort(),
      unchanged: [...have].filter((k) => want.has(k)).length,
    };
  });
}
