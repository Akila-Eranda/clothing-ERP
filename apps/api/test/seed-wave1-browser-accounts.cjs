const { readFileSync } = require('node:fs');
const { networkInterfaces } = require('node:os');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { PERMISSION_CATALOGUE } = require('../src/shared/security/permission-catalogue');
const { ensureSystemRoles } = require('../src/modules/roles/default-system-roles');

function assertContainerNetwork() {
  const interfaces = Object.keys(networkInterfaces()).filter((name) => name !== 'lo');
  if (interfaces.length !== 1) {
    throw new Error('Container E2E runner must have exactly one non-loopback network interface.');
  }

  const routes = readFileSync('/proc/net/route', 'utf8').trim().split('\n').slice(1);
  if (routes.some((route) => route.split(/\s+/)[1] === '00000000')) {
    throw new Error('Container E2E runner must not have a default network route.');
  }
}

function validateBrowserSeedEnvironment(env = process.env, databaseUrlValue = env.DATABASE_URL, networkGuard = assertContainerNetwork) {
  if (env.NODE_ENV !== 'test' || env.E2E_WAVE1 !== '1') {
    throw new Error('Browser-account seed is restricted to the isolated Wave 1 runner.');
  }
  const subdomain = env.E2E_BROWSER_SUBDOMAIN;
  const password = env.E2E_BROWSER_PASSWORD;
  if (!/^wave1-browser-[a-z0-9-]{4,48}$/.test(subdomain || '') || !password) {
    throw new Error('Browser-account seed requires a unique wave1-browser-* subdomain and password.');
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(databaseUrlValue || '');
  } catch {
    throw new Error('Browser-account seed requires a valid PostgreSQL DATABASE_URL.');
  }

  const containerRunner = env.E2E_WAVE1_RUNNER_MODE === 'container';
  if (env.E2E_WAVE1_RUNNER_MODE && !containerRunner) {
    throw new Error('E2E_WAVE1_RUNNER_MODE must be unset or "container".');
  }

  const isHostLoopbackMode = databaseUrl.hostname === '127.0.0.1' && databaseUrl.port === '15434';
  const isInternalRunnerMode = databaseUrl.hostname === 'postgres' && databaseUrl.port === '5432';

  if (isInternalRunnerMode) {
    if (!containerRunner) {
      throw new Error('Internal runner mode requires the dedicated isolated E2E container runner identity.');
    }
    if (
      env.E2E_WAVE1_PROJECT !== 'hexaone-e2e-wave1' ||
      env.E2E_WAVE1_NETWORK !== 'hexaone_e2e_wave1_network'
    ) {
      throw new Error('Internal browser-seed mode requires the dedicated Wave 1 project/network markers.');
    }
    networkGuard();
  } else if (isHostLoopbackMode) {
    if (containerRunner) {
      throw new Error('Host-loopback mode is not allowed when the container runner identity is active.');
    }
  } else {
    throw new Error('Browser-account seed is restricted to the isolated Wave 1 database endpoints only.');
  }

  if (
    databaseUrl.protocol !== 'postgresql:' ||
    databaseUrl.pathname !== '/hexa_e2e_wave1' ||
    databaseUrl.username !== 'hexa_e2e' ||
    !databaseUrl.password
  ) {
    throw new Error('Browser-account seed requires PostgreSQL user hexa_e2e against the isolated database hexa_e2e_wave1.');
  }

  return { databaseUrl, subdomain, password, hostMode: isHostLoopbackMode ? 'host' : 'internal' };
}

async function main() {
  const { databaseUrl, subdomain, password } = validateBrowserSeedEnvironment(process.env, process.env.DATABASE_URL);

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
  try {
    const [identity] = await prisma.$queryRaw`
      SELECT current_database() AS database,
             current_user AS role,
             (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser
    `;
    if (
      identity?.database !== 'hexa_e2e_wave1' ||
      identity?.role !== 'hexa_e2e' ||
      identity?.is_superuser !== false
    ) {
      throw new Error('Browser-account seed refused a non-isolated PostgreSQL identity.');
    }

    if (await prisma.tenant.findUnique({ where: { subdomain } })) {
      throw new Error('The requested local browser tenant already exists; refusing to overwrite it.');
    }

    const tenant = await prisma.tenant.create({
      data: {
        name: `Wave 1 Browser ${subdomain.slice(-8)}`,
        subdomain,
        shopType: 'CLOTHING',
        plan: 'PROFESSIONAL',
        status: 'ACTIVE',
      },
    });
    const branch = await prisma.branch.create({
      data: { tenantId: tenant.id, name: 'Main', code: 'MAIN' },
    });
    const secondBranch = await prisma.branch.create({
      data: { tenantId: tenant.id, name: 'Second', code: 'SECOND' },
    });

    await Promise.all(PERMISSION_CATALOGUE.map((key) => {
      const [resource, action] = key.split(':');
      return prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        update: {},
        create: { resource, action },
      });
    }));
    await ensureSystemRoles(prisma, tenant.id);
    const adminRole = await prisma.role.findFirstOrThrow({
      where: { tenantId: tenant.id, name: 'Tenant Admin' },
    });
    const cashierRole = await prisma.role.findFirstOrThrow({
      where: { tenantId: tenant.id, name: 'Cashier' },
    });
    const passwordHash = await bcrypt.hash(password, 10);
    const createUser = (name, roleId) => prisma.user.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        email: `${name}@${subdomain}.test`,
        passwordHash,
        firstName: name,
        lastName: 'Wave1',
        status: 'ACTIVE',
        emailVerified: true,
        roles: { create: { roleId } },
      },
    });
    const admin = await createUser('admin', adminRole.id);
    const cashier = await createUser('cashier', cashierRole.id);

    const warehouse = await prisma.warehouse.create({
      data: { tenantId: tenant.id, branchId: branch.id, name: 'Main', code: `WH-${subdomain.slice(-8)}`, isDefault: true },
    });
    await prisma.warehouse.create({
      data: { tenantId: tenant.id, branchId: secondBranch.id, name: 'Second', code: `WH2-${subdomain.slice(-8)}`, isDefault: true },
    });
    const counter = await prisma.posCounter.create({
      data: { tenantId: tenant.id, branchId: branch.id, name: 'Main Counter', code: 'MAIN' },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: 'Browser Test Jacket',
        slug: `browser-test-jacket-${subdomain.slice(-8)}`,
        sku: `BROWSER-${subdomain.slice(-8)}`,
        sellingPrice: 1200,
        costPrice: 700,
        mrp: 1400,
        productKind: 'STANDARD',
        variants: {
          create: {
            sku: `BROWSER-${subdomain.slice(-8)}-ONE`,
            name: 'Default',
            sellingPrice: 1200,
            costPrice: 700,
            mrp: 1400,
          },
        },
      },
      include: { variants: true },
    });
    await prisma.inventory.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        warehouseId: warehouse.id,
        variantId: product.variants[0].id,
        quantity: 8,
      },
    });
    await prisma.cashRegister.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        counterId: counter.id,
        cashierId: cashier.id,
        openingCash: 5000,
        status: 'OPEN',
      },
    });
    const customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        firstName: 'Browser',
        lastName: 'Customer',
        phone: `071${subdomain.replace(/\D/g, '').slice(-7).padStart(7, '0')}`,
      },
    });

    console.log(JSON.stringify({
      tenant: subdomain,
      branchId: branch.id,
      secondBranchId: secondBranch.id,
      adminEmail: admin.email,
      cashierEmail: cashier.email,
      customerId: customer.id,
      productId: product.id,
      variantId: product.variants[0].id,
      counterId: counter.id,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = {
  assertContainerNetwork,
  validateBrowserSeedEnvironment,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
