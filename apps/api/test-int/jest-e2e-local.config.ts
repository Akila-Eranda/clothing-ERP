import type { Config } from 'jest';

/**
 * Runs the existing full-app HTTP e2e specs (test/*.e2e-spec.ts) against the throw-away local database + Redis,
 * WITHOUT the Wave 1 container guard (that guard is built for a different, internal-network setup).
 * Safety is enforced by test-int/run-e2e-local.cjs: localhost-only, database name hexa_qa*, throw-away secrets.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '../test',
  testRegex: '\.e2e-spec\.ts$',
  transform: { '^.+\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
    '^nanoid$': '<rootDir>/shims/nanoid.ts',
    '^@prisma/client$': '<rootDir>/../node_modules/.prisma/client',
    '^@prisma/client/(.*)$': '<rootDir>/../node_modules/.prisma/client/$1',
  },
};

export default config;
