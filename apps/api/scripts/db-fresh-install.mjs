#!/usr/bin/env node
/**
 * F-33b: build a NEW, EMPTY database from the repository (developers, CI, disaster-recovery drills).
 *
 *   DATABASE_URL=postgresql://... node scripts/db-fresh-install.mjs
 *
 * Why not a `0_init` migration: production has never applied one, so `migrate deploy` would try to
 * create types and tables that already exist there and the release would fail. Instead:
 *   1. refuse unless the database is completely empty (any table, type or migration row → exit 1);
 *   2. apply prisma/baseline/baseline.sql (= schema at main d8326a8, after the 44 listed migrations);
 *   3. record those 44 migrations as applied (`prisma migrate resolve --applied`);
 *   4. `prisma migrate deploy` for every later migration (this is what production runs too);
 *   5. check the result equals prisma/schema.prisma.
 * It never touches an existing database. It does not seed (see docs/initial-setup-and-seeding.md).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselineDir = join(apiDir, 'prisma', 'baseline');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to the NEW, empty database.');
  process.exit(1);
}
const shownUrl = url.replace(/\/\/[^@]*@/, '//***@');
// The URL is never put on a command line: Prisma reads DATABASE_URL via prisma/schema.prisma.

function prisma(args, { allowFail = false } = {}) {
  try {
    const prismaCli = join(apiDir, 'node_modules', 'prisma', 'build', 'index.js');
    execFileSync(process.execPath, [prismaCli, ...args], {
      cwd: apiDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    return 0;
  } catch (e) {
    if (allowFail) return e.status ?? 1;
    console.error(`prisma ${args[0]} ${args[1] ?? ''} failed:\n${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`);
    process.exit(1);
  }
}

console.log(`Target: ${shownUrl}`);

// 1. Empty check: a diff from the database to "empty" with no changes (exit 0) means nothing exists yet.
const emptyCheck = prisma(['migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-empty', '--exit-code'], { allowFail: true });
// prisma migrate diff --exit-code: 0 = no difference (empty), 2 = differences (not empty), other = error.
if (emptyCheck === 2) {
  console.error('REFUSED: the database is not empty (it has tables or types). This script only builds new databases.');
  process.exit(1);
}
if (emptyCheck !== 0) {
  console.error('REFUSED: could not inspect the database (connection or permission error). Nothing was changed.');
  process.exit(1);
}

// 2–3. Baseline + mark the baseline migrations as applied.
const names = readFileSync(join(baselineDir, 'baseline-migrations.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
console.log(`Applying baseline (${names.length} migrations up to ${names[names.length - 1]})...`);
// Relative to apps/api (cwd): an absolute path can contain spaces, which the Windows shell would split.
prisma(['db', 'execute', '--schema', 'prisma/schema.prisma', '--file', 'prisma/baseline/baseline.sql']);
for (const name of names) prisma(['migrate', 'resolve', '--applied', name]);

// 4. Everything newer goes through the normal migration path.
console.log('Running prisma migrate deploy for later migrations...');
prisma(['migrate', 'deploy']);

// 5. Parity.
const drift = prisma(['migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'], { allowFail: true });
if (drift !== 0) {
  console.error('WARNING: the database does not match prisma/schema.prisma (exit ' + drift + ').');
  process.exit(1);
}
console.log('Done: database matches prisma/schema.prisma. Next (optional, local only): seed — see docs/initial-setup-and-seeding.md');
