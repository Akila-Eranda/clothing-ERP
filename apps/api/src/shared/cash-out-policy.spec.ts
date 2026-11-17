import { cashOutApprovalThreshold, decideCashOut } from './cash-register.helper';

describe('manual cash out policy (audit H2)', () => {
  const base = { available: 6000, threshold: 5000 };

  it('a cashier may take out up to the threshold, within the drawer balance', () => {
    expect(decideCashOut({ ...base, amount: 5000, isManager: false })).toEqual({ ok: true, needsAuthorizer: false });
    expect(decideCashOut({ ...base, amount: 300.5, isManager: false })).toEqual({ ok: true, needsAuthorizer: false });
  });

  it('never more than the drawer holds (cashier or manager)', () => {
    expect(decideCashOut({ ...base, amount: 6000.01, isManager: true })).toMatchObject({ ok: false, code: 'INSUFFICIENT_CASH' });
    expect(decideCashOut({ amount: 10, available: 0, threshold: 5000, isManager: false })).toMatchObject({ ok: false, code: 'INSUFFICIENT_CASH' });
    expect(decideCashOut({ amount: 10, available: -50, threshold: 5000, isManager: true })).toMatchObject({ ok: false, code: 'INSUFFICIENT_CASH' });
  });

  it('above the threshold only a manager, who is then the authoriser', () => {
    expect(decideCashOut({ ...base, amount: 5500, isManager: false })).toMatchObject({ ok: false, code: 'MANAGER_REQUIRED' });
    expect(decideCashOut({ ...base, amount: 5500, isManager: true })).toEqual({ ok: true, needsAuthorizer: true });
  });

  it('balance is checked before the role (no hint that a manager could overdraw)', () => {
    expect(decideCashOut({ ...base, amount: 9000, isManager: false })).toMatchObject({ code: 'INSUFFICIENT_CASH' });
  });

  it('threshold comes from CASH_OUT_APPROVAL_THRESHOLD, default 5000', () => {
    expect(cashOutApprovalThreshold({} as NodeJS.ProcessEnv)).toBe(5000);
    expect(cashOutApprovalThreshold({ CASH_OUT_APPROVAL_THRESHOLD: '2500' } as NodeJS.ProcessEnv)).toBe(2500);
    expect(cashOutApprovalThreshold({ CASH_OUT_APPROVAL_THRESHOLD: 'abc' } as NodeJS.ProcessEnv)).toBe(5000);
    expect(cashOutApprovalThreshold({ CASH_OUT_APPROVAL_THRESHOLD: '-1' } as NodeJS.ProcessEnv)).toBe(5000);
  });
});
