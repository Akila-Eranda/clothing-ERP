import type { Config } from 'jest';

/**
 * Real-PostgreSQL integration tests (Part 9). Run:
 *
 *   HEXA_INT_DATABASE_URL=postgresql://user:pass@127.0.0.1:<port>/hexa_qa_x  npx jest -c test-int/jest-int.config.ts
 *
 * The database must be a throw-away, EMPTY database built with `node scripts/db-fresh-install.mjs`. The helper refuses
 * any URL that is not localhost with a database name starting "hexa_qa" (so it can never touch a real shop database).
 * Without HEXA_INT_DATABASE_URL every suite is skipped, so the normal `jest` run is unaffected.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '\\.int-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  testTimeout: 60_000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
    '^nanoid$': '<rootDir>/../test/shims/nanoid.ts',
    '^@prisma/client$': '<rootDir>/../node_modules/.prisma/client',
    '^@prisma/client/(.*)$': '<rootDir>/../node_modules/.prisma/client/$1',
  },
};

export default config;
