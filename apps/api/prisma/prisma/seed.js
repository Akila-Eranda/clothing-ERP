"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const shop_profiles_1 = require("../src/shared/shop-profiles");
const prisma = new client_1.PrismaClient();
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
            plan: client_1.SubscriptionPlan.ENTERPRISE,
            status: client_1.TenantStatus.ACTIVE,
            currency: 'LKR',
            country: 'LK',
            timezone: 'Asia/Colombo',
            maxBranches: 999,
            maxUsers: 999,
            maxProducts: 999999,
            shopType: 'CLOTHING',
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
    // ── Demo shop tenant ────────────────────────────────────────
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
            shopType: 'CLOTHING',
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
        // Cash management
        { resource: 'cash', action: 'create' }, { resource: 'cash', action: 'read' },
        { resource: 'cash', action: 'update' },
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
    // ── Roles ─────────────────────────────────────────────────
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
            tenantId: tenant.id,
            name: 'Branch Manager',
            type: client_1.RoleType.BRANCH_MANAGER,
            isSystem: true,
            permissions: {
                create: permIds('inventory:read', 'inventory:update', 'purchases:read', 'purchases:create', 'purchases:update', 'sales:read', 'reports:read', 'products:read'),
            },
        },
    });
    const inventoryManagerRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: 'Inventory Manager' } },
        update: { type: client_1.RoleType.INVENTORY_MANAGER },
        create: {
            tenantId: tenant.id,
            name: 'Inventory Manager',
            type: client_1.RoleType.INVENTORY_MANAGER,
            isSystem: true,
            permissions: {
                create: permIds('inventory:read', 'inventory:update', 'inventory:create', 'products:read', 'products:update', 'reports:read'),
            },
        },
    });
    const accountantRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: 'Accountant' } },
        update: { type: client_1.RoleType.ACCOUNTANT },
        create: {
            tenantId: tenant.id,
            name: 'Accountant',
            type: client_1.RoleType.ACCOUNTANT,
            isSystem: true,
            permissions: {
                create: permIds('accounting:read', 'accounting:create', 'purchases:read', 'purchases:update', 'reports:read'),
            },
        },
    });
    const purchasingStaffRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: 'Purchasing Staff' } },
        update: { type: client_1.RoleType.CUSTOM },
        create: {
            tenantId: tenant.id,
            name: 'Purchasing Staff',
            type: client_1.RoleType.CUSTOM,
            isSystem: true,
            permissions: {
                create: permIds('purchases:read', 'purchases:create', 'purchases:update', 'suppliers:read', 'products:read', 'inventory:read'),
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
            tenantId: tenant.id,
            branchId: branch.id,
            email: 'manager@demo.fashionerp.com',
            firstName: 'Demo',
            lastName: 'Branch Manager',
            passwordHash: managerPassword,
            emailVerified: true,
            status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: branchManagerRole.id }] },
        },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: 'inventory@demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: tenant.id,
            branchId: branch.id,
            email: 'inventory@demo.fashionerp.com',
            firstName: 'Demo',
            lastName: 'Inventory Manager',
            passwordHash: managerPassword,
            emailVerified: true,
            status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: inventoryManagerRole.id }] },
        },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: 'accountant@demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: tenant.id,
            branchId: branch.id,
            email: 'accountant@demo.fashionerp.com',
            firstName: 'Demo',
            lastName: 'Accountant',
            passwordHash: managerPassword,
            emailVerified: true,
            status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: accountantRole.id }] },
        },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: 'purchasing@demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: tenant.id,
            branchId: branch.id,
            email: 'purchasing@demo.fashionerp.com',
            firstName: 'Demo',
            lastName: 'Purchasing',
            passwordHash: managerPassword,
            emailVerified: true,
            status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: purchasingStaffRole.id }] },
        },
    });
    console.log('✅ Workflow users: manager@ / inventory@ / accountant@ / purchasing@demo.fashionerp.com (password: Manager@123456)');
    // ── Demo Categories (clothing) ─────────────────────────────
    const clothingCategories = (0, shop_profiles_1.getShopProfile)(client_1.ShopType.CLOTHING).defaultCategories;
    for (const name of clothingCategories) {
        await prisma.category.upsert({
            where: { tenantId_slug: { tenantId: tenant.id, slug: (0, shop_profiles_1.slugifyCategory)(name) } },
            update: {},
            create: { tenantId: tenant.id, name, slug: (0, shop_profiles_1.slugifyCategory)(name) },
        });
    }
    console.log(`✅ Seeded ${clothingCategories.length} clothing categories`);
    // ── Grocery demo tenant ─────────────────────────────────────
    const groceryProfile = (0, shop_profiles_1.getShopProfile)(client_1.ShopType.GROCERY);
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
    for (const name of groceryProfile.defaultCategories) {
        await prisma.category.upsert({
            where: { tenantId_slug: { tenantId: groceryTenant.id, slug: (0, shop_profiles_1.slugifyCategory)(name) } },
            update: {},
            create: { tenantId: groceryTenant.id, name, slug: (0, shop_profiles_1.slugifyCategory)(name) },
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
    const hardwareProfile = (0, shop_profiles_1.getShopProfile)(client_1.ShopType.HARDWARE);
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
    for (const name of hardwareProfile.defaultCategories) {
        await prisma.category.upsert({
            where: { tenantId_slug: { tenantId: hardwareTenant.id, slug: (0, shop_profiles_1.slugifyCategory)(name) } },
            update: {},
            create: { tenantId: hardwareTenant.id, name, slug: (0, shop_profiles_1.slugifyCategory)(name) },
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
    const agriProfile = (0, shop_profiles_1.getShopProfile)(client_1.ShopType.AGRICULTURE);
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
    for (const name of agriProfile.defaultCategories) {
        await prisma.category.upsert({
            where: { tenantId_slug: { tenantId: agriTenant.id, slug: (0, shop_profiles_1.slugifyCategory)(name) } },
            update: {},
            create: { tenantId: agriTenant.id, name, slug: (0, shop_profiles_1.slugifyCategory)(name) },
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
    const spareProfile = (0, shop_profiles_1.getShopProfile)(client_1.ShopType.SPARE_PARTS);
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
    for (const name of spareProfile.defaultCategories) {
        await prisma.category.upsert({
            where: { tenantId_slug: { tenantId: spareTenant.id, slug: (0, shop_profiles_1.slugifyCategory)(name) } },
            update: {},
            create: { tenantId: spareTenant.id, name, slug: (0, shop_profiles_1.slugifyCategory)(name) },
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
    // Demo: warranty on common spare-parts categories (others stay without warranty)
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
    // Name-based fallback for uncategorized demo products (filter, alternator, etc.)
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
    // ── Tyre Shop demo tenant ───────────────────────────────────
    const tyreProfile = (0, shop_profiles_1.getShopProfile)(client_1.ShopType.TIRE_SHOP);
    const tyreTenant = await prisma.tenant.upsert({
        where: { subdomain: 'tyres' },
        update: { shopType: client_1.ShopType.TIRE_SHOP },
        create: {
            name: 'Demo Tyre Shop',
            subdomain: 'tyres',
            email: 'admin@tyres.demo.fashionerp.com',
            shopType: client_1.ShopType.TIRE_SHOP,
            plan: client_1.SubscriptionPlan.PROFESSIONAL,
            status: client_1.TenantStatus.ACTIVE,
            currency: 'LKR',
            country: 'LK',
            timezone: 'Asia/Colombo',
        },
    });
    const tyreBranch = await prisma.branch.upsert({
        where: { tenantId_code: { tenantId: tyreTenant.id, code: 'HO-001' } },
        update: {},
        create: {
            tenantId: tyreTenant.id,
            name: 'Main Tyre Store',
            code: 'HO-001',
            isDefault: true,
            city: 'Colombo',
        },
    });
    const tyreAdminRole = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tyreTenant.id, name: 'Tenant Admin' } },
        update: {},
        create: { tenantId: tyreTenant.id, name: 'Tenant Admin', type: client_1.RoleType.TENANT_ADMIN, isSystem: true },
    });
    await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tyreTenant.id, email: 'admin@tyres.demo.fashionerp.com' } },
        update: { status: client_1.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: tyreTenant.id,
            branchId: tyreBranch.id,
            email: 'admin@tyres.demo.fashionerp.com',
            firstName: 'Tyre',
            lastName: 'Admin',
            passwordHash,
            emailVerified: true,
            status: client_1.UserStatus.ACTIVE,
            roles: { create: [{ roleId: tyreAdminRole.id }] },
        },
    });
    for (const name of tyreProfile.defaultCategories) {
        await prisma.category.upsert({
            where: { tenantId_slug: { tenantId: tyreTenant.id, slug: (0, shop_profiles_1.slugifyCategory)(name) } },
            update: {},
            create: { tenantId: tyreTenant.id, name, slug: (0, shop_profiles_1.slugifyCategory)(name) },
        });
    }
    const passengerTyresCat = await prisma.category.findFirst({
        where: { tenantId: tyreTenant.id, slug: (0, shop_profiles_1.slugifyCategory)('Passenger Tyres') },
    });
    const michelinBrand = await prisma.brand.upsert({
        where: { tenantId_slug: { tenantId: tyreTenant.id, slug: 'michelin' } },
        update: {},
        create: { tenantId: tyreTenant.id, name: 'Michelin', slug: 'michelin', isActive: true },
    });
    const bridgestoneBrand = await prisma.brand.upsert({
        where: { tenantId_slug: { tenantId: tyreTenant.id, slug: 'bridgestone' } },
        update: {},
        create: { tenantId: tyreTenant.id, name: 'Bridgestone', slug: 'bridgestone', isActive: true },
    });
    const toyotaTyre = await prisma.vehicleBrand.upsert({
        where: { tenantId_name: { tenantId: tyreTenant.id, name: 'Toyota' } },
        update: {},
        create: { tenantId: tyreTenant.id, name: 'Toyota' },
    });
    const hondaTyre = await prisma.vehicleBrand.upsert({
        where: { tenantId_name: { tenantId: tyreTenant.id, name: 'Honda' } },
        update: {},
        create: { tenantId: tyreTenant.id, name: 'Honda' },
    });
    const suzukiTyre = await prisma.vehicleBrand.upsert({
        where: { tenantId_name: { tenantId: tyreTenant.id, name: 'Suzuki' } },
        update: {},
        create: { tenantId: tyreTenant.id, name: 'Suzuki' },
    });
    const axioModel = await prisma.vehicleModel.findFirst({
        where: { tenantId: tyreTenant.id, brandId: toyotaTyre.id, name: 'Axio' },
    }) ?? await prisma.vehicleModel.create({
        data: { tenantId: tyreTenant.id, brandId: toyotaTyre.id, name: 'Axio', yearFrom: 2012, yearTo: 2020, engineCapacity: '1500cc' },
    });
    const vezelModel = await prisma.vehicleModel.findFirst({
        where: { tenantId: tyreTenant.id, brandId: hondaTyre.id, name: 'Vezel' },
    }) ?? await prisma.vehicleModel.create({
        data: { tenantId: tyreTenant.id, brandId: hondaTyre.id, name: 'Vezel', yearFrom: 2014, yearTo: 2022, engineCapacity: '1500cc' },
    });
    const wagonRModel = await prisma.vehicleModel.findFirst({
        where: { tenantId: tyreTenant.id, brandId: suzukiTyre.id, name: 'Wagon R' },
    }) ?? await prisma.vehicleModel.create({
        data: { tenantId: tyreTenant.id, brandId: suzukiTyre.id, name: 'Wagon R', yearFrom: 2014, yearTo: 2023, engineCapacity: '1000cc' },
    });
    if (passengerTyresCat) {
        const existingTyreProduct = await prisma.product.findFirst({
            where: { tenantId: tyreTenant.id, sku: 'TYR-MIC-PRIM4' },
        });
        if (!existingTyreProduct) {
            const primacy = await prisma.product.create({
                data: {
                    tenantId: tyreTenant.id,
                    name: 'Michelin Primacy 4',
                    slug: 'michelin-primacy-4',
                    sku: 'TYR-MIC-PRIM4',
                    categoryId: passengerTyresCat.id,
                    brandId: michelinBrand.id,
                    status: client_1.ProductStatus.ACTIVE,
                    loadIndex: '91',
                    speedRating: 'H',
                    warrantyMonths: 24,
                    hasVariants: true,
                    trackInventory: true,
                    sellingPrice: 42000,
                    costPrice: 31000,
                    mrp: 45000,
                    taxRate: 18,
                    tags: ['Premium', 'Passenger'],
                },
            });
            const v205 = await prisma.productVariant.create({
                data: {
                    productId: primacy.id,
                    sku: 'TYR-MIC-2055516',
                    name: '205/55R16 · All Season',
                    size: '205/55R16',
                    style: 'All Season',
                    barcode: '2288854718885000',
                    sellingPrice: 42000,
                    costPrice: 31000,
                    mrp: 45000,
                },
            });
            const v195 = await prisma.productVariant.create({
                data: {
                    productId: primacy.id,
                    sku: 'TYR-MIC-1956515',
                    name: '195/65R15 · All Season',
                    size: '195/65R15',
                    style: 'All Season',
                    barcode: '2288854718886000',
                    sellingPrice: 38000,
                    costPrice: 28000,
                    mrp: 41000,
                },
            });
            await prisma.inventory.createMany({
                data: [
                    { tenantId: tyreTenant.id, branchId: tyreBranch.id, variantId: v205.id, quantity: 12 },
                    { tenantId: tyreTenant.id, branchId: tyreBranch.id, variantId: v195.id, quantity: 8 },
                ],
                skipDuplicates: true,
            });
            await prisma.partCompatibility.createMany({
                data: [
                    { tenantId: tyreTenant.id, vehicleModelId: axioModel.id, variantId: v205.id, notes: 'Factory size' },
                    { tenantId: tyreTenant.id, vehicleModelId: vezelModel.id, variantId: v205.id, notes: 'Recommended upgrade' },
                    { tenantId: tyreTenant.id, vehicleModelId: wagonRModel.id, variantId: v195.id, notes: 'Factory size' },
                ],
                skipDuplicates: true,
            });
        }
        const existingBsProduct = await prisma.product.findFirst({
            where: { tenantId: tyreTenant.id, sku: 'TYR-BS-TUR' },
        });
        if (!existingBsProduct) {
            const turanza = await prisma.product.create({
                data: {
                    tenantId: tyreTenant.id,
                    name: 'Bridgestone Turanza T005',
                    slug: 'bridgestone-turanza-t005',
                    sku: 'TYR-BS-TUR',
                    categoryId: passengerTyresCat.id,
                    brandId: bridgestoneBrand.id,
                    status: client_1.ProductStatus.ACTIVE,
                    loadIndex: '94',
                    speedRating: 'V',
                    warrantyMonths: 36,
                    hasVariants: true,
                    trackInventory: true,
                    sellingPrice: 48000,
                    costPrice: 35000,
                    mrp: 52000,
                    taxRate: 18,
                    tags: ['Premium', 'Summer'],
                },
            });
            const v215 = await prisma.productVariant.create({
                data: {
                    productId: turanza.id,
                    sku: 'TYR-BS-2156016',
                    name: '215/60R16 · Summer',
                    size: '215/60R16',
                    style: 'Summer',
                    barcode: '2288854718887000',
                    sellingPrice: 48000,
                    costPrice: 35000,
                    mrp: 52000,
                },
            });
            await prisma.inventory.create({
                data: { tenantId: tyreTenant.id, branchId: tyreBranch.id, variantId: v215.id, quantity: 6 },
            });
            await prisma.partCompatibility.create({
                data: { tenantId: tyreTenant.id, vehicleModelId: vezelModel.id, variantId: v215.id, notes: 'Optional wider fit' },
            }).catch(() => undefined);
        }
    }
    await prisma.tenant.update({
        where: { id: tyreTenant.id },
        data: {
            settings: {
                shopProfile: {
                    type: tyreProfile.type,
                    defaultUnit: tyreProfile.defaultUnit,
                    units: tyreProfile.units,
                    modules: tyreProfile.modules,
                    labelTemplates: tyreProfile.labelTemplates,
                    variantAttributes: tyreProfile.variantAttributes,
                },
            },
        },
    });
    console.log('✅ Tyre Shop demo: tyres.shop.hexalyte.com — admin@tyres.demo.fashionerp.com / Admin@123456');
    await prisma.user.updateMany({
        where: { emailVerified: true, status: client_1.UserStatus.PENDING_VERIFICATION },
        data: { status: client_1.UserStatus.ACTIVE },
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
    console.log('  Tyre Shop:     admin@tyres.demo.fashionerp.com / Admin@123456 (subdomain: tyres)');
    console.log('  Cashier:       cashier@demo.fashionerp.com / Cashier@123456');
    console.log('  Branch Mgr:    manager@demo.fashionerp.com / Manager@123456');
    console.log('  Inv. Manager:  inventory@demo.fashionerp.com / Manager@123456');
    console.log('  Accountant:    accountant@demo.fashionerp.com / Manager@123456');
    console.log('  Purchasing:    purchasing@demo.fashionerp.com / Manager@123456');
}
main()
    .catch((e) => { console.error('❌ Seeding failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
