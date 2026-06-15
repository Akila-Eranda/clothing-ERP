"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new client_1.PrismaClient();
const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '-');
async function main() {
    console.log('🌱 Seeding database...');
    const passwordHash = await bcrypt.hash('Admin@123456', 12);
    const platformTenant = await prisma.tenant.upsert({
        where: { subdomain: 'platform' },
        update: {},
        create: {
            name: 'Hexalyte Platform',
            subdomain: 'platform',
            email: 'admin@hexalyte.com',
            plan: client_1.SubscriptionPlan.ENTERPRISE,
            status: client_1.TenantStatus.ACTIVE,
            currency: 'LKR',
            country: 'LK',
            timezone: 'Asia/Colombo',
            maxBranches: 999,
            maxUsers: 999,
            maxProducts: 999999,
            shopType: client_1.ShopType.CLOTHING,
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
        update: { type: client_1.RoleType.SUPER_ADMIN },
        create: {
            tenantId: platformTenant.id,
            name: 'Platform Admin',
            type: client_1.RoleType.SUPER_ADMIN,
            isSystem: true,
        },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: platformTenant.id, email: 'admin@hexalyte.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: platformTenant.id,
            branchId: platformBranch.id,
            email: 'admin@hexalyte.com',
            firstName: 'Platform',
            lastName: 'Admin',
            passwordHash,
      emailVerified: true,
      status: client_1.UserStatus.ACTIVE,
      roles: { create: [{ roleId: platformSuperAdminRole.id }] },
        },
    });
    console.log('✅ Platform admin: admin@hexalyte.com (password: Admin@123456) — admin3.hexalyte.com only');
    const tenant = await prisma.tenant.upsert({
        where: { subdomain: 'demo' },
        update: {},
        create: {
            name: 'Demo Fashion Store',
            subdomain: 'demo',
            email: 'admin@demo.fashionerp.com',
            plan: client_1.SubscriptionPlan.PROFESSIONAL,
            status: client_1.TenantStatus.ACTIVE,
            currency: 'INR',
            country: 'IN',
            timezone: 'Asia/Kolkata',
            shopType: client_1.ShopType.CLOTHING,
        },
    });
    console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);
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
    const permissionDefs = [
        { resource: 'products', action: 'create' }, { resource: 'products', action: 'read' },
        { resource: 'products', action: 'update' }, { resource: 'products', action: 'delete' },
        { resource: 'inventory', action: 'create' }, { resource: 'inventory', action: 'read' },
        { resource: 'inventory', action: 'update' },
        { resource: 'sales', action: 'create' }, { resource: 'sales', action: 'read' },
        { resource: 'sales', action: 'update' },
        { resource: 'customers', action: 'create' }, { resource: 'customers', action: 'read' },
        { resource: 'customers', action: 'update' }, { resource: 'customers', action: 'delete' },
        { resource: 'suppliers', action: 'create' }, { resource: 'suppliers', action: 'read' },
        { resource: 'purchases', action: 'create' }, { resource: 'purchases', action: 'read' },
        { resource: 'purchases', action: 'update' },
        { resource: 'reports', action: 'read' },
        { resource: 'accounting', action: 'create' }, { resource: 'accounting', action: 'read' },
        { resource: 'cash', action: 'create' }, { resource: 'cash', action: 'read' },
        { resource: 'cash', action: 'update' },
        { resource: 'hr', action: 'create' }, { resource: 'hr', action: 'read' },
        { resource: 'hr', action: 'update' },
        { resource: 'users', action: 'create' }, { resource: 'users', action: 'read' },
        { resource: 'users', action: 'update' }, { resource: 'users', action: 'delete' },
        { resource: 'roles', action: 'create' }, { resource: 'roles', action: 'read' },
        { resource: 'roles', action: 'update' },
    ];
    const permissions = await Promise.all(permissionDefs.map((p) => prisma.permission.upsert({
        where: { resource_action: { resource: p.resource, action: p.action } },
        update: {},
        create: { resource: p.resource, action: p.action },
    })));
    console.log(`✅ Seeded ${permissions.length} permissions`);
    const syncRolePermissions = async (roleId, permKeys) => {
        await prisma.rolePermission.deleteMany({ where: { roleId } });
        const ids = permissions.filter((p) => permKeys.includes(`${p.resource}:${p.action}`));
        if (ids.length) {
            await prisma.rolePermission.createMany({
                data: ids.map((p) => ({ roleId, permissionId: p.id })),
                skipDuplicates: true,
            });
        }
    };
    const superAdminRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: 'Super Admin' } },
        update: {},
        create: { tenantId: tenant.id, name: 'Super Admin', type: client_1.RoleType.SUPER_ADMIN, isSystem: true },
    });
    const tenantAdminRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: 'Tenant Admin' } },
        update: {},
        create: {
            tenantId: tenant.id, name: 'Tenant Admin', type: client_1.RoleType.TENANT_ADMIN, isSystem: true,
            permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
        },
    });
    const cashierRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: 'Cashier' } },
        update: {},
        create: {
            tenantId: tenant.id, name: 'Cashier', type: client_1.RoleType.CASHIER, isSystem: true,
            permissions: {
                create: permissions
                    .filter((p) => ['sales', 'customers', 'inventory', 'products'].includes(p.resource) && p.action !== 'delete')
                    .map((p) => ({ permissionId: p.id })),
            },
        },
    });
    const permIds = (...keys) => permissions.filter((p) => keys.includes(`${p.resource}:${p.action}`)).map((p) => ({ permissionId: p.id }));
    const branchManagerRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: 'Branch Manager' } },
        update: { type: client_1.RoleType.BRANCH_MANAGER },
        create: {
            tenantId: tenant.id, name: 'Branch Manager', type: client_1.RoleType.BRANCH_MANAGER, isSystem: true,
            permissions: { create: permIds('inventory:read', 'inventory:update', 'purchases:read', 'purchases:create', 'purchases:update', 'sales:read', 'reports:read', 'products:read') },
        },
    });
    const inventoryManagerRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: 'Inventory Manager' } },
        update: { type: client_1.RoleType.INVENTORY_MANAGER },
        create: {
            tenantId: tenant.id, name: 'Inventory Manager', type: client_1.RoleType.INVENTORY_MANAGER, isSystem: true,
            permissions: { create: permIds('inventory:read', 'inventory:update', 'inventory:create', 'products:read', 'products:update', 'reports:read') },
        },
    });
    const accountantRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: 'Accountant' } },
        update: { type: client_1.RoleType.ACCOUNTANT },
        create: {
            tenantId: tenant.id, name: 'Accountant', type: client_1.RoleType.ACCOUNTANT, isSystem: true,
            permissions: { create: permIds('accounting:read', 'accounting:create', 'purchases:read', 'purchases:update', 'reports:read') },
        },
    });
    const purchasingStaffRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: 'Purchasing Staff' } },
        update: { type: client_1.RoleType.CUSTOM },
        create: {
            tenantId: tenant.id, name: 'Purchasing Staff', type: client_1.RoleType.CUSTOM, isSystem: true,
            permissions: { create: permIds('purchases:read', 'purchases:create', 'purchases:update', 'suppliers:read', 'products:read', 'inventory:read') },
        },
    });
    await syncRolePermissions(branchManagerRole.id, ['inventory:read', 'inventory:update', 'purchases:read', 'purchases:create', 'purchases:update', 'sales:read', 'reports:read', 'products:read']);
    await syncRolePermissions(inventoryManagerRole.id, ['inventory:read', 'inventory:update', 'inventory:create', 'products:read', 'products:update', 'reports:read']);
    await syncRolePermissions(accountantRole.id, ['accounting:read', 'accounting:create', 'purchases:read', 'purchases:update', 'reports:read']);
    await syncRolePermissions(purchasingStaffRole.id, ['purchases:read', 'purchases:create', 'purchases:update', 'suppliers:read', 'products:read', 'inventory:read']);
    console.log('✅ Seeded roles: Super Admin, Tenant Admin, Cashier, Branch Manager, Inventory Manager, Accountant, Purchasing Staff');
    const adminUser = await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: tenant.id,
            branchId: branch.id,
            email: 'admin@demo.fashionerp.com',
            firstName: 'Admin',
            lastName: 'User',
            passwordHash,
      emailVerified: true,
      status: client_1.UserStatus.ACTIVE,
      roles: { create: [{ roleId: tenantAdminRole.id }] },
        },
    });
    await prisma.userRole.deleteMany({
        where: { userId: adminUser.id, roleId: superAdminRole.id },
    });
    await prisma.userRole.upsert({
        where: { userId_roleId: { userId: adminUser.id, roleId: tenantAdminRole.id } },
        update: {},
        create: { userId: adminUser.id, roleId: tenantAdminRole.id },
    });
    console.log(`✅ Shop admin: ${adminUser.email} (password: Admin@123456) — shop.hexalyte.com only`);
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
      status: client_1.UserStatus.ACTIVE,
      roles: { create: [{ roleId: cashierRole.id }] },
        },
    });
    console.log(`✅ Cashier user: ${cashierUser.email} (password: Cashier@123456)`);
    const managerPassword = await bcrypt.hash('Manager@123456', 12);
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: 'manager@demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: tenant.id, branchId: branch.id, email: 'manager@demo.fashionerp.com',
            firstName: 'Demo', lastName: 'Branch Manager', passwordHash: managerPassword,
            emailVerified: true, status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: branchManagerRole.id }] },
        },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: 'inventory@demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: tenant.id, branchId: branch.id, email: 'inventory@demo.fashionerp.com',
            firstName: 'Demo', lastName: 'Inventory Manager', passwordHash: managerPassword,
            emailVerified: true, status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: inventoryManagerRole.id }] },
        },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: 'accountant@demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: tenant.id, branchId: branch.id, email: 'accountant@demo.fashionerp.com',
            firstName: 'Demo', lastName: 'Accountant', passwordHash: managerPassword,
            emailVerified: true, status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: accountantRole.id }] },
        },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: 'purchasing@demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: tenant.id, branchId: branch.id, email: 'purchasing@demo.fashionerp.com',
            firstName: 'Demo', lastName: 'Purchasing', passwordHash: managerPassword,
            emailVerified: true, status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: purchasingStaffRole.id }] },
        },
    });
    console.log('✅ Workflow users: manager@ / inventory@ / accountant@ / purchasing@demo.fashionerp.com (password: Manager@123456)');
    const clothingCategories = ["Men's Wear", "Women's Wear", "Kids' Wear", 'Accessories', 'Footwear'];
    for (const name of clothingCategories) {
        await prisma.category.upsert({
            where: { tenantId_slug: { tenantId: tenant.id, slug: slugify(name) } },
            update: {},
            create: { tenantId: tenant.id, name, slug: slugify(name) },
        });
    }
    console.log(`✅ Seeded ${clothingCategories.length} clothing categories`);

    const groceryCategories = ['Fresh Produce', 'Dairy & Eggs', 'Beverages', 'Snacks', 'Frozen Foods', 'Household'];
    const groceryTenant = await prisma.tenant.upsert({
        where: { subdomain: 'grocery' },
        update: { shopType: client_1.ShopType.GROCERY },
        create: {
            name: 'Demo Grocery Mart',
            subdomain: 'grocery',
            email: 'admin@grocery.demo.fashionerp.com',
            shopType: client_1.ShopType.GROCERY,
            plan: client_1.SubscriptionPlan.PROFESSIONAL,
            status: client_1.TenantStatus.ACTIVE,
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
        create: { tenantId: groceryTenant.id, name: 'Tenant Admin', type: client_1.RoleType.TENANT_ADMIN, isSystem: true },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: groceryTenant.id, email: 'admin@grocery.demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: groceryTenant.id,
            branchId: groceryBranch.id,
            email: 'admin@grocery.demo.fashionerp.com',
            firstName: 'Grocery',
            lastName: 'Admin',
            passwordHash,
            emailVerified: true,
            status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: groceryAdminRole.id }] },
        },
    });
    for (const name of groceryCategories) {
        await prisma.category.upsert({
            where: { tenantId_slug: { tenantId: groceryTenant.id, slug: slugify(name) } },
            update: {},
            create: { tenantId: groceryTenant.id, name, slug: slugify(name) },
        });
    }
    await prisma.tenant.update({
        where: { id: groceryTenant.id },
        data: {
            settings: {
                shopProfile: {
                    type: 'GROCERY',
                    defaultUnit: 'kg',
                    units: ['pcs', 'kg', 'g', 'L', 'ml', 'pack'],
                    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: false, expiry: true, batch: true, vehicles: false, warranty: false, quotations: false },
                    labelTemplates: ['sticker', 'shelf'],
                    variantAttributes: [
                        { name: 'Weight', presets: ['250g', '500g', '1kg', '2kg', '5kg'], mapsTo: 'size' },
                        { name: 'Pack', presets: ['Single', '6-Pack', '12-Pack', 'Carton'], mapsTo: 'style' },
                    ],
                },
            },
        },
    });
    console.log('✅ Grocery demo: grocery.shop.hexalyte.com — admin@grocery.demo.fashionerp.com / Admin@123456');

    const hardwareCategories = ['Tools', 'Electrical', 'Plumbing', 'Paint', 'Building Materials', 'Safety Gear'];
    const hardwareTenant = await prisma.tenant.upsert({
        where: { subdomain: 'hardware' },
        update: { shopType: client_1.ShopType.HARDWARE },
        create: {
            name: 'Demo Hardware Store',
            subdomain: 'hardware',
            email: 'admin@hardware.demo.fashionerp.com',
            shopType: client_1.ShopType.HARDWARE,
            plan: client_1.SubscriptionPlan.PROFESSIONAL,
            status: client_1.TenantStatus.ACTIVE,
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
        create: { tenantId: hardwareTenant.id, name: 'Tenant Admin', type: client_1.RoleType.TENANT_ADMIN, isSystem: true },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: hardwareTenant.id, email: 'admin@hardware.demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: hardwareTenant.id,
            branchId: hardwareBranch.id,
            email: 'admin@hardware.demo.fashionerp.com',
            firstName: 'Hardware',
            lastName: 'Admin',
            passwordHash,
            emailVerified: true,
            status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: hardwareAdminRole.id }] },
        },
    });
    for (const name of hardwareCategories) {
        await prisma.category.upsert({
            where: { tenantId_slug: { tenantId: hardwareTenant.id, slug: slugify(name) } },
            update: {},
            create: { tenantId: hardwareTenant.id, name, slug: slugify(name) },
        });
    }
    await prisma.tenant.update({
        where: { id: hardwareTenant.id },
        data: {
            settings: {
                shopProfile: {
                    type: 'HARDWARE',
                    defaultUnit: 'pcs',
                    units: ['pcs', 'box', 'set', 'meter', 'roll'],
                    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: false, loyalty: false, expiry: false, batch: false, vehicles: false, warranty: false, quotations: true },
                    labelTemplates: ['sticker', 'shelf'],
                    variantAttributes: [
                        { name: 'Size', presets: ['Small', 'Medium', 'Large', '10mm', '12mm', '20mm'], mapsTo: 'size' },
                        { name: 'Material', presets: ['Steel', 'Brass', 'PVC', 'Copper', 'Aluminium'], mapsTo: 'material' },
                    ],
                },
            },
        },
    });
    console.log('✅ Hardware demo: hardware.shop.hexalyte.com — admin@hardware.demo.fashionerp.com / Admin@123456');

    const agriCategories = ['Seeds', 'Fertilizer', 'Pesticides', 'Equipment', 'Animal Feed', 'Irrigation'];
    const agriTenant = await prisma.tenant.upsert({
        where: { subdomain: 'agri' },
        update: { shopType: client_1.ShopType.AGRICULTURE },
        create: {
            name: 'Demo Agriculture Store',
            subdomain: 'agri',
            email: 'admin@agri.demo.fashionerp.com',
            shopType: client_1.ShopType.AGRICULTURE,
            plan: client_1.SubscriptionPlan.PROFESSIONAL,
            status: client_1.TenantStatus.ACTIVE,
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
        create: { tenantId: agriTenant.id, name: 'Tenant Admin', type: client_1.RoleType.TENANT_ADMIN, isSystem: true },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: agriTenant.id, email: 'admin@agri.demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: agriTenant.id,
            branchId: agriBranch.id,
            email: 'admin@agri.demo.fashionerp.com',
            firstName: 'Agri',
            lastName: 'Admin',
            passwordHash,
            emailVerified: true,
            status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: agriAdminRole.id }] },
        },
    });
    for (const name of agriCategories) {
        await prisma.category.upsert({
            where: { tenantId_slug: { tenantId: agriTenant.id, slug: slugify(name) } },
            update: {},
            create: { tenantId: agriTenant.id, name, slug: slugify(name) },
        });
    }
    await prisma.tenant.update({
        where: { id: agriTenant.id },
        data: {
            settings: {
                shopProfile: {
                    type: 'AGRICULTURE',
                    defaultUnit: 'kg',
                    units: ['kg', 'bag', 'pcs', 'liter', 'acre'],
                    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: false, loyalty: false, expiry: true, batch: true, vehicles: false, warranty: false, quotations: false },
                    labelTemplates: ['sticker', 'shelf'],
                    variantAttributes: [
                        { name: 'Weight', presets: ['1kg', '5kg', '10kg', '25kg', '50kg'], mapsTo: 'size' },
                        { name: 'Grade', presets: ['Grade A', 'Grade B', 'Premium', 'Standard'], mapsTo: 'style' },
                    ],
                },
            },
        },
    });
    console.log('✅ Agriculture demo: agri.shop.hexalyte.com — admin@agri.demo.fashionerp.com / Admin@123456');

    const spareCategories = ['Engine Parts', 'Brakes & Suspension', 'Filters', 'Electrical', 'Body Parts', 'Lubricants', 'Accessories'];
    const spareTenant = await prisma.tenant.upsert({
        where: { subdomain: 'spareparts' },
        update: { shopType: client_1.ShopType.SPARE_PARTS },
        create: {
            name: 'Demo Spare Parts Store',
            subdomain: 'spareparts',
            email: 'admin@spareparts.demo.fashionerp.com',
            shopType: client_1.ShopType.SPARE_PARTS,
            plan: client_1.SubscriptionPlan.PROFESSIONAL,
            status: client_1.TenantStatus.ACTIVE,
            currency: 'LKR',
            country: 'LK',
            timezone: 'Asia/Colombo',
        },
    });
    const spareBranch = await prisma.branch.upsert({
        where: { tenantId_code: { tenantId: spareTenant.id, code: 'HO-001' } },
        update: {},
        create: { tenantId: spareTenant.id, name: 'Main Parts Store', code: 'HO-001', isDefault: true, city: 'Colombo' },
    });
    await prisma.branch.upsert({
        where: { tenantId_code: { tenantId: spareTenant.id, code: 'BR-002' } },
        update: {},
        create: { tenantId: spareTenant.id, name: 'Branch — Kandy', code: 'BR-002', city: 'Kandy' },
    });
    const spareAdminRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: spareTenant.id, name: 'Tenant Admin' } },
        update: {},
        create: { tenantId: spareTenant.id, name: 'Tenant Admin', type: client_1.RoleType.TENANT_ADMIN, isSystem: true },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: spareTenant.id, email: 'admin@spareparts.demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: spareTenant.id,
            branchId: spareBranch.id,
            email: 'admin@spareparts.demo.fashionerp.com',
            firstName: 'Spare',
            lastName: 'Admin',
            passwordHash,
            emailVerified: true,
            status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: spareAdminRole.id }] },
        },
    });
    for (const name of spareCategories) {
        await prisma.category.upsert({
            where: { tenantId_slug: { tenantId: spareTenant.id, slug: slugify(name) } },
            update: {},
            create: { tenantId: spareTenant.id, name, slug: slugify(name) },
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
    if (!(await prisma.vehicleModel.findFirst({ where: { tenantId: spareTenant.id, brandId: toyotaBrand.id, name: 'Axio' } }))) {
        await prisma.vehicleModel.create({
            data: { tenantId: spareTenant.id, brandId: toyotaBrand.id, name: 'Axio', yearFrom: 2012, yearTo: 2020, engineCapacity: '1500cc' },
        });
    }
    if (!(await prisma.vehicleModel.findFirst({ where: { tenantId: spareTenant.id, brandId: hondaBrand.id, name: 'Vezel' } }))) {
        await prisma.vehicleModel.create({
            data: { tenantId: spareTenant.id, brandId: hondaBrand.id, name: 'Vezel', yearFrom: 2014, yearTo: 2022, engineCapacity: '1500cc' },
        });
    }
    const warrantyCategoryNames = ['Engine Parts', 'Brakes & Suspension', 'Electrical', 'Filters'];
    const warrantyCategories = await prisma.category.findMany({
        where: { tenantId: spareTenant.id, name: { in: warrantyCategoryNames } },
        select: { id: true },
    });
    if (warrantyCategories.length) {
        const { count } = await prisma.product.updateMany({
            where: {
                tenantId: spareTenant.id,
                categoryId: { in: warrantyCategories.map((c) => c.id) },
                OR: [{ warrantyMonths: null }, { warrantyMonths: 0 }],
            },
            data: { warrantyMonths: 12 },
        });
        if (count > 0)
            console.log(`✅ Spare parts: ${count} product(s) set to 12-month warranty`);
    }
    const { count: namedCount } = await prisma.product.updateMany({
        where: {
            tenantId: spareTenant.id,
            OR: [{ warrantyMonths: null }, { warrantyMonths: 0 }],
            name: { contains: 'filter', mode: 'insensitive' },
        },
        data: { warrantyMonths: 12 },
    });
    if (namedCount > 0)
        console.log(`✅ Spare parts: ${namedCount} filter product(s) set to 12-month warranty`);
    await prisma.tenant.update({
        where: { id: spareTenant.id },
        data: {
            settings: {
                shopProfile: {
                    type: 'SPARE_PARTS',
                    defaultUnit: 'pcs',
                    units: ['pcs', 'set', 'pair', 'box', 'liter'],
                    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: true, vehicles: true, warranty: true, quotations: true },
                    labelTemplates: ['sticker', 'shelf'],
                    variantAttributes: [
                        { name: 'OEM No', presets: [], mapsTo: 'size' },
                        { name: 'Part Type', presets: ['OEM', 'Aftermarket', 'Genuine'], mapsTo: 'style' },
                    ],
                },
            },
        },
    });
    console.log('✅ Spare Parts demo: spareparts.shop.hexalyte.com — admin@spareparts.demo.fashionerp.com / Admin@123456');

    await prisma.user.updateMany({
        where: { emailVerified: true, status: client_1.UserStatus.PENDING_VERIFICATION },
        data: { status: client_1.UserStatus.ACTIVE },
    });
    console.log('\n🎉 Seeding completed successfully!\n');
    console.log('Company admin (admin3.hexalyte.com):');
    console.log('  admin@hexalyte.com / Admin@123456');
    console.log('Shop login (shop.hexalyte.com):');
    console.log('  Clothing demo: admin@demo.fashionerp.com / Admin@123456 (subdomain: demo)');
    console.log('  Grocery demo:  admin@grocery.demo.fashionerp.com / Admin@123456 (subdomain: grocery)');
    console.log('  Hardware demo: admin@hardware.demo.fashionerp.com / Admin@123456 (subdomain: hardware)');
    console.log('  Agri demo:     admin@agri.demo.fashionerp.com / Admin@123456 (subdomain: agri)');
    console.log('  Spare Parts:   admin@spareparts.demo.fashionerp.com / Admin@123456 (subdomain: spareparts)');
    console.log('  Cashier:       cashier@demo.fashionerp.com / Cashier@123456');
    console.log('  Branch Mgr:    manager@demo.fashionerp.com / Manager@123456');
    console.log('  Inv. Manager:  inventory@demo.fashionerp.com / Manager@123456');
    console.log('  Accountant:    accountant@demo.fashionerp.com / Manager@123456');
}
main()
    .catch((e) => { console.error('❌ Seeding failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map