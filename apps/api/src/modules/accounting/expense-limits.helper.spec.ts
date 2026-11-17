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

  it('lets a cashier record up to LKR 5,000 and refuses more', () => {
    expect(DEFAULT_CASHIER_EXPENSE_LIMIT).toBe(5000);
    expect(expenseAuthorityError(1500, cashier, {})).toBeNull();
    expect(expenseAuthorityError(5000, cashier, {})).toBeNull();
    expect(expenseAuthorityError(5000.01, cashier, {})).toMatch(/need a manager/);
    expect(expenseAuthorityError(9_999_999, cashier, {})).toMatch(/need a manager/);
  });

  it('does not cap managers, accountants or shop admins (below the hard maximum)', () => {
    for (const roles of [manager, [RoleType.ACCOUNTANT], [RoleType.TENANT_ADMIN]]) {
      expect(expenseAuthorityError(250_000, roles, {})).toBeNull();
    }
    expect(expenseAuthorityError(MAX_EXPENSE_AMOUNT + 1, manager, {})).toMatch(/too large/);
  });

  it('honours a shop-specific cashier limit', () => {
    expect(cashierExpenseLimit({ pos: { cashierExpenseLimit: 2000 } })).toBe(2000);
    expect(expenseAuthorityError(2500, cashier, { pos: { cashierExpenseLimit: 2000 } })).toMatch(/LKR 2,000/);
    expect(cashierExpenseLimit({ pos: { cashierExpenseLimit: 'x' } })).toBe(5000);
  });

  it('treats a user with no roles like a cashier', () => {
    expect(expenseAuthorityError(6000, [], {})).toMatch(/need a manager/);
    expect(expenseAuthorityError(6000, undefined, {})).toMatch(/need a manager/);
  });

  it('reports the HTTP status explicitly (400 invalid amount, 403 needs a manager)', () => {
    expect(expenseRefusal(0, cashier, {})?.status).toBe(400);
    expect(expenseRefusal(MAX_EXPENSE_AMOUNT + 1, manager, {})?.status).toBe(400);
    expect(expenseRefusal(6000, cashier, {})?.status).toBe(403);
    expect(expenseRefusal(6000, manager, {})).toBeNull();
  });
});
