import { NotFoundException } from '@nestjs/common';
import { TransferStatus } from '@prisma/client';

export function assertTransferBranchAccess(input: {
  status: TransferStatus;
  fromBranchId: string;
  toBranchId: string;
  actorBranchId?: string;
  canManageAllBranches: boolean;
}): void {
  if (input.canManageAllBranches) return;
  const requiredBranchId = input.status === TransferStatus.RECEIVED
    ? input.toBranchId
    : input.fromBranchId;
  if (!input.actorBranchId || input.actorBranchId !== requiredBranchId) {
    throw new NotFoundException('Transfer not found');
  }
}
