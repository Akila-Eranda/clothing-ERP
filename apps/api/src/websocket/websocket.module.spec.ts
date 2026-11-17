import { canJoinBranchRoom } from './websocket.module';

describe('canJoinBranchRoom', () => {
  it('allows an assigned user to join only their branch', () => {
    expect(canJoinBranchRoom(['CASHIER'], 'branch-a', 'branch-a')).toBe(true);
    expect(canJoinBranchRoom(['CASHIER'], 'branch-a', 'branch-b')).toBe(false);
  });

  it('allows tenant admins to join branches within their tenant', () => {
    expect(canJoinBranchRoom(['TENANT_ADMIN'], 'branch-a', 'branch-b')).toBe(true);
  });

  it('does not let unassigned non-admin users choose a branch', () => {
    expect(canJoinBranchRoom(['CASHIER'], undefined, 'branch-a')).toBe(false);
  });
});
