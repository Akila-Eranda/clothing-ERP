"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding database...');
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
    console.log('✅ Seeded roles: Super Admin, Tenant Admin, Cashier');
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
            roles: { create: [{ roleId: tenantAdminRole.id }] },
        },
    });
    console.log(`✅ Admin user: ${adminUser.email} (password: Admin@123456)`);
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
//# sourceMappingURL=seed.js.map