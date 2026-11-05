/**
 * Every permission ("resource:action") the API can check. Single source of truth for the seed, the
 * permission-catalogue migration and new-tenant role defaults.
 *
 * Adding a string to @RequirePermissions / @RequireAnyPermissions without adding it here fails
 * permission-catalogue.spec.ts — a permission that does not exist in the database can be granted to
 * nobody, which silently locked shop admins out of ~60 endpoints before (audit F-06).
 */
export const PERMISSION_CATALOGUE = [
  'accounting:create', 'accounting:read', 'accounting:update', 'accounting:delete',
  'cash:create', 'cash:read', 'cash:update',
  'customers:create', 'customers:read', 'customers:update', 'customers:delete',
  'hr:create', 'hr:read', 'hr:update',
  'inventory:create', 'inventory:read', 'inventory:update',
  'products:create', 'products:read', 'products:update', 'products:delete',
  'purchases:create', 'purchases:read', 'purchases:update',
  'reports:read',
  'returns:create', 'returns:read', 'returns:update',
  'roles:create', 'roles:read', 'roles:update',
  'sales:create', 'sales:read', 'sales:update',
  'settings:read',
  'suppliers:create', 'suppliers:read', 'suppliers:update', 'suppliers:delete',
  'users:create', 'users:read', 'users:update', 'users:delete',
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOGUE)[number];

export function splitPermissionKey(key: string): { resource: string; action: string } {
  const [resource, action] = key.split(':');
  return { resource, action };
}
