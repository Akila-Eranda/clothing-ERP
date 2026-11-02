import { RoleType } from '@prisma/client';

/** Roles that may use the company Platform Admin console. */
export const PLATFORM_ADMIN_ROLES: RoleType[] = [
  RoleType.SUPER_ADMIN,
  RoleType.PLATFORM_STAFF,
];

/**
 * Role types a tenant may create or assign through tenant user / role management.
 * Platform types (SUPER_ADMIN, PLATFORM_STAFF) bypass tenant isolation and are only
 * granted through the Platform Admin console (platform-ops).
 */
export const TENANT_ASSIGNABLE_ROLE_TYPES: RoleType[] = (Object.values(RoleType) as RoleType[]).filter(
  (t) => !PLATFORM_ADMIN_ROLES.includes(t),
);

export function isPlatformRoleType(type: RoleType | string | null | undefined): boolean {
  return !!type && PLATFORM_ADMIN_ROLES.includes(type as RoleType);
}

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
