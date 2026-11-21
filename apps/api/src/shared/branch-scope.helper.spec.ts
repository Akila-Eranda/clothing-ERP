import { resolveBranchScope } from './branch-scope.helper';
import { ForbiddenException } from '@nestjs/common';

describe('resolveBranchScope', () => {
  it('keeps assigned users on their branch when a selector is omitted or forged', () => {
    const user = { roles: ['BRANCH_MANAGER'], branchId: 'branch-a' };

    expect(resolveBranchScope(user, undefined)).toBe('branch-a');
    expect(resolveBranchScope(user, 'branch-b')).toBe('branch-a');
  });

  it('lets tenant admins select a branch or keep the tenant-wide view', () => {
    const user = { roles: ['TENANT_ADMIN'], branchId: 'branch-home' };

    expect(resolveBranchScope(user, 'branch-b')).toBe('branch-b');
    expect(resolveBranchScope(user, undefined)).toBeUndefined();
  });

  it('treats an empty selector as omitted', () => {
    expect(resolveBranchScope({ roles: ['CASHIER'], branchId: 'branch-a' }, '')).toBe('branch-a');
  });

  it('does not let an unassigned non-admin select a branch', () => {
    expect(() => resolveBranchScope({ roles: ['CASHIER'] }, 'branch-a')).toThrow(ForbiddenException);
  });
});
