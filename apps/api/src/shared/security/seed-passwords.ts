import { randomBytes } from 'crypto';

/**
 * F-11: the seed must never create accounts with a fixed, published password.
 *
 * Each seeded password comes from an environment variable. When the variable is
 * not set a random password is generated; it is shown in the console only
 * outside production, so a production deploy log never contains a usable login.
 * Existing accounts are never touched: the seed only uses these for users it creates.
 */
export const SEED_PASSWORD_MIN_LENGTH = 12;

export const SEED_PASSWORD_ENV = {
  admin: 'SEED_ADMIN_PASSWORD',
  cashier: 'SEED_CASHIER_PASSWORD',
  manager: 'SEED_MANAGER_PASSWORD',
} as const;

/** Passwords that were published in this repository and must never be accepted again. */
const KNOWN_PUBLISHED = new Set(['Admin@123456', 'Cashier@123456', 'Manager@123456']);

export interface SeedPassword {
  value: string;
  source: 'env' | 'generated';
  /** What the seed may print about this password. Never the value in production. */
  display: string;
}

export function generateSeedPassword(): string {
  // 18 url-safe characters (~108 bits) plus a fixed suffix so it meets common complexity rules.
  return `${randomBytes(14).toString('base64url').slice(0, 18)}#9a`;
}

export function resolveSeedPassword(
  envName: string,
  env: NodeJS.ProcessEnv = process.env,
  generate: () => string = generateSeedPassword,
): SeedPassword {
  const production = env.NODE_ENV === 'production';
  const raw = env[envName];
  if (raw !== undefined && raw !== '') {
    if (raw.length < SEED_PASSWORD_MIN_LENGTH) {
      throw new Error(`${envName} must be at least ${SEED_PASSWORD_MIN_LENGTH} characters`);
    }
    if (KNOWN_PUBLISHED.has(raw)) {
      throw new Error(`${envName} is a published default password; choose another`);
    }
    return { value: raw, source: 'env', display: `from ${envName}` };
  }
  const value = generate();
  return {
    value,
    source: 'generated',
    display: production
      ? `random, not shown (set ${envName} or use password reset)`
      : `${value} (generated; set ${envName} to choose)`,
  };
}
