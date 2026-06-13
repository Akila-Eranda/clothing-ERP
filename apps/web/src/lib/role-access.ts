import { normalizeRole } from '@/lib/utils';

const POS_ONLY_ROLES = new Set(['cashier']);

const FULL_ACCESS_ROLES = new Set([
  'super_admin',
  'tenant_admin',
  'branch_manager',
  'inventory_manager',
  'accountant',
  'hr_manager',
]);

/** Cashier (and similar front-desk roles) — POS terminal only, no ERP navigation. */
export function isPosOnlyRole(role?: string | null): boolean {
  const r = normalizeRole(role);
  if (FULL_ACCESS_ROLES.has(r)) return false;
  return POS_ONLY_ROLES.has(r);
}

export function isPosOnlyFromApiRoles(roles?: string[] | null): boolean {
  if (!roles?.length) return false;
  const upper = roles.map((r) => r.toUpperCase().replace(/-/g, '_'));
  if (upper.some((r) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'BRANCH_MANAGER', 'INVENTORY_MANAGER'].includes(r))) {
    return false;
  }
  return upper.includes('CASHIER');
}

export const POS_HOME_PATH = '/pos';
