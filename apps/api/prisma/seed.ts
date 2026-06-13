import { PrismaClient, RoleType, SubscriptionPlan, TenantStatus, UserStatus, ShopType } from '@prisma/client';
import type { Permission } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { getShopProfile, slugifyCategory } from '../src/shared/shop-profiles';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash('Admin@123456', 12);

  // ── Platform tenant (company internal — admin3.hexalyte.com only) ──
  const platformTenant = await prisma.tenant.upsert({
    where: { subdomain: 'platform' },
    update: {},
    create: {
      name: 'Hexalyte Platform',
      subdomain: 'platform',
      email: 'admin@hexalyte.com',
      plan: SubscriptionPlan.ENTERPRISE,
      status: TenantStatus.ACTIVE,
      currency: 'LKR',
      country: 'LK',
      timezone: 'Asia/Colombo',
      maxBranches: 999,
      maxUsers: 999,
      maxProducts: 999999,
      shopType: 'CLOTHING' as const,
    },
  });
  console.log(`✅ Platform tenant: ${platformTenant.name}`);

  const platformBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: platformTenant.id, code: 'HQ' } },
    update: {},
    create: {
      tenantId: platformTenant.id,
      name: 'Headquarters',
      code: 'HQ',
      isDefault: true,
      city: 'Colombo',
      state: 'Western',
    },
  });

  const platformSuperAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: platformTenant.id, name: 'Platform Admin' } },
    update: { type: RoleType.SUPER_ADMIN },
    create: {
      tenantId: platformTenant.id,
      name: 'Platform Admin',
      type: RoleType.SUPER_ADMIN,
      isSystem: true,
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: platformTenant.id, email: 'admin@hexalyte.com' } },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: platformTenant.id,
      branchId: platformBranch.id,
      email: 'admin@hexalyte.com',
      firstName: 'Platform',
      lastName: 'Admin',
      passwordHash,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: platformSuperAdminRole.id }] },
    },
  });
  console.log('✅ Platform admin: admin@hexalyte.com (password: Admin@123456) — admin3.hexalyte.com only');

  // ── Demo shop tenant ────────────────────────────────────────
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
      shopType: 'CLOTHING' as const,
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

  const syncRolePermissions = async (roleId: string, permKeys: string[]) => {
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    const ids = permissions.filter((p) => permKeys.includes(`${p.resource}:${p.action}`));
    if (ids.length) {
      await prisma.rolePermission.createMany({
        data: ids.map((p) => ({ roleId, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  };

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

  const permIds = (...keys: string[]) =>
    permissions.filter((p) => keys.includes(`${p.resource}:${p.action}`)).map((p) => ({ permissionId: p.id }));

  const branchManagerRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Branch Manager' } },
    update: { type: RoleType.BRANCH_MANAGER },
    create: {
      tenantId: tenant.id,
      name: 'Branch Manager',
      type: RoleType.BRANCH_MANAGER,
      isSystem: true,
      permissions: {
        create: permIds(
          'inventory:read', 'inventory:update', 'purchases:read', 'purchases:create', 'purchases:update',
          'sales:read', 'reports:read', 'products:read',
        ),
      },
    },
  });

  const inventoryManagerRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Inventory Manager' } },
    update: { type: RoleType.INVENTORY_MANAGER },
    create: {
      tenantId: tenant.id,
      name: 'Inventory Manager',
      type: RoleType.INVENTORY_MANAGER,
      isSystem: true,
      permissions: {
        create: permIds(
          'inventory:read', 'inventory:update', 'inventory:create', 'products:read', 'products:update', 'reports:read',
        ),
      },
    },
  });

  const accountantRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Accountant' } },
    update: { type: RoleType.ACCOUNTANT },
    create: {
      tenantId: tenant.id,
      name: 'Accountant',
      type: RoleType.ACCOUNTANT,
      isSystem: true,
      permissions: {
        create: permIds(
          'accounting:read', 'accounting:create', 'purchases:read', 'purchases:update', 'reports:read',
        ),
      },
    },
  });

  const purchasingStaffRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Purchasing Staff' } },
    update: { type: RoleType.CUSTOM },
    create: {
      tenantId: tenant.id,
      name: 'Purchasing Staff',
      type: RoleType.CUSTOM,
      isSystem: true,
      permissions: {
        create: permIds(
          'purchases:read', 'purchases:create', 'purchases:update',
          'suppliers:read', 'products:read', 'inventory:read',
        ),
      },
    },
  });

  await syncRolePermissions(branchManagerRole.id, [
    'inventory:read', 'inventory:update', 'purchases:read', 'purchases:create', 'purchases:update',
    'sales:read', 'reports:read', 'products:read',
  ]);
  await syncRolePermissions(inventoryManagerRole.id, [
    'inventory:read', 'inventory:update', 'inventory:create', 'products:read', 'products:update', 'reports:read',
  ]);
  await syncRolePermissions(accountantRole.id, [
    'accounting:read', 'accounting:create', 'purchases:read', 'purchases:update', 'reports:read',
  ]);
  await syncRolePermissions(purchasingStaffRole.id, [
    'purchases:read', 'purchases:create', 'purchases:update',
    'suppliers:read', 'products:read', 'inventory:read',
  ]);

  console.log('✅ Seeded roles: Super Admin, Tenant Admin, Cashier, Branch Manager, Inventory Manager, Accountant, Purchasing Staff');

  // ── Shop admin (tenant owner — shop login only, NOT admin3) ──
  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.fashionerp.com' } },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'admin@demo.fashionerp.com',
      firstName: 'Admin',
      lastName: 'User',
      passwordHash,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: tenantAdminRole.id }] },
    },
  });

  // Ensure demo admin never keeps platform SUPER_ADMIN role
  await prisma.userRole.deleteMany({
    where: { userId: adminUser.id, roleId: superAdminRole.id },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: tenantAdminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: tenantAdminRole.id },
  });
  console.log(`✅ Shop admin: ${adminUser.email} (password: Admin@123456) — shop.hexalyte.com only`);

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
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: cashierRole.id }] },
    },
  });
  console.log(`✅ Cashier user: ${cashierUser.email} (password: Cashier@123456)`);

  const managerPassword = await bcrypt.hash('Manager@123456', 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'manager@demo.fashionerp.com' } },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'manager@demo.fashionerp.com',
      firstName: 'Demo',
      lastName: 'Branch Manager',
      passwordHash: managerPassword,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: branchManagerRole.id }] },
    },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'inventory@demo.fashionerp.com' } },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'inventory@demo.fashionerp.com',
      firstName: 'Demo',
      lastName: 'Inventory Manager',
      passwordHash: managerPassword,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: inventoryManagerRole.id }] },
    },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'accountant@demo.fashionerp.com' } },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'accountant@demo.fashionerp.com',
      firstName: 'Demo',
      lastName: 'Accountant',
      passwordHash: managerPassword,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: accountantRole.id }] },
    },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'purchasing@demo.fashionerp.com' } },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'purchasing@demo.fashionerp.com',
      firstName: 'Demo',
      lastName: 'Purchasing',
      passwordHash: managerPassword,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: purchasingStaffRole.id }] },
    },
  });
  console.log('✅ Workflow users: manager@ / inventory@ / accountant@ / purchasing@demo.fashionerp.com (password: Manager@123456)');

  // ── Demo Categories (clothing) ─────────────────────────────
  const clothingCategories = getShopProfile(ShopType.CLOTHING).defaultCategories;
  for (const name of clothingCategories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: tenant.id, name, slug: slugifyCategory(name) },
    });
  }
  console.log(`✅ Seeded ${clothingCategories.length} clothing categories`);

  // ── Grocery demo tenant ─────────────────────────────────────
  const groceryProfile = getShopProfile(ShopType.GROCERY);
  const groceryTenant = await prisma.tenant.upsert({
    where: { subdomain: 'grocery' },
    update: { shopType: ShopType.GROCERY },
    create: {
      name: 'Demo Grocery Mart',
      subdomain: 'grocery',
      email: 'admin@grocery.demo.fashionerp.com',
      shopType: ShopType.GROCERY,
      plan: SubscriptionPlan.PROFESSIONAL,
      status: TenantStatus.ACTIVE,
      currency: 'LKR',
      country: 'LK',
      timezone: 'Asia/Colombo',
    },
  });
  const groceryBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: groceryTenant.id, code: 'HO-001' } },
    update: {},
    create: {
      tenantId: groceryTenant.id,
      name: 'Main Store',
      code: 'HO-001',
      isDefault: true,
      city: 'Colombo',
    },
  });
  const groceryAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: groceryTenant.id, name: 'Tenant Admin' } },
    update: {},
    create: { tenantId: groceryTenant.id, name: 'Tenant Admin', type: RoleType.TENANT_ADMIN, isSystem: true },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: groceryTenant.id, email: 'admin@grocery.demo.fashionerp.com' } },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: groceryTenant.id,
      branchId: groceryBranch.id,
      email: 'admin@grocery.demo.fashionerp.com',
      firstName: 'Grocery',
      lastName: 'Admin',
      passwordHash,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: groceryAdminRole.id }] },
    },
  });
  for (const name of groceryProfile.defaultCategories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: groceryTenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: groceryTenant.id, name, slug: slugifyCategory(name) },
    });
  }
  await prisma.tenant.update({
    where: { id: groceryTenant.id },
    data: {
      settings: {
        shopProfile: {
          type: groceryProfile.type,
          defaultUnit: groceryProfile.defaultUnit,
          units: groceryProfile.units,
          modules: groceryProfile.modules,
          labelTemplates: groceryProfile.labelTemplates,
          variantAttributes: groceryProfile.variantAttributes,
        },
      },
    },
  });
  console.log('✅ Grocery demo: grocery.shop.hexalyte.com — admin@grocery.demo.fashionerp.com / Admin@123456');

  // ── Hardware demo tenant ────────────────────────────────────
  const hardwareProfile = getShopProfile(ShopType.HARDWARE);
  const hardwareTenant = await prisma.tenant.upsert({
    where: { subdomain: 'hardware' },
    update: { shopType: ShopType.HARDWARE },
    create: {
      name: 'Demo Hardware Store',
      subdomain: 'hardware',
      email: 'admin@hardware.demo.fashionerp.com',
      shopType: ShopType.HARDWARE,
      plan: SubscriptionPlan.PROFESSIONAL,
      status: TenantStatus.ACTIVE,
      currency: 'LKR',
      country: 'LK',
      timezone: 'Asia/Colombo',
    },
  });
  const hardwareBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: hardwareTenant.id, code: 'HO-001' } },
    update: {},
    create: {
      tenantId: hardwareTenant.id,
      name: 'Main Store',
      code: 'HO-001',
      isDefault: true,
      city: 'Colombo',
    },
  });
  const hardwareAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: hardwareTenant.id, name: 'Tenant Admin' } },
    update: {},
    create: { tenantId: hardwareTenant.id, name: 'Tenant Admin', type: RoleType.TENANT_ADMIN, isSystem: true },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: hardwareTenant.id, email: 'admin@hardware.demo.fashionerp.com' } },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: hardwareTenant.id,
      branchId: hardwareBranch.id,
      email: 'admin@hardware.demo.fashionerp.com',
      firstName: 'Hardware',
      lastName: 'Admin',
      passwordHash,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: hardwareAdminRole.id }] },
    },
  });
  for (const name of hardwareProfile.defaultCategories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: hardwareTenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: hardwareTenant.id, name, slug: slugifyCategory(name) },
    });
  }
  await prisma.tenant.update({
    where: { id: hardwareTenant.id },
    data: {
      settings: {
        shopProfile: {
          type: hardwareProfile.type,
          defaultUnit: hardwareProfile.defaultUnit,
          units: hardwareProfile.units,
          modules: hardwareProfile.modules,
          labelTemplates: hardwareProfile.labelTemplates,
          variantAttributes: hardwareProfile.variantAttributes,
        },
      },
    },
  });
  console.log('✅ Hardware demo: hardware.shop.hexalyte.com — admin@hardware.demo.fashionerp.com / Admin@123456');

  // ── Agriculture demo tenant ─────────────────────────────────
  const agriProfile = getShopProfile(ShopType.AGRICULTURE);
  const agriTenant = await prisma.tenant.upsert({
    where: { subdomain: 'agri' },
    update: { shopType: ShopType.AGRICULTURE },
    create: {
      name: 'Demo Agriculture Store',
      subdomain: 'agri',
      email: 'admin@agri.demo.fashionerp.com',
      shopType: ShopType.AGRICULTURE,
      plan: SubscriptionPlan.PROFESSIONAL,
      status: TenantStatus.ACTIVE,
      currency: 'LKR',
      country: 'LK',
      timezone: 'Asia/Colombo',
    },
  });
  const agriBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: agriTenant.id, code: 'HO-001' } },
    update: {},
    create: {
      tenantId: agriTenant.id,
      name: 'Main Store',
      code: 'HO-001',
      isDefault: true,
      city: 'Colombo',
    },
  });
  const agriAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: agriTenant.id, name: 'Tenant Admin' } },
    update: {},
    create: { tenantId: agriTenant.id, name: 'Tenant Admin', type: RoleType.TENANT_ADMIN, isSystem: true },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: agriTenant.id, email: 'admin@agri.demo.fashionerp.com' } },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: agriTenant.id,
      branchId: agriBranch.id,
      email: 'admin@agri.demo.fashionerp.com',
      firstName: 'Agri',
      lastName: 'Admin',
      passwordHash,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: agriAdminRole.id }] },
    },
  });
  for (const name of agriProfile.defaultCategories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: agriTenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: agriTenant.id, name, slug: slugifyCategory(name) },
    });
  }
  await prisma.tenant.update({
    where: { id: agriTenant.id },
    data: {
      settings: {
        shopProfile: {
          type: agriProfile.type,
          defaultUnit: agriProfile.defaultUnit,
          units: agriProfile.units,
          modules: agriProfile.modules,
          labelTemplates: agriProfile.labelTemplates,
          variantAttributes: agriProfile.variantAttributes,
        },
      },
    },
  });
  console.log('✅ Agriculture demo: agri.shop.hexalyte.com — admin@agri.demo.fashionerp.com / Admin@123456');

  // ── Spare Parts demo tenant ─────────────────────────────────
  const spareProfile = getShopProfile(ShopType.SPARE_PARTS);
  const spareTenant = await prisma.tenant.upsert({
    where: { subdomain: 'spareparts' },
    update: { shopType: ShopType.SPARE_PARTS },
    create: {
      name: 'Demo Spare Parts Store',
      subdomain: 'spareparts',
      email: 'admin@spareparts.demo.fashionerp.com',
      shopType: ShopType.SPARE_PARTS,
      plan: SubscriptionPlan.PROFESSIONAL,
      status: TenantStatus.ACTIVE,
      currency: 'LKR',
      country: 'LK',
      timezone: 'Asia/Colombo',
    },
  });
  const spareBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: spareTenant.id, code: 'HO-001' } },
    update: {},
    create: {
      tenantId: spareTenant.id,
      name: 'Main Parts Store',
      code: 'HO-001',
      isDefault: true,
      city: 'Colombo',
    },
  });
  const spareBranch2 = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: spareTenant.id, code: 'BR-002' } },
    update: {},
    create: {
      tenantId: spareTenant.id,
      name: 'Branch — Kandy',
      code: 'BR-002',
      city: 'Kandy',
    },
  });
  const spareAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: spareTenant.id, name: 'Tenant Admin' } },
    update: {},
    create: { tenantId: spareTenant.id, name: 'Tenant Admin', type: RoleType.TENANT_ADMIN, isSystem: true },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: spareTenant.id, email: 'admin@spareparts.demo.fashionerp.com' } },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: spareTenant.id,
      branchId: spareBranch.id,
      email: 'admin@spareparts.demo.fashionerp.com',
      firstName: 'Spare',
      lastName: 'Admin',
      passwordHash,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: spareAdminRole.id }] },
    },
  });
  for (const name of spareProfile.defaultCategories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: spareTenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: spareTenant.id, name, slug: slugifyCategory(name) },
    });
  }
  const toyotaBrand = await prisma.vehicleBrand.upsert({
    where: { tenantId_name: { tenantId: spareTenant.id, name: 'Toyota' } },
    update: {},
    create: { tenantId: spareTenant.id, name: 'Toyota' },
  });
  const hondaBrand = await prisma.vehicleBrand.upsert({
    where: { tenantId_name: { tenantId: spareTenant.id, name: 'Honda' } },
    update: {},
    create: { tenantId: spareTenant.id, name: 'Honda' },
  });
  const toyotaAxio = await prisma.vehicleModel.findFirst({ where: { tenantId: spareTenant.id, brandId: toyotaBrand.id, name: 'Axio' } })
    ?? await prisma.vehicleModel.create({
      data: { tenantId: spareTenant.id, brandId: toyotaBrand.id, name: 'Axio', yearFrom: 2012, yearTo: 2020, engineCapacity: '1500cc' },
    });
  await prisma.vehicleModel.findFirst({ where: { tenantId: spareTenant.id, brandId: hondaBrand.id, name: 'Vezel' } })
    ?? await prisma.vehicleModel.create({
      data: { tenantId: spareTenant.id, brandId: hondaBrand.id, name: 'Vezel', yearFrom: 2014, yearTo: 2022, engineCapacity: '1500cc' },
    });
  void toyotaAxio;
  await prisma.tenant.update({
    where: { id: spareTenant.id },
    data: {
      settings: {
        shopProfile: {
          type: spareProfile.type,
          defaultUnit: spareProfile.defaultUnit,
          units: spareProfile.units,
          modules: spareProfile.modules,
          labelTemplates: spareProfile.labelTemplates,
          variantAttributes: spareProfile.variantAttributes,
        },
      },
    },
  });
  console.log('✅ Spare Parts demo: spareparts.shop.hexalyte.com — admin@spareparts.demo.fashionerp.com / Admin@123456');

  await prisma.user.updateMany({
    where: { emailVerified: true, status: UserStatus.PENDING_VERIFICATION },
    data: { status: UserStatus.ACTIVE },
  });

  console.log('\n🎉 Seeding completed successfully!\n');
  console.log('Company admin (admin3.hexalyte.com):');
  console.log('  admin@hexalyte.com / Admin@123456');
  console.log('Shop login (shop.hexalyte.com):');
  console.log('  Clothing demo: admin@demo.fashionerp.com / Admin@123456');
  console.log('  Grocery demo:  admin@grocery.demo.fashionerp.com / Admin@123456 (subdomain: grocery)');
  console.log('  Hardware demo: admin@hardware.demo.fashionerp.com / Admin@123456 (subdomain: hardware)');
  console.log('  Agri demo:     admin@agri.demo.fashionerp.com / Admin@123456 (subdomain: agri)');
  console.log('  Spare Parts:   admin@spareparts.demo.fashionerp.com / Admin@123456 (subdomain: spareparts)');
  console.log('  Cashier:       cashier@demo.fashionerp.com / Cashier@123456');
  console.log('  Branch Mgr:    manager@demo.fashionerp.com / Manager@123456');
  console.log('  Inv. Manager:  inventory@demo.fashionerp.com / Manager@123456');
  console.log('  Accountant:    accountant@demo.fashionerp.com / Manager@123456');
  console.log('  Purchasing:    purchasing@demo.fashionerp.com / Manager@123456');
}

main()
  .catch((e) => { console.error('❌ Seeding failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
