/**
 * Who is really acting on a cash drawer, and who (if anyone) authorised it.
 *
 * A POS terminal stays logged in as one user while cashiers switch by PIN (x-pos-cashier-token).
 * Permissions for cash movements therefore come from the ACTING person, never from the terminal login:
 * a cashier who PINs in on a terminal where a manager is logged in is still a cashier.
 *
 * Manager approval is explicit: a manager enters their own PIN (POST /cash/manager-approval) and the
 * terminal receives a short-lived signed approval token (x-cash-approval-token). Only then is that manager
 * recorded as the authoriser. An acting manager (logged in or PIN-switched) authorises their own actions.
 */
import * as crypto from 'crypto';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, RoleType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { bypassesWorkflowApproval } from '@/shared/workflow-bypass.helper';
import { verifyPosUnlockToken } from '@/modules/pos/pos-pin.helper';

type Db = PrismaService | Prisma.TransactionClient;

const APPROVAL_TTL_MS = 5 * 60 * 1000;

/** Roles that may approve cash outside a cashier's own limits. */
export function isCashManagerRole(roles: readonly string[] = []): boolean {
  return (
    bypassesWorkflowApproval([...roles])
    || roles.includes(RoleType.BRANCH_MANAGER)
    || roles.includes(RoleType.ACCOUNTANT)
    || roles.includes(RoleType.INVENTORY_MANAGER)
  );
}

function secret() {
  return process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'fashionerp-dev-secret';
}

export type CashApprovalPayload = { typ: 'cash_approval'; tenantId: string; managerId: string; exp: number };

export function signCashApprovalToken(tenantId: string, managerId: string, now = Date.now()): string {
  const payload: CashApprovalPayload = { typ: 'cash_approval', tenantId, managerId, exp: now + APPROVAL_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** Manager id from a valid, unexpired approval token for this tenant; otherwise null. */
export function verifyCashApprovalToken(token: string | null | undefined, tenantId: string, now = Date.now()): string | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CashApprovalPayload;
    if (p.typ !== 'cash_approval' || p.tenantId !== tenantId || !p.managerId || p.exp < now) return null;
    return p.managerId;
  } catch {
    return null;
  }
}

/** Who is at the terminal: logged-in user, PIN-switched cashier token, optional manager approval token. */
export type CashAuth = {
  user: { id: string; roles?: string[] };
  unlockToken?: string | null;
  approvalToken?: string | null;
};

export type CashActor = {
  /** The person really acting (PIN cashier, else the logged-in user). Record as createdById. */
  actorId: string;
  actorRoles: string[];
  actorIsManager: boolean;
  /** Manager who authorised: the acting manager, or the manager of a valid approval token. */
  authorizerId: string | null;
};

async function activeRoles(db: Db, tenantId: string, userId: string): Promise<string[] | null> {
  const u = await db.user.findFirst({
    where: { id: userId, tenantId, status: 'ACTIVE' },
    select: { roles: { select: { role: { select: { type: true } } } } },
  });
  return u ? u.roles.map((r) => r.role.type) : null;
}

/**
 * Resolves the acting person and the authoriser for a cash action.
 * - PIN token for another user → that user acts, with THEIR roles from the database (never the terminal's).
 * - No / invalid PIN token → the logged-in user acts with their own roles.
 * - Approval token → its manager is the authoriser, if still an active manager of this tenant.
 */
export async function resolveCashActor(
  db: Db,
  opts: {
    tenantId: string;
    branchId?: string;
    user: { id: string; roles?: string[] };
    unlockToken?: string | null;
    approvalToken?: string | null;
  },
): Promise<CashActor> {
  const pinUserId = verifyPosUnlockToken(opts.unlockToken, opts.tenantId, opts.branchId, opts.user.id);
  let actorId = opts.user.id;
  let actorRoles = opts.user.roles ?? [];
  if (pinUserId && pinUserId !== opts.user.id) {
    const roles = await activeRoles(db, opts.tenantId, pinUserId);
    if (!roles) throw new ForbiddenException('The cashier signed in by PIN is not active');
    actorId = pinUserId;
    actorRoles = roles;
  }
  const actorIsManager = isCashManagerRole(actorRoles);

  let approverId: string | null = null;
  const approvalManagerId = verifyCashApprovalToken(opts.approvalToken, opts.tenantId);
  if (approvalManagerId) {
    const roles = await activeRoles(db, opts.tenantId, approvalManagerId);
    if (roles && isCashManagerRole(roles)) approverId = approvalManagerId;
  }

  return { actorId, actorRoles, actorIsManager, authorizerId: actorIsManager ? actorId : approverId };
}

// Manager PIN brute-force protection lives in PinLockoutService (Redis, shared by all API instances).

/** Error code of a refusal that a manager PIN approval (x-cash-approval-token) would lift. */
export const MANAGER_APPROVAL_REQUIRED = 'MANAGER_APPROVAL_REQUIRED';

/** 403 that the POS answers by asking for a manager PIN and retrying with the approval token. */
export function managerApprovalRequired(message: string) {
  return new ForbiddenException({ statusCode: 403, error: MANAGER_APPROVAL_REQUIRED, message });
}
