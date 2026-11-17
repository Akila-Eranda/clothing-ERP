/**
 * Owner decision (6 Nov 2026): the seed is NOT part of production deployments.
 * It may run in production only as an explicit initial setup of an EMPTY database,
 * so existing shops, users, roles and permissions are never modified by it.
 *
 *   local / test / CI          → runs
 *   production, no flag        → skipped (exit 0, so old deploy scripts do not fail)
 *   production, flag, has data → refused (exit 1)
 *   production, flag, empty    → runs (initial setup)
 *
 * Flag: HEXA_INITIAL_SETUP=empty-database-only (deliberately long so it is never set by accident).
 */
export const INITIAL_SETUP_FLAG = 'HEXA_INITIAL_SETUP';
export const INITIAL_SETUP_VALUE = 'empty-database-only';

export type SeedDecision =
  | { action: 'run'; reason: string }
  | { action: 'skip'; exitCode: 0; reason: string }
  | { action: 'refuse'; exitCode: 1; reason: string };

export function decideSeedRun(env: NodeJS.ProcessEnv, existingTenants: number): SeedDecision {
  if (env.NODE_ENV !== 'production') {
    return { action: 'run', reason: `NODE_ENV=${env.NODE_ENV ?? 'unset'} (not production)` };
  }
  if (env[INITIAL_SETUP_FLAG] !== INITIAL_SETUP_VALUE) {
    return {
      action: 'skip', exitCode: 0,
      reason: 'Seed skipped: it is not part of production deployments. '
        + `Initial setup of an empty database only: ${INITIAL_SETUP_FLAG}=${INITIAL_SETUP_VALUE} (see docs/initial-setup-and-seeding.md).`,
    };
  }
  if (existingTenants > 0) {
    return {
      action: 'refuse', exitCode: 1,
      reason: `Seed refused: this database already has ${existingTenants} shop(s). The seed never runs on a database with existing data.`,
    };
  }
  return { action: 'run', reason: 'production initial setup of an empty database' };
}
