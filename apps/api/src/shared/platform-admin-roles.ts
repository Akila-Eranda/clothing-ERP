import { RoleType } from '@prisma/client';

/** Roles that may use the company Platform Admin console. */
export const PLATFORM_ADMIN_ROLES: RoleType[] = [
  RoleType.SUPER_ADMIN,
  RoleType.PLATFORM_STAFF,
];

export function isPlatformAdminRole(roles: string[] | null | undefined): boolean {
  if (!roles?.length) return false;
  return roles.some((r) =>
    PLATFORM_ADMIN_ROLES.includes(r as RoleType) || r === 'SUPER_ADMIN' || r === 'PLATFORM_STAFF',
  );
}

export function isSuperAdminRole(roles: string[] | null | undefined): boolean {
  if (!roles?.length) return false;
  return roles.some((r) => r === RoleType.SUPER_ADMIN || r === 'SUPER_ADMIN');
}
