import { ForbiddenException } from '@nestjs/common';
import { IAuthUser } from '@/common/decorators/current-user.decorator';

export function canSwitchBranches(roles: readonly string[] | undefined): boolean {
  return roles?.some((role) => role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN') ?? false;
}

export function resolveBranchScope(
  user: Pick<IAuthUser, 'branchId' | 'roles'>,
  requestedBranchId?: string | null,
): string | undefined {
  const requested = requestedBranchId?.trim() || undefined;
  if (canSwitchBranches(user.roles)) return requested;
  if (user.branchId) return user.branchId;
  if (requested) throw new ForbiddenException('You can only access your assigned branch.');

  return undefined;
}
