import { normalizeRole } from '@/lib/utils';

/** Super Admin & Tenant Admin skip approval workflows in the shop UI. */
export function bypassesWorkflowApproval(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === 'super_admin' || r === 'tenant_admin';
}
