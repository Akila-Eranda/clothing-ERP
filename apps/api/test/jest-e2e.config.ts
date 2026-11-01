import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
    '^nanoid$': '<rootDir>/shims/nanoid.ts',
    '^@prisma/client$': '<rootDir>/../node_modules/.prisma/client',
    '^@prisma/client/(.*)$': '<rootDir>/../node_modules/.prisma/client/$1',
  },
};

export default config;
