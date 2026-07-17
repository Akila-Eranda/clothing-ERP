import {
  AUDIT_ACTIONS,
  extractAuditResource,
  isClientAuditAction,
  normalizeClientAuditAction,
  resolveAuditAction,
  sanitizeAuditData,
  shouldAuditHttpRequest,
  shouldSkipAuditPath,
} from './audit.helper';

describe('Phase 06 Sprint 12 — Audit Trail', () => {
  it('maps CRUD methods to standard actions', () => {
    expect(resolveAuditAction('POST', '/api/v1/products')).toBe(AUDIT_ACTIONS.CREATE);
    expect(resolveAuditAction('PUT', '/api/v1/customers/abc')).toBe(AUDIT_ACTIONS.UPDATE);
    expect(resolveAuditAction('PATCH', '/api/v1/inventory/lots/x')).toBe(AUDIT_ACTIONS.UPDATE);
    expect(resolveAuditAction('DELETE', '/api/v1/users/u1')).toBe(AUDIT_ACTIONS.DELETE);
  });

  it('maps approve / export / print paths', () => {
    expect(resolveAuditAction('POST', '/api/v1/accounting/expense-claims/c1/approve')).toBe(
      AUDIT_ACTIONS.APPROVE,
    );
    expect(resolveAuditAction('POST', '/api/v1/workflow/tasks/t1/reject')).toBe(
      AUDIT_ACTIONS.REJECT,
    );
    expect(resolveAuditAction('GET', '/api/v1/accounting/reports/vat/export')).toBe(
      AUDIT_ACTIONS.EXPORT,
    );
    expect(resolveAuditAction('POST', '/api/v1/tenants/receipts/print')).toBe(
      AUDIT_ACTIONS.PRINT,
    );
  });

  it('skips auth noise and audit-logs recursion', () => {
    expect(shouldSkipAuditPath('/api/v1/audit-logs')).toBe(true);
    expect(shouldSkipAuditPath('/api/v1/auth/login')).toBe(true);
    expect(shouldAuditHttpRequest('POST', '/api/v1/auth/refresh')).toBe(false);
    expect(shouldAuditHttpRequest('GET', '/api/v1/products')).toBe(false);
  });

  it('extracts resource and id from nested paths', () => {
    expect(extractAuditResource('/api/v1/products')).toEqual({ resource: 'products' });
    expect(extractAuditResource('/api/v1/accounting/expense-claims/cuidclaim01/approve')).toEqual({
      resource: 'expense-claims',
      resourceId: 'cuidclaim01',
    });
    expect(extractAuditResource('/api/v1/workflow/tasks/taskid123/approve')).toEqual({
      resource: 'tasks',
      resourceId: 'taskid123',
    });
  });

  it('redacts sensitive fields', () => {
    const cleaned = sanitizeAuditData({
      email: 'a@b.com',
      password: 'secret',
      nested: { refreshToken: 'tok', name: 'ok' },
    }) as Record<string, unknown>;
    expect(cleaned.email).toBe('a@b.com');
    expect(cleaned.password).toBe('[redacted]');
    expect((cleaned.nested as Record<string, unknown>).refreshToken).toBe('[redacted]');
    expect((cleaned.nested as Record<string, unknown>).name).toBe('ok');
  });

  it('validates client PRINT/EXPORT actions', () => {
    expect(isClientAuditAction('PRINT')).toBe(true);
    expect(isClientAuditAction('CREATE')).toBe(false);
    expect(normalizeClientAuditAction('export')).toBe('EXPORT');
    expect(normalizeClientAuditAction('login')).toBeNull();
  });
});
