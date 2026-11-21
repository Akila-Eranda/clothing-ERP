import { NotFoundException } from '@nestjs/common';
import { TransferStatus } from '@prisma/client';
import { assertTransferBranchAccess } from './transfer-branch-scope.helper';

const transfer = {
  fromBranchId: 'branch-from',
  toBranchId: 'branch-to',
  canManageAllBranches: false,
};

describe('transfer branch access', () => {
  it('allows dispatch and cancellation only from the source branch', () => {
    expect(() => assertTransferBranchAccess({
      ...transfer,
      actorBranchId: 'branch-from',
      status: TransferStatus.IN_TRANSIT,
    })).not.toThrow();
    expect(() => assertTransferBranchAccess({
      ...transfer,
      actorBranchId: 'branch-from',
      status: TransferStatus.CANCELLED,
    })).not.toThrow();
    expect(() => assertTransferBranchAccess({
      ...transfer,
      actorBranchId: 'branch-to',
      status: TransferStatus.CANCELLED,
    })).toThrow(NotFoundException);
  });

  it('allows receipt only from the destination branch', () => {
    expect(() => assertTransferBranchAccess({
      ...transfer,
      actorBranchId: 'branch-to',
      status: TransferStatus.RECEIVED,
    })).not.toThrow();
    expect(() => assertTransferBranchAccess({
      ...transfer,
      actorBranchId: 'branch-from',
      status: TransferStatus.RECEIVED,
    })).toThrow(NotFoundException);
  });

  it('keeps tenant-wide administrators able to manage all branches', () => {
    expect(() => assertTransferBranchAccess({
      ...transfer,
      actorBranchId: undefined,
      canManageAllBranches: true,
      status: TransferStatus.RECEIVED,
    })).not.toThrow();
  });
});
