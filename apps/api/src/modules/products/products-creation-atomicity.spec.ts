import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

function dto(over: Record<string, unknown> = {}) {
  return {
    name: 'Milk',
    sku: 'MILK-1',
    sellingPrice: 200,
    costPrice: 150,
    mrp: 220,
    ...over,
  } as any;
}

function harness(seedOpeningStock: jest.Mock = jest.fn(async () => ({ created: 1 }))) {
  const product = {
    id: 'product-1',
    tenantId: 'tenant-1',
    name: 'Milk',
    slug: 'milk',
    sku: 'MILK-1',
    category: null,
    brand: null,
    _count: { variants: 1 },
  };
  const createdVariant = { id: 'variant-1' };
  const tx: any = {
    product: {
      create: jest.fn(async () => product),
    },
    productVariant: {
      create: jest.fn(async () => createdVariant),
      createMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => [createdVariant]),
    },
    supplier: { findMany: jest.fn(async () => []) },
    supplierProductAssignment: { upsert: jest.fn() },
    branch: {
      findMany: jest.fn(async () => [{ id: 'branch-1', code: 'MAIN', name: 'Main' }]),
      findFirst: jest.fn(async () => ({ id: 'branch-1', code: 'MAIN', name: 'Main' })),
    },
    warehouse: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'warehouse-1' })),
    },
    inventory: {
      createMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const prisma: any = {
    tenant: { findUnique: jest.fn(async () => ({ maxProducts: 100 })) },
    product: {
      count: jest.fn(async () => 0),
      findFirst: jest.fn(async () => null),
    },
    $transaction: jest.fn(async (callback: (client: any) => Promise<unknown>) => callback(tx)),
  };
  const inventory: any = {
    seedOpeningStock,
    applyInventoryStockPrefs: jest.fn(async () => undefined),
  };
  const service = new ProductsService(prisma, inventory);
  jest.spyOn(service, 'findOne').mockResolvedValue(product as any);
  return { service, prisma, tx, inventory, product };
}

describe('ProductsService creation atomicity', () => {
  it('initializes inventory using the same transaction client', async () => {
    const seedOpeningStock = jest.fn(async () => ({ created: 1 }));
    const { service, prisma, tx, inventory } = harness(seedOpeningStock);

    await service.create('tenant-1', dto({ openingStock: 5 }));

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(seedOpeningStock).toHaveBeenCalledWith(
      expect.any(Array),
      tx,
    );
    expect(inventory.applyInventoryStockPrefs).toHaveBeenCalledWith(
      'tenant-1',
      ['variant-1'],
      ['branch-1'],
      expect.objectContaining({ quantity: 5 }),
      tx,
    );
  });

  it('does not return a product when inventory initialization fails', async () => {
    const seedOpeningStock = jest.fn(async () => {
      throw new Error('inventory initialization failed');
    });
    const { service, prisma } = harness(seedOpeningStock);

    await expect(service.create('tenant-1', dto({ openingStock: 5 })))
      .rejects.toThrow('inventory initialization failed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect((service.findOne as jest.Mock)).not.toHaveBeenCalled();
  });

  it('rejects a duplicate explicit SKU before creating product records', async () => {
    const { service, prisma } = harness();
    prisma.product.findFirst.mockResolvedValueOnce({ id: 'existing' });

    await expect(service.create('tenant-1', dto())).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
