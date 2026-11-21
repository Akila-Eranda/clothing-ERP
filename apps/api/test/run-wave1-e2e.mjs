import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDir = path.join(apiDir, 'test');
const args = process.argv.slice(2);
const containerRunner = process.env.E2E_WAVE1_RUNNER_MODE === 'container';

if (process.env.NODE_OPTIONS || process.env.NODE_PATH) {
  throw new Error('Node preload options are not allowed in the isolated E2E runner.');
}
if (process.env.E2E_WAVE1_RUNNER_MODE && !containerRunner) {
  throw new Error('E2E_WAVE1_RUNNER_MODE must be unset or "container".');
}
if (
  containerRunner &&
  (process.env.E2E_WAVE1_PROJECT !== 'hexaone-e2e-wave1' ||
    process.env.E2E_WAVE1_NETWORK !== 'hexaone_e2e_wave1_network')
) {
  throw new Error('Container runner project/network identity is invalid.');
}

function readSecretFile(name) {
  const filePath = path.join('/run/secrets', name);
  let contents;
  try {
    contents = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Required isolated E2E secret is unavailable: ${name}.`);
    }
    throw new Error(`Could not read isolated E2E secret ${name}: ${error.message}`);
  }
  const secret = contents.replace(/\r?\n$/, '');
  if (!secret) {
    throw new Error(`Required isolated E2E secret is empty: ${name}.`);
  }
  return secret;
}

const databasePassword = containerRunner
  ? readSecretFile('e2e_database_password')
  : process.env.E2E_DATABASE_PASSWORD;
const redisPassword = containerRunner
  ? readSecretFile('e2e_redis_password')
  : process.env.E2E_REDIS_PASSWORD;
if (!databasePassword || !redisPassword) {
  throw new Error(
    containerRunner
      ? 'Required PostgreSQL or Redis secret mount is empty.'
      : 'Supply the isolated E2E PostgreSQL and Redis credentials through E2E_DATABASE_PASSWORD and E2E_REDIS_PASSWORD.',
  );
}

const databaseHost = containerRunner ? 'postgres' : '127.0.0.1';
const databasePort = containerRunner ? '5432' : '15434';
const databaseUrl = new URL(
  `postgresql://hexa_e2e@${databaseHost}:${databasePort}/hexa_e2e_wave1?schema=public`,
);
databaseUrl.password = databasePassword;

const safeEnv = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'TMPDIR']) {
  if (process.env[key]) safeEnv[key] = process.env[key];
}
Object.assign(safeEnv, {
  NODE_ENV: 'test',
  E2E_WAVE1: '1',
  DATABASE_URL: databaseUrl.toString(),
  REDIS_HOST: containerRunner ? 'redis' : '127.0.0.1',
  REDIS_PORT: containerRunner ? '6379' : '16390',
  REDIS_PASSWORD: redisPassword,
  REDIS_DB: '0',
  REDIS_KEY_PREFIX: 'hexa-e2e-wave1:',
  KEYCLOAK_URL: 'http://127.0.0.1:9',
  KEYCLOAK_AUTH_ENABLED: 'false',
  KC_CLIENT_ID: 'e2e-local-disabled',
  KC_ADMIN_CLIENT_ID: 'e2e-local-disabled',
  SMTP_PORT: '9',
  STORAGE_PROVIDER: 'local',
  UPLOAD_DIR: path.join(os.tmpdir(), 'hexa-e2e-wave1-uploads'),
  WHATSAPP_AUTH_DIR: path.join(os.tmpdir(), 'hexa-e2e-wave1-whatsapp'),
  SMTP_HOST: '127.0.0.1',
  FRONTEND_URL: 'http://127.0.0.1:3000',
  PORT: '3101',
  JWT_ACCESS_SECRET: 'wave1-local-only-access-secret-not-for-production',
  JWT_REFRESH_SECRET: 'wave1-local-only-refresh-secret-not-for-production',
});

if (containerRunner) {
  Object.assign(safeEnv, {
    E2E_WAVE1_RUNNER_MODE: 'container',
    E2E_WAVE1_PROJECT: 'hexaone-e2e-wave1',
    E2E_WAVE1_NETWORK: 'hexaone_e2e_wave1_network',
    HOME: '/tmp',
    TMPDIR: '/tmp',
  });
}

const runPreflight = () => spawnSync(
  process.execPath,
  [
    '-e',
    "require('./test/e2e-wave1.guard.cjs')().catch((error) => { console.error(error); process.exitCode = 1; });",
  ],
  { cwd: apiDir, env: safeEnv, stdio: 'inherit' },
);

if (args.length === 1 && args[0] === '--preflight') {
  const preflight = runPreflight();
  if (preflight.error) throw preflight.error;
  process.exitCode = preflight.status ?? 1;
} else if (args.length === 1 && args[0] === '--seed-browser-accounts') {
  const browserPassword = containerRunner
    ? readSecretFile('e2e_browser_password')
    : process.env.E2E_BROWSER_PASSWORD;
  const browserSubdomain = process.env.E2E_BROWSER_SUBDOMAIN;
  if (!browserPassword || !/^wave1-browser-[a-z0-9-]{4,48}$/.test(browserSubdomain || '')) {
    throw new Error('Supply a local browser password and a unique wave1-browser-* subdomain.');
  }
  const preflight = runPreflight();
  if (preflight.error || preflight.status !== 0) {
    throw new Error('Browser-account seed refused because the read-only E2E preflight failed.');
  }
  const seed = spawnSync(
    process.execPath,
    ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'test/seed-wave1-browser-accounts.cjs'],
    {
      cwd: apiDir,
      env: { ...safeEnv, E2E_BROWSER_PASSWORD: browserPassword, E2E_BROWSER_SUBDOMAIN: browserSubdomain },
      stdio: 'inherit',
    },
  );
  process.exitCode = seed.status ?? 1;
} else if (args.length === 1 && args[0] === '--api') {
  const preflight = runPreflight();
  if (preflight.error || preflight.status !== 0) {
    throw new Error('Isolated API startup refused because the read-only E2E preflight failed.');
  }
  const server = spawn(
    process.execPath,
    ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'src/main.ts'],
    { cwd: apiDir, env: safeEnv, stdio: 'inherit' },
  );
  const stop = () => server.kill('SIGINT');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
} else {
  if (!args.length || args.some((name) => path.basename(name) !== name || !/^[\w.-]+\.e2e-spec\.ts$/.test(name))) {
    throw new Error('Pass one or more E2E spec basenames, or use --preflight, --api, or --seed-browser-accounts.');
  }
  const specs = args.map((name) => path.join(testDir, name));
  if (specs.some((spec) => !existsSync(spec))) {
    throw new Error('A requested E2E spec does not exist in apps/api/test.');
  }
  const jestSpecs = specs.map((spec) => path.relative(apiDir, spec).split(path.sep).join('/'));

  const jest = path.join(apiDir, 'node_modules', 'jest', 'bin', 'jest.js');
  const result = spawnSync(
    process.execPath,
    [jest, '--config', './test/jest-e2e.config.ts', '--runInBand', '--runTestsByPath', ...jestSpecs],
    { cwd: apiDir, env: safeEnv, stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
}
