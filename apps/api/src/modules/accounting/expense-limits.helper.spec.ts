import { RoleType } from '@prisma/client';
import { cashierExpenseLimit, DEFAULT_CASHIER_EXPENSE_LIMIT, expenseAuthorityError, expenseRefusal, MAX_EXPENSE_AMOUNT } from './expense-limits.helper';

describe('expense limits (F-04)', () => {
  const cashier = [RoleType.CASHIER];
  const manager = [RoleType.BRANCH_MANAGER];

  it('rejects zero and negative amounts for everyone', () => {
    for (const roles of [cashier, manager, [RoleType.TENANT_ADMIN]]) {
      expect(expenseAuthorityError(0, roles, {})).toMatch(/greater than zero/);
      expect(expenseAuthorityError(-50, roles, {})).toMatch(/greater than zero/);
    }
  });

  it('does not cap cashiers either (owner decision: no manager approval for expenses); only the hard maximum applies', () => {
    expect(DEFAULT_CASHIER_EXPENSE_LIMIT).toBe(5000);
    expect(expenseAuthorityError(5000.01, cashier, {})).toBeNull();
    expect(expenseAuthorityError(250_000, cashier, {})).toBeNull();
    expect(expenseAuthorityError(MAX_EXPENSE_AMOUNT + 1, cashier, {})).toMatch(/too large/);
  });

  it('does not cap managers, accountants or shop admins (below the hard maximum)', () => {
    for (const roles of [manager, [RoleType.ACCOUNTANT], [RoleType.TENANT_ADMIN]]) {
      expect(expenseAuthorityError(250_000, roles, {})).toBeNull();
    }
    expect(expenseAuthorityError(MAX_EXPENSE_AMOUNT + 1, manager, {})).toMatch(/too large/);
  });

  it('the shop-specific cashier limit setting is still readable but no longer enforced', () => {
    expect(cashierExpenseLimit({ pos: { cashierExpenseLimit: 2000 } })).toBe(2000);
    expect(expenseAuthorityError(2500, cashier, { pos: { cashierExpenseLimit: 2000 } })).toBeNull();
    expect(cashierExpenseLimit({ pos: { cashierExpenseLimit: 'x' } })).toBe(5000);
  });

  it('reports 400 for an invalid amount and null (allowed) otherwise', () => {
    expect(expenseRefusal(0, cashier, {})?.status).toBe(400);
    expect(expenseRefusal(MAX_EXPENSE_AMOUNT + 1, manager, {})?.status).toBe(400);
    expect(expenseRefusal(6000, cashier, {})).toBeNull();
    expect(expenseRefusal(6000, manager, {})).toBeNull();
  });
});
