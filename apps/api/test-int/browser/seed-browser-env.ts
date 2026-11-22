/**
 * Seeds ONE isolated shop for the browser tests (throw-away local database only - same safety guard as the
 * integration tests). Prints a JSON description (no password: it comes from HEXA_BROWSER_PASSWORD).
 *
 *   HEXA_INT_DATABASE_URL=...hexa_qa...  HEXA_BROWSER_PASSWORD=...  npx ts-node --transpile-only -r tsconfig-paths/register test-int/browser/seed-browser-env.ts
 */
import * as bcrypt from 'bcryptjs';
import { RoleType, StockMovementType } from '@prisma/client';
import { connectPrisma } from '../helpers/db';
import { PERMISSION_CATALOGUE } from '../../src/shared/security/permission-catalogue';
import { ensureSystemRoles } from '../../src/modules/roles/default-system-roles';

async function main() {
  const password = process.env.HEXA_BROWSER_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set HEXA_BROWSER_PASSWORD (>= 12 chars, throw-away)');
  const prisma = await connectPrisma();
  const run = Date.now().toString(36);
  const sub = `brw${run}`;

  await Promise.all(PERMISSION_CATALOGUE.map((k) => {
    const [resource, action] = k.split(':');
    return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
  }));
  const tenant = await prisma.tenant.create({
    data: { name: `Browser Test ${run}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE', settings: { pos: { allowNegativeStock: false } } },
  });
  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Main', code: 'MAIN' } });
  await prisma.warehouse.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'Main', code: `WH-${run}`, isDefault: true } });
  await ensureSystemRoles(prisma as never, tenant.id);
  const roles = await prisma.role.findMany({ where: { tenantId: tenant.id } });
  const roleId = (type: RoleType) => roles.find((r) => r.type === type)!.id;

  const hash = await bcrypt.hash(password, 10);
  const mk = (who: string, type: RoleType) => prisma.user.create({
    data: { tenantId: tenant.id, branchId: branch.id, email: `${who}-${run}@browser.test`, passwordHash: hash, firstName: who, lastName: 'Browser', status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: roleId(type) } } },
  });
  const [admin, manager, cashier] = [await mk('admin', RoleType.TENANT_ADMIN), await mk('manager', RoleType.BRANCH_MANAGER), await mk('cashier', RoleType.CASHIER)];

  // one OPEN shift per user so the POS opens straight away
  for (const u of [admin, manager, cashier]) {
    await prisma.cashRegister.create({ data: { tenantId: tenant.id, branchId: branch.id, cashierId: u.id, openingCash: 1000, status: 'OPEN' } });
  }

  const products: { name: string; price: number; sku: string }[] = [];
  for (const [name, price, qty] of [['Milk', 100, 50], ['Rice', 250, 50], ['Sugar', 300, 50], ['LastUnit', 100, 1]] as const) {
    const sku = `${name.toUpperCase()}-${run}`;
    const p = await prisma.product.create({
      data: { tenantId: tenant.id, name, slug: `${name.toLowerCase()}-${run}`, sku, sellingPrice: price, costPrice: price * 0.7, mrp: price + 20, unit: 'pcs', barcode: `99${Math.floor(Math.random() * 1e9)}`,
        variants: { create: { sku: `${sku}-V`, name: 'Default', sellingPrice: price, costPrice: price * 0.7, mrp: price + 20 } } },
      include: { variants: true },
    });
    const { InventoryService } = await import('../../src/modules/inventory/inventory.service');
    void InventoryService; // stock is written directly below (no Nest container in this script)
    const wh = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: tenant.id, branchId: branch.id } });
    await prisma.inventory.create({ data: { tenantId: tenant.id, warehouseId: wh.id, variantId: p.variants[0].id, branchId: branch.id, quantity: qty } as never });
    products.push({ name, price, sku });
  }
  void StockMovementType;

  console.log(JSON.stringify({
    subdomain: sub, tenantId: tenant.id, branchId: branch.id,
    users: { admin: admin.email, manager: manager.email, cashier: cashier.email },
    products,
  }));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
