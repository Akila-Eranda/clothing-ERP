import { RoleType } from '@prisma/client';

/** Roles that may view all cashiers' POS sales / held bills in the shop. */
const ALL_SALES_ROLES: string[] = [
  RoleType.SUPER_ADMIN,
  RoleType.TENANT_ADMIN,
  RoleType.BRANCH_MANAGER,
  RoleType.ACCOUNTANT,
  RoleType.INVENTORY_MANAGER,
];

/** Cashiers (and similar) only see their own POS bills. */
export function canViewAllPosSales(roles: string[] = []): boolean {
  return roles.some((r) => ALL_SALES_ROLES.includes(r));
}
