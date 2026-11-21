import { PrismaClient } from '@prisma/client';
import { planSystemRoleChanges, RoleChangePlan, systemRoleDefinitions } from './default-system-roles';

/**
 * Reviewed, explicit per-tenant update of the standard shop roles (Cashier, Tenant Admin, Branch
 * Manager) to their default permission packs. Replaces the old automatic sync on login.
 *
 * review() is read-only. apply() changes ONE tenant's system roles inside a single transaction,
 * only when the caller confirms the tenant id, and writes an audit_logs entry with the before/after
 * permission keys. Custom roles are never touched. Output contains permission keys and counts only.
 */
export interface TenantRoleReview {
  tenantId: string;
  plans: RoleChangePlan[];
  changes: number;
}

const keyOf = (p: { resource: string; action: string }) => `${p.resource}:${p.action}`;

export async function reviewSystemRoles(db: PrismaClient, tenantId: string): Promise<TenantRoleReview> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  const permissions = await db.permission.findMany({ select: { resource: true, action: true } });
  const names = systemRoleDefinitions([]).map((d) => d.name);
  const roles = await db.role.findMany({
    where: { tenantId, name: { in: names } },
    select: { name: true, permissions: { select: { permission: { select: { resource: true, action: true } } } } },
  });
  const plans = planSystemRoleChanges(
    roles.map((r) => ({ name: r.name, permissions: r.permissions.map((rp) => keyOf(rp.permission)) })),
    permissions.map(keyOf),
  );
  return { tenantId, plans, changes: plans.reduce((s, p) => s + p.add.length + p.remove.length + (p.exists ? 0 : 1), 0) };
}

export interface ApplyOptions {
  /** Must equal tenantId — guards against applying to the wrong shop. */
  confirmTenantId: string;
  /** Only add missing permissions; never remove any (e.g. keep a shop's extra cashier rights). */
  addOnly?: boolean;
  /** Who ran the step, recorded in audit_logs. */
  actor: string;
}

export async function applySystemRoleReview(db: PrismaClient, tenantId: string, opts: ApplyOptions): Promise<TenantRoleReview> {
  if (opts.confirmTenantId !== tenantId) throw new Error('confirmTenantId does not match tenantId — nothing applied');
  return db.$transaction(async (tx) => {
    const review = await reviewSystemRoles(tx as unknown as PrismaClient, tenantId);
    const permissions = await tx.permission.findMany();
    const idByKey = new Map(permissions.map((p) => [keyOf(p), p.id]));
    const defs = new Map(systemRoleDefinitions([...idByKey.keys()]).map((d) => [d.name, d]));

    for (const plan of review.plans) {
      const def = defs.get(plan.role)!;
      if (!plan.exists) {
        await tx.role.create({
          data: { tenantId, name: def.name, type: def.type, isSystem: true,
            permissions: { create: plan.add.map((k) => ({ permissionId: idByKey.get(k)! })) } },
        });
        continue;
      }
      const role = await tx.role.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: plan.role } } });
      if (plan.add.length) {
        await tx.rolePermission.createMany({
          data: plan.add.map((k) => ({ roleId: role.id, permissionId: idByKey.get(k)! })),
          skipDuplicates: true,
        });
      }
      if (plan.remove.length && !opts.addOnly) {
        await tx.rolePermission.deleteMany({
          where: { roleId: role.id, permissionId: { in: plan.remove.map((k) => idByKey.get(k)!).filter(Boolean) } },
        });
      }
    }
    await tx.auditLog.create({
      data: {
        tenantId,
        action: 'system_roles.reviewed_update',
        resource: 'roles',
        oldData: { plans: review.plans, addOnly: !!opts.addOnly } as object,
        newData: { actor: opts.actor, appliedAt: new Date().toISOString() } as object,
      },
    });
    return review;
  });
}

/** Human-readable report (permission keys and counts only — no personal data). */
export function formatReview(r: TenantRoleReview, addOnly = false): string {
  const lines = [`Tenant ${r.tenantId}: ${r.changes} change(s)${addOnly ? ' (add-only: removals skipped)' : ''}`];
  for (const p of r.plans) {
    if (!p.exists) { lines.push(`  ${p.role}: MISSING → would be created with ${p.add.length} permission(s)`); continue; }
    lines.push(`  ${p.role}: keep ${p.unchanged}` +
      (p.add.length ? `, add ${p.add.length} [${p.add.join(', ')}]` : '') +
      (p.remove.length ? `, ${addOnly ? 'would keep (add-only)' : 'remove'} ${p.remove.length} [${p.remove.join(', ')}]` : '') +
      (!p.add.length && !p.remove.length ? ' — already matches defaults' : ''));
  }
  return lines.join('\n');
}
