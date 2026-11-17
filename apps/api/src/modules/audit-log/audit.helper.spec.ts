import {
  AUDIT_ACTIONS,
  extractAuditResource,
  isClientAuditAction,
  normalizeClientAuditAction,
  normalizeJournalAuditAction,
  resolveAuditAction,
  sanitizeAuditData,
  redactSensitiveKeys,
  shouldAuditHttpRequest,
  shouldSkipAuditPath,
  buildPosSaleAudit,
  buildDayClosedAudit,
  buildWorkflowApprovedAudit,
} from './audit-engine.helper';

describe('Audit Engine', () => {
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
    expect(shouldSkipAuditPath('/api/v1/whatsapp/connect')).toBe(true);
    expect(shouldAuditHttpRequest('POST', '/api/v1/auth/refresh')).toBe(false);
    expect(shouldAuditHttpRequest('POST', '/api/v1/whatsapp/status')).toBe(false);
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

  it('redacts POS / manager PINs, reload-card PINs and approval / unlock tokens', () => {
    const cleaned = sanitizeAuditData({ pin: '2468', pins: '1111 2222', approvalToken: 'a.b', unlockToken: 'c.d', reason: 'ok' }) as Record<string, unknown>;
    expect(cleaned).toEqual({ pin: '[redacted]', pins: '[redacted]', approvalToken: '[redacted]', unlockToken: '[redacted]', reason: 'ok' });
  });

  it('redacts PIN / token variants case-insensitively at any depth, keeps postal pincode', () => {
    const cleaned = sanitizeAuditData({ managerPin: '2468', PIN: '1', nested: { newPin: '1111', cashierPinHash: 'h', x: { approvalToken: 't' } }, pincode: '10100', cardNumber: '4111111111111111', CVV: '123' }) as Record<string, any>;
    expect(cleaned).toEqual({ managerPin: '[redacted]', PIN: '[redacted]', nested: { newPin: '[redacted]', cashierPinHash: '[redacted]', x: { approvalToken: '[redacted]' } }, pincode: '10100', cardNumber: '[redacted]', CVV: '[redacted]' });
  });

  it('bank account numbers are redacted, other bank details are kept', () => {
    expect(redactSensitiveKeys({ bankName: 'BOC', accountNumber: '0012345678', accountHolderName: 'K N Perera', branchCode: '7010' }))
      .toEqual({ bankName: 'BOC', accountNumber: '[redacted]', accountHolderName: 'K N Perera', branchCode: '7010' });
    expect(redactSensitiveKeys({ bankDetails: { accountNumber: '1234567890' } })).toEqual({ bankDetails: { accountNumber: '[redacted]' } });
  });

  it('redactSensitiveKeys keeps dates / arrays intact and only blanks credentials', () => {
    const d = new Date('2026-11-10T00:00:00Z');
    expect(redactSensitiveKeys({ at: d, rows: [{ pin: '1' }, 2], title: 'x' })).toEqual({ at: d, rows: [{ pin: '[redacted]' }, 2], title: 'x' });
  });

  it('validates client PRINT/EXPORT actions', () => {
    expect(isClientAuditAction('PRINT')).toBe(true);
    expect(isClientAuditAction('CREATE')).toBe(false);
    expect(normalizeClientAuditAction('export')).toBe('EXPORT');
    expect(normalizeClientAuditAction('login')).toBeNull();
  });

  it('normalizes journal domain actions', () => {
    expect(normalizeJournalAuditAction('journal.approve')).toBe(AUDIT_ACTIONS.APPROVE);
    expect(normalizeJournalAuditAction('journal.reject')).toBe(AUDIT_ACTIONS.REJECT);
    expect(normalizeJournalAuditAction('journal.draft')).toBe(AUDIT_ACTIONS.CREATE);
    expect(normalizeJournalAuditAction('journal.post')).toBe(AUDIT_ACTIONS.UPDATE);
    expect(normalizeJournalAuditAction('journal.void')).toBe(AUDIT_ACTIONS.UPDATE);
  });

  it('builds domain event audit payloads', () => {
    expect(
      buildPosSaleAudit({
        saleId: 's1',
        tenantId: 't1',
        branchId: 'b1',
        total: 100,
      }),
    ).toMatchObject({
      action: AUDIT_ACTIONS.CREATE,
      resource: 'Sale',
      resourceId: 's1',
    });

    expect(
      buildDayClosedAudit({
        tenantId: 't1',
        branchId: 'b1',
        closedBy: 'u1',
        totalRevenue: 500,
      }).action,
    ).toBe(AUDIT_ACTIONS.DAY_END);

    expect(
      buildWorkflowApprovedAudit({
        tenantId: 't1',
        userId: 'u1',
        taskId: 'task1',
        entityType: 'PurchaseOrder',
        entityId: 'po1',
        final: true,
      }),
    ).toMatchObject({
      action: AUDIT_ACTIONS.APPROVE,
      resource: 'PurchaseOrder',
      resourceId: 'po1',
    });
  });
});
