import { SparePartsService } from './spare-parts.module';

/** Part lookup by VIN / chassis number (search audit, 6 Nov 2026). */
describe('SparePartsService.searchCompatibleParts — VIN lookup', () => {
  function make(vehicle: { vehicleModelId: string | null } | null) {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ shopType: 'TIRE_SHOP' }) },
      customerVehicle: { findFirst: jest.fn().mockResolvedValue(vehicle) },
      vehicleModel: { findMany: jest.fn().mockResolvedValue([{ id: 'm1', brand: { name: 'Toyota' }, name: 'Axio' }]) },
      partCompatibility: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new SparePartsService(prisma as never, {} as never) };
  }

  it('an unknown VIN returns no parts instead of every part', async () => {
    const { prisma, service } = make(null);
    await expect(service.searchCompatibleParts('t1', { vin: 'NOPE123' })).resolves.toEqual({ models: [], parts: [] });
    expect(prisma.vehicleModel.findMany).not.toHaveBeenCalled();
  });

  it('a vehicle without a catalogue model returns no parts', async () => {
    const { service } = make({ vehicleModelId: null });
    await expect(service.searchCompatibleParts('t1', { vin: 'TWVIN' })).resolves.toEqual({ models: [], parts: [] });
  });

  it('matches VIN or chassis number, tenant-scoped, trimmed and with % _ treated literally', async () => {
    const { prisma, service } = make({ vehicleModelId: 'm1' });
    await service.searchCompatibleParts('t1', { vin: '  100%_x  ' });
    const where = prisma.customerVehicle.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.OR).toEqual([
      { vin: { contains: '100\\%\\_x', mode: 'insensitive' } },
      { chassisNo: { contains: '100\\%\\_x', mode: 'insensitive' } },
    ]);
    expect(prisma.vehicleModel.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', id: 'm1' });
  });

  it('a blank VIN is ignored (normal brand/model lookup)', async () => {
    const { prisma, service } = make(null);
    await service.searchCompatibleParts('t1', { vin: '   ' });
    expect(prisma.customerVehicle.findFirst).not.toHaveBeenCalled();
    expect(prisma.vehicleModel.findMany).toHaveBeenCalled();
  });
});
