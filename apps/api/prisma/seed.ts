import { PrismaClient, RoleType, SubscriptionPlan, TenantStatus } from '@prisma/client';
import type { Permission } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Tenant ────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      name: 'Demo Fashion Store',
      subdomain: 'demo',
      email: 'admin@demo.fashionerp.com',
      plan: SubscriptionPlan.PROFESSIONAL,
      status: TenantStatus.ACTIVE,
      currency: 'INR',
      country: 'IN',
      timezone: 'Asia/Kolkata',
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // ── Branch ────────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HO-001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Main Store - Head Office',
      code: 'HO-001',
      isDefault: true,
      city: 'Mumbai',
      state: 'Maharashtra',
    },
  });
  console.log(`✅ Branch: ${branch.name} (${branch.id})`);

  // ── Permissions ───────────────────────────────────────────
  const permissionDefs = [
    // Products
    { resource: 'products', action: 'create' }, { resource: 'products', action: 'read' },
    { resource: 'products', action: 'update' }, { resource: 'products', action: 'delete' },
    // Inventory
    { resource: 'inventory', action: 'create' }, { resource: 'inventory', action: 'read' },
    { resource: 'inventory', action: 'update' },
    // Sales
    { resource: 'sales', action: 'create' }, { resource: 'sales', action: 'read' },
    { resource: 'sales', action: 'update' },
    // Customers
    { resource: 'customers', action: 'create' }, { resource: 'customers', action: 'read' },
    { resource: 'customers', action: 'update' }, { resource: 'customers', action: 'delete' },
    // Suppliers
    { resource: 'suppliers', action: 'create' }, { resource: 'suppliers', action: 'read' },
    // Purchases
    { resource: 'purchases', action: 'create' }, { resource: 'purchases', action: 'read' },
    { resource: 'purchases', action: 'update' },
    // Reports
    { resource: 'reports', action: 'read' },
    // Accounting
    { resource: 'accounting', action: 'create' }, { resource: 'accounting', action: 'read' },
    // HR
    { resource: 'hr', action: 'create' }, { resource: 'hr', action: 'read' },
    { resource: 'hr', action: 'update' },
    // Users
    { resource: 'users', action: 'create' }, { resource: 'users', action: 'read' },
    { resource: 'users', action: 'update' }, { resource: 'users', action: 'delete' },
    // Roles
    { resource: 'roles', action: 'create' }, { resource: 'roles', action: 'read' },
    { resource: 'roles', action: 'update' },
  ];

  const permissions = await Promise.all(
    permissionDefs.map((p) =>
      prisma.permission.upsert({
        where: { resource_action: { resource: p.resource, action: p.action } },
        update: {},
        create: { resource: p.resource, action: p.action },
      }),
    ),
  );
  console.log(`✅ Seeded ${permissions.length} permissions`);

  // ── Roles ─────────────────────────────────────────────────
  const superAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Super Admin' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Super Admin', type: RoleType.SUPER_ADMIN, isSystem: true },
  });

  const tenantAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Tenant Admin' } },
    update: {},
    create: {
      tenantId: tenant.id, name: 'Tenant Admin', type: RoleType.TENANT_ADMIN, isSystem: true,
      permissions: { create: permissions.map((p: Permission) => ({ permissionId: p.id })) },
    },
  });

  const cashierRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Cashier' } },
    update: {},
    create: {
      tenantId: tenant.id, name: 'Cashier', type: RoleType.CASHIER, isSystem: true,
      permissions: {
        create: permissions
          .filter((p: Permission) => ['sales', 'customers', 'inventory', 'products'].includes(p.resource) && p.action !== 'delete')
          .map((p: Permission) => ({ permissionId: p.id })),
      },
    },
  });
  console.log('✅ Seeded roles: Super Admin, Tenant Admin, Cashier');

  // ── Admin User ────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@123456', 12);

  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.fashionerp.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'admin@demo.fashionerp.com',
      firstName: 'Admin',
      lastName: 'User',
      passwordHash,
      emailVerified: true,
      roles: {
        create: [{ roleId: superAdminRole.id }, { roleId: tenantAdminRole.id }],
      },
    },
  });
  console.log(`✅ Admin user: ${adminUser.email} (password: Admin@123456)`);

  // ── Demo Cashier ──────────────────────────────────────────
  const cashierUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'cashier@demo.fashionerp.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'cashier@demo.fashionerp.com',
      firstName: 'Demo',
      lastName: 'Cashier',
      passwordHash: await bcrypt.hash('Cashier@123456', 12),
      emailVerified: true,
      roles: { create: [{ roleId: cashierRole.id }] },
    },
  });
  console.log(`✅ Cashier user: ${cashierUser.email} (password: Cashier@123456)`);

  // ── Demo Categories ───────────────────────────────────────
  const categories = ['Men\'s Wear', 'Women\'s Wear', 'Kids\' Wear', 'Accessories', 'Footwear'];
  for (const name of categories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-') } },
      update: {},
      create: {
        tenantId: tenant.id,
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      },
    });
  }
  console.log(`✅ Seeded ${categories.length} categories`);

  console.log('\n🎉 Seeding completed successfully!\n');
  console.log('Login credentials:');
  console.log('  Admin: admin@demo.fashionerp.com / Admin@123456');
  console.log('  Cashier: cashier@demo.fashionerp.com / Cashier@123456');
}

main()
  .catch((e) => { console.error('❌ Seeding failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
