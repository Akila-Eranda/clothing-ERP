const { readFileSync } = require('node:fs');
const { networkInterfaces } = require('node:os');

const SECRET_ENV_KEYS = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ZONE_ID',
  'TENANT_SSL_HOOK_URL',
  'TENANT_SSL_HOOK_SECRET',
  'SMTP_USER',
  'SMTP_PASS',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'CF_R2_ACCOUNT_ID',
  'CF_R2_ACCESS_KEY_ID',
  'CF_R2_SECRET_ACCESS_KEY',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_TOKEN',
  'WHATSAPP_API_KEY',
  'BILLING_WHATSAPP_TENANT_ID',
  'KC_CLIENT_SECRET',
  'KC_ADMIN_CLIENT_SECRET',
  'SECURITY_SCAN_HOSTS',
];

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

function assertEnvironment() {
  if (process.env.NODE_ENV !== 'test' || process.env.E2E_WAVE1 !== '1') {
    throw new Error('E2E tests require the isolated Wave 1 runner.');
  }
  const containerRunner = process.env.E2E_WAVE1_RUNNER_MODE === 'container';
  if (process.env.E2E_WAVE1_RUNNER_MODE && !containerRunner) {
    throw new Error('E2E_WAVE1_RUNNER_MODE must be unset or "container".');
  }
  if (containerRunner) {
    if (
      process.env.E2E_WAVE1_PROJECT !== 'hexaone-e2e-wave1' ||
      process.env.E2E_WAVE1_NETWORK !== 'hexaone_e2e_wave1_network'
    ) {
      throw new Error('Container runner project/network identity is invalid.');
    }
    assertContainerNetwork();
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL || '');
  } catch {
    throw new Error('E2E database URL is missing or invalid.');
  }
  const expectedDatabaseHost = containerRunner ? 'postgres' : '127.0.0.1';
  const expectedDatabasePort = containerRunner ? '5432' : '15434';
  if (
    databaseUrl.protocol !== 'postgresql:' ||
    databaseUrl.hostname !== expectedDatabaseHost ||
    databaseUrl.port !== expectedDatabasePort ||
    databaseUrl.pathname !== '/hexa_e2e_wave1' ||
    databaseUrl.username !== 'hexa_e2e' ||
    !databaseUrl.password
  ) {
    throw new Error(
      `E2E database target must be hexa_e2e_wave1 on ${expectedDatabaseHost}:${expectedDatabasePort}.`,
    );
  }
  const expectedRedisHost = containerRunner ? 'redis' : '127.0.0.1';
  const expectedRedisPort = containerRunner ? '6379' : '16390';
  if (
    process.env.REDIS_HOST !== expectedRedisHost ||
    process.env.REDIS_PORT !== expectedRedisPort ||
    process.env.REDIS_DB !== '0' ||
    !process.env.REDIS_PASSWORD
  ) {
    throw new Error(
      `E2E Redis target must be the authenticated Wave 1 instance at ${expectedRedisHost}:${expectedRedisPort}.`,
    );
  }
  if (process.env.KEYCLOAK_URL !== 'http://127.0.0.1:9' || process.env.KEYCLOAK_AUTH_ENABLED !== 'false') {
    throw new Error('Keycloak must be disabled and loopback-only for E2E.');
  }
  if (process.env.STORAGE_PROVIDER !== 'local' || process.env.SMTP_HOST !== '127.0.0.1') {
    throw new Error('E2E storage and mail must remain local-only.');
  }

  const configuredSecrets = SECRET_ENV_KEYS.filter((key) => process.env[key]);
  if (configuredSecrets.length) {
    throw new Error(`External service credentials are forbidden in E2E: ${configuredSecrets.join(', ')}`);
  }
  if (process.env.SMTP_PORT !== '9' || process.env.KC_CLIENT_ID !== 'e2e-local-disabled') {
    throw new Error('SMTP and Keycloak must use their local disabled endpoints in E2E.');
  }
}

module.exports = async function e2eWave1GlobalSetup() {
  assertEnvironment();

  const { PrismaClient } = require('@prisma/client');
  const Redis = require('ioredis');
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
    db: 0,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

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
      throw new Error('Connected PostgreSQL identity is not the isolated non-superuser E2E role.');
    }
    const [tableStats] = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
    const [migrationTable] = await prisma.$queryRaw`
      SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS present
    `;
    let migrationSummary = 'not initialized';
    if (migrationTable?.present) {
      const [migrationStats] = await prisma.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS successful,
          COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS incomplete
        FROM public."_prisma_migrations"
      `;
      migrationSummary = `${migrationStats.successful} successful/${migrationStats.incomplete} incomplete`;
    }

    await redis.connect();
    if ((await redis.ping()) !== 'PONG') {
      throw new Error('Isolated E2E Redis did not return PONG.');
    }
    console.log(
      `E2E read-only preflight PASS: database=${identity.database}, role=${identity.role}, ` +
        `superuser=${identity.is_superuser}, tables=${tableStats.count}, ` +
        `migrations=${migrationSummary}, Redis=PONG`,
    );
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
};
