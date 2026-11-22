#!/usr/bin/env node
/**
 * Local runner for the full-app e2e specs against a THROW-AWAY database and Redis (never production).
 *
 *   HEXA_INT_DATABASE_URL=postgresql://u:p@127.0.0.1:PORT/hexa_qa...  HEXA_INT_REDIS_PORT=PORT  HEXA_INT_REDIS_PASSWORD=...
 *   node test-int/run-e2e-local.cjs [jest args, e.g. bank-account-admin]
 *
 * Refuses anything that is not localhost + a hexa_qa* database. JWT secrets are generated per run.
 */
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const url = process.env.HEXA_INT_DATABASE_URL;
if (!url) { console.error('Set HEXA_INT_DATABASE_URL (throw-away local database).'); process.exit(1); }
const u = new URL(url);
const db = u.pathname.replace(/^\//, '');
if (!['127.0.0.1', 'localhost'].includes(u.hostname) || !/^hexa_qa/.test(db)) {
  console.error(`Refusing: database must be on localhost and named hexa_qa* (got ${u.hostname}/${db}).`);
  process.exit(1);
}
const redisPort = process.env.HEXA_INT_REDIS_PORT;
if (!redisPort) { console.error('Set HEXA_INT_REDIS_PORT (throw-away local Redis).'); process.exit(1); }

const env = {
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
  NODE_ENV: 'test',
  DATABASE_URL: url,
  REDIS_HOST: '127.0.0.1', REDIS_PORT: redisPort, REDIS_DB: '0', REDIS_PASSWORD: process.env.HEXA_INT_REDIS_PASSWORD || '',
  JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
  UPLOAD_DIR: path.join(os.tmpdir(), 'hexa-qa-uploads'), LOCAL_UPLOAD_DIR: path.join(os.tmpdir(), 'hexa-qa-uploads'),
  WHATSAPP_AUTH_DIR: path.join(os.tmpdir(), 'hexa-qa-whatsapp'),
  KEYCLOAK_AUTH_ENABLED: 'false',
  SMTP_HOST: '127.0.0.1', FRONTEND_URL: 'http://127.0.0.1:3000', PORT: '3199',
};
const jest = path.join(__dirname, '..', 'node_modules', 'jest', 'bin', 'jest.js');
const r = spawnSync(process.execPath, [jest, '-c', 'test-int/jest-e2e-local.config.ts', '--runInBand', ...process.argv.slice(2)], {
  cwd: path.join(__dirname, '..'), env, stdio: 'inherit',
});
process.exit(r.status ?? 1);
