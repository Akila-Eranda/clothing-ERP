import { RoleType } from '@prisma/client';

/** Shop owners / super admins act directly — no approval queue. */
export function bypassesWorkflowApproval(roles: string[]): boolean {
  return roles.includes(RoleType.SUPER_ADMIN) || roles.includes(RoleType.TENANT_ADMIN);
}
