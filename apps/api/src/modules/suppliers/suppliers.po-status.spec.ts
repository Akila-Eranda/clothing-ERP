import { BadRequestException, ConflictException } from '@nestjs/common';
import { PurchaseOrderStatus } from '@prisma/client';
import { SuppliersService } from './suppliers.module';

type Tx = {
  $queryRaw: jest.Mock;
  purchaseOrder: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
};

function serviceFor(tx: Tx, purchase: Record<string, unknown> | null, updateCount = 1) {
  tx.purchaseOrder.findFirst.mockResolvedValue(purchase);
  tx.purchaseOrder.updateMany.mockResolvedValue({ count: updateCount });
  const db = {
    $transaction: jest.fn(async (callback: (client: Tx) => unknown) => callback(tx)),
  };
  const service = Object.create(SuppliersService.prototype) as SuppliersService;
  (service as unknown as { prisma: typeof db }).prisma = db;
  return service;
}

describe('SuppliersService PO status transitions', () => {
  const tx = (): Tx => ({
    $queryRaw: jest.fn().mockResolvedValue([]),
    purchaseOrder: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  });

  it('allows the explicit non-workflow DRAFT to SENT transition', async () => {
    const client = tx();
    const service = serviceFor(client, { id: 'po-1', tenantId: 'tenant-1', status: PurchaseOrderStatus.DRAFT });
    await service.updatePOStatus('po-1', 'tenant-1', PurchaseOrderStatus.SENT);
    expect(client.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'po-1', tenantId: 'tenant-1', status: PurchaseOrderStatus.DRAFT },
      data: { status: PurchaseOrderStatus.SENT },
    });
  });

  it('rejects direct confirmation and receive/close bypasses', async () => {
    const client = tx();
    const service = serviceFor(client, { id: 'po-1', tenantId: 'tenant-1', status: PurchaseOrderStatus.DRAFT });
    await expect(service.updatePOStatus('po-1', 'tenant-1', PurchaseOrderStatus.CONFIRMED))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updatePOStatus('po-1', 'tenant-1', PurchaseOrderStatus.RECEIVED))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(client.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent transition when the conditional update loses the row', async () => {
    const client = tx();
    const service = serviceFor(
      client,
      { id: 'po-1', tenantId: 'tenant-1', status: PurchaseOrderStatus.DRAFT },
      0,
    );
    await expect(service.updatePOStatus('po-1', 'tenant-1', PurchaseOrderStatus.SENT))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
