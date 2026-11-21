/**
 * Reviewed per-tenant update of the standard shop roles (owner decision 8c, 3 Nov 2026).
 *
 *   Dry run (default, read-only):
 *     npx ts-node -r tsconfig-paths/register scripts/review-system-roles.ts --tenant <tenantId>
 *     npx ts-node -r tsconfig-paths/register scripts/review-system-roles.ts --all
 *   Apply to ONE tenant (transaction + audit_logs entry):
 *     ... --tenant <tenantId> --apply --confirm <tenantId> --actor "<name>" [--add-only]
 *
 * Prints permission keys and counts only. Never touches custom roles. Requires an explicit
 * --confirm equal to --tenant, so it cannot be applied to the wrong shop or to all shops at once.
 */
import { PrismaClient } from '@prisma/client';
import { applySystemRoleReview, formatReview, reviewSystemRoles } from '../src/modules/roles/system-role-review';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const db = new PrismaClient();
  const url = process.env.DATABASE_URL ?? '';
  console.log(`Database: ${url.replace(/\/\/[^@]*@/, '//***@')}`);
  try {
    const tenant = arg('tenant');
    if (flag('apply')) {
      if (!tenant) throw new Error('--apply needs --tenant <id> (one tenant at a time)');
      const confirm = arg('confirm');
      const actor = arg('actor');
      if (!confirm || !actor) throw new Error('--apply needs --confirm <same tenant id> and --actor "<name>"');
      const r = await applySystemRoleReview(db, tenant, { confirmTenantId: confirm, addOnly: flag('add-only'), actor });
      console.log('APPLIED:\n' + formatReview(r, flag('add-only')));
      return;
    }
    const ids = flag('all') ? (await db.tenant.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } })).map((t) => t.id) : tenant ? [tenant] : [];
    if (!ids.length) throw new Error('Give --tenant <id> or --all');
    for (const id of ids) console.log(formatReview(await reviewSystemRoles(db, id), flag('add-only')));
    console.log('\nDry run only — nothing was changed.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => { console.error(`ERROR: ${(e as Error).message}`); process.exit(1); });
