// Plain JS seed — runs in production container without ts-node
const { PrismaClient } = require('../node_modules/.prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      name: 'Demo Fashion Store',
      subdomain: 'demo',
      email: 'demo@fashionerp.com',
      phone: '+94771234567',
      currency: 'LKR',
      country: 'LK',
      timezone: 'Asia/Colombo',
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
    },
  })
  console.log('Tenant:', tenant.subdomain)

  // Create roles
  const adminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'ADMIN' } },
    update: {},
    create: { tenantId: tenant.id, name: 'ADMIN', type: 'TENANT_ADMIN', isSystem: true },
  })
  const cashierRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'CASHIER' } },
    update: {},
    create: { tenantId: tenant.id, name: 'CASHIER', type: 'CASHIER', isSystem: true },
  })

  const hash = await bcrypt.hash('Admin@123456', 10)

  // Admin user
  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.fashionerp.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.fashionerp.com',
      passwordHash: hash,
      firstName: 'Super',
      lastName: 'Admin',
      status: 'ACTIVE',
    },
  })
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  })
  console.log('Admin: admin@demo.fashionerp.com / Admin@123456')

  const cashierHash = await bcrypt.hash('Cashier@123456', 10)

  // Cashier user
  const cashierUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'cashier@demo.fashionerp.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'cashier@demo.fashionerp.com',
      passwordHash: cashierHash,
      firstName: 'Demo',
      lastName: 'Cashier',
      status: 'ACTIVE',
    },
  })
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: cashierUser.id, roleId: cashierRole.id } },
    update: {},
    create: { userId: cashierUser.id, roleId: cashierRole.id },
  })
  console.log('Cashier: cashier@demo.fashionerp.com / Cashier@123456')
  console.log('Seed complete!')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
