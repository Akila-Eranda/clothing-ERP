/**
 * Audit Engine — pure action maps, HTTP/path rules, sanitization, event payloads.
 * I/O stays in AuditLogService.
 */

export const AUDIT_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  PRINT: 'PRINT',
  EXPORT: 'EXPORT',
  DAY_END: 'DAY_END',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ACTION_LIST = Object.values(AUDIT_ACTIONS);

/** Paths that should never write audit rows (noise / recursion). */
export const AUDIT_SKIP_PATH_FRAGMENTS = [
  '/audit-logs',
  '/auth/login',
  '/auth/platform-login',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/health',
] as const;

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'twoFactorSecret',
  'twoFactorCode',
  'authorization',
]);

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type AuditLogPayloadLike = {
  tenantId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldData?: object;
  newData?: object;
  ipAddress?: string;
  userAgent?: string;
};

export function normalizeAuditPath(url: string): string {
  const path = (url || '').split('?')[0].toLowerCase();
  return path.replace(/^\/api\/v\d+/, '') || path;
}

export function shouldSkipAuditPath(url: string): boolean {
  const path = normalizeAuditPath(url);
  return AUDIT_SKIP_PATH_FRAGMENTS.some((frag) => path.includes(frag));
}

/**
 * Map HTTP method + path to a Sprint-12 audit action.
 * Approvals / print / export win over generic CRUD.
 */
export function resolveAuditAction(method: string, url: string): AuditAction | null {
  const m = (method || '').toUpperCase();
  const path = normalizeAuditPath(url);

  if (shouldSkipAuditPath(url)) return null;

  if (path.includes('/approve')) return AUDIT_ACTIONS.APPROVE;
  if (path.includes('/reject')) return AUDIT_ACTIONS.REJECT;
  if (path.includes('/export')) return AUDIT_ACTIONS.EXPORT;
  if (path.includes('/print')) return AUDIT_ACTIONS.PRINT;

  if (m === 'DELETE') return AUDIT_ACTIONS.DELETE;
  if (m === 'PUT' || m === 'PATCH') return AUDIT_ACTIONS.UPDATE;
  if (m === 'POST') return AUDIT_ACTIONS.CREATE;

  if (m === 'GET' && (path.includes('/export') || path.includes('/print'))) {
    return path.includes('/export') ? AUDIT_ACTIONS.EXPORT : AUDIT_ACTIONS.PRINT;
  }

  return null;
}

export function shouldAuditHttpRequest(method: string, url: string): boolean {
  const m = (method || '').toUpperCase();
  const path = normalizeAuditPath(url);
  if (shouldSkipAuditPath(url)) return false;
  if (WRITE_METHODS.has(m)) return resolveAuditAction(m, url) != null;
  if (m === 'GET' && (path.includes('/export') || path.includes('/print'))) return true;
  return false;
}

/**
 * Extract resource name + id from a Nest path like
 * /accounting/expense-claims/cuid123/approve → expense-claims / cuid123
 */
export function extractAuditResource(url: string): { resource: string; resourceId?: string } {
  const path = normalizeAuditPath(url);
  const parts = path.split('/').filter(Boolean);
  const skip = new Set(['accounting', 'finance', 'api']);
  const meaningful = parts.filter((p) => !skip.has(p));

  if (!meaningful.length) {
    return { resource: parts[0] || 'unknown' };
  }

  const actionSuffixes = new Set([
    'approve', 'reject', 'export', 'print', 'submit', 'cancel',
    'post', 'void', 'close', 'lock', 'unlock', 'import', 'seed-defaults',
  ]);

  let resource = meaningful[0];
  let resourceId: string | undefined;

  for (let i = 0; i < meaningful.length; i++) {
    const part = meaningful[i];
    if (actionSuffixes.has(part)) continue;
    if (/^[a-z0-9_-]{8,}$/i.test(part) && i > 0 && !actionSuffixes.has(meaningful[i - 1] ?? '')) {
      const prev = meaningful[i - 1];
      if (prev && !actionSuffixes.has(prev)) {
        resource = prev;
        resourceId = part;
      }
      continue;
    }
    if (!actionSuffixes.has(part) && !/^\d+$/.test(part)) {
      resource = part;
    }
  }

  const lastActionIdx = meaningful.findIndex((p) => actionSuffixes.has(p));
  if (lastActionIdx > 0) {
    const before = meaningful[lastActionIdx - 1];
    const beforePrev = meaningful[lastActionIdx - 2];
    if (before && /^[a-z0-9_-]{8,}$/i.test(before) && beforePrev) {
      resource = beforePrev;
      resourceId = before;
    } else if (before && !/^[a-z0-9_-]{8,}$/i.test(before)) {
      resource = before;
    }
  }

  return { resource, resourceId };
}

export function sanitizeAuditData(data: unknown, depth = 0): object | undefined {
  if (data == null) return undefined;
  if (depth > 4) return { truncated: true };
  if (typeof data !== 'object') return { value: data } as object;
  if (Array.isArray(data)) {
    return {
      items: data.slice(0, 20).map((item) => sanitizeAuditData(item, depth + 1)),
      length: data.length,
    };
  }

  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (count >= 40) {
      out._truncated = true;
      break;
    }
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = '[redacted]';
      count++;
      continue;
    }
    if (value != null && typeof value === 'object') {
      out[key] = sanitizeAuditData(value, depth + 1);
    } else {
      out[key] = value;
    }
    count++;
  }
  return out;
}

export function isClientAuditAction(action: string): action is 'PRINT' | 'EXPORT' {
  return action === AUDIT_ACTIONS.PRINT || action === AUDIT_ACTIONS.EXPORT;
}

export function normalizeClientAuditAction(action: string): 'PRINT' | 'EXPORT' | null {
  const a = (action || '').toUpperCase();
  if (a === AUDIT_ACTIONS.PRINT || a === AUDIT_ACTIONS.EXPORT) return a;
  return null;
}

/** Map journal.* domain actions → Sprint-12 audit actions. */
export function normalizeJournalAuditAction(action: string): AuditAction {
  const a = (action || '').toLowerCase();
  if (a.includes('approve')) return AUDIT_ACTIONS.APPROVE;
  if (a.includes('reject')) return AUDIT_ACTIONS.REJECT;
  if (a.includes('create') || a === 'journal.draft' || a === 'journal.posted') {
    return AUDIT_ACTIONS.CREATE;
  }
  if (
    a.includes('update') ||
    a.includes('submit') ||
    a.includes('post') ||
    a.includes('void')
  ) {
    return AUDIT_ACTIONS.UPDATE;
  }
  if (a.includes('delete')) return AUDIT_ACTIONS.DELETE;
  return AUDIT_ACTIONS.UPDATE;
}

export function buildAuthLoginAudit(payload: {
  tenantId: string;
  userId: string;
  ip?: string;
  userAgent?: string;
}): AuditLogPayloadLike {
  return {
    tenantId: payload.tenantId,
    userId: payload.userId,
    action: AUDIT_ACTIONS.LOGIN,
    resource: 'Auth',
    ipAddress: payload.ip,
    userAgent: payload.userAgent,
  };
}

export function buildAuthLogoutAudit(payload: {
  tenantId: string;
  userId: string;
  ip?: string;
  userAgent?: string;
}): AuditLogPayloadLike {
  return {
    tenantId: payload.tenantId,
    userId: payload.userId,
    action: AUDIT_ACTIONS.LOGOUT,
    resource: 'Auth',
    ipAddress: payload.ip,
    userAgent: payload.userAgent,
  };
}

export function buildAuthLoginFailedAudit(payload: {
  tenantId: string;
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  reason?: string;
}): AuditLogPayloadLike {
  return {
    tenantId: payload.tenantId,
    userId: payload.userId,
    action: AUDIT_ACTIONS.LOGIN_FAILED,
    resource: 'Auth',
    newData: sanitizeAuditData({ email: payload.email, reason: payload.reason }),
    ipAddress: payload.ip,
    userAgent: payload.userAgent,
  };
}

export function buildPosSaleAudit(payload: {
  saleId: string;
  tenantId: string;
  branchId: string;
  total: number;
}): AuditLogPayloadLike {
  return {
    tenantId: payload.tenantId,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Sale',
    resourceId: payload.saleId,
    newData: { total: payload.total, branchId: payload.branchId },
  };
}

export function buildDayClosedAudit(payload: {
  tenantId: string;
  branchId: string;
  closedBy: string;
  totalRevenue: number;
}): AuditLogPayloadLike {
  return {
    tenantId: payload.tenantId,
    userId: payload.closedBy,
    action: AUDIT_ACTIONS.DAY_END,
    resource: 'POS',
    newData: { branchId: payload.branchId, totalRevenue: payload.totalRevenue },
  };
}

export function buildWorkflowApprovedAudit(payload: {
  tenantId: string;
  userId: string;
  taskId: string;
  entityType: string;
  entityId: string;
  final?: boolean;
}): AuditLogPayloadLike {
  return {
    tenantId: payload.tenantId,
    userId: payload.userId,
    action: AUDIT_ACTIONS.APPROVE,
    resource: payload.entityType || 'Workflow',
    resourceId: payload.entityId || payload.taskId,
    newData: { taskId: payload.taskId, final: payload.final ?? false },
  };
}

export function buildWorkflowRejectedAudit(payload: {
  tenantId: string;
  userId: string;
  taskId: string;
  entityType: string;
  entityId: string;
  comment?: string;
}): AuditLogPayloadLike {
  return {
    tenantId: payload.tenantId,
    userId: payload.userId,
    action: AUDIT_ACTIONS.REJECT,
    resource: payload.entityType || 'Workflow',
    resourceId: payload.entityId || payload.taskId,
    newData: { taskId: payload.taskId, comment: payload.comment },
  };
}
