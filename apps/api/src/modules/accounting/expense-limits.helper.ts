import { hasFinancialAuthority } from '@/shared/security/financial-authority';

/** Owner rule (Nov 2026): cashiers may record drawer expenses up to LKR 5,000 each. */
export const DEFAULT_CASHIER_EXPENSE_LIMIT = 5000;

/** Hard upper bound for any single expense (fat-finger guard). */
export const MAX_EXPENSE_AMOUNT = 100_000_000;

export function cashierExpenseLimit(settings: unknown): number {
  const s = (settings ?? {}) as { pos?: { cashierExpenseLimit?: unknown } };
  const v = Number(s.pos?.cashierExpenseLimit);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_CASHIER_EXPENSE_LIMIT;
}

export interface ExpenseRefusal {
  /** 400 = the amount itself is invalid; 403 = valid, but needs someone with financial authority. */
  status: 400 | 403;
  message: string;
}

/**
 * Returns null when the actor may record this expense, otherwise why not (with the HTTP status).
 * Managers / accountants / shop admins (financial authority) are not capped; everyone else is.
 */
export function expenseRefusal(amount: number, actorRoles: string[] | undefined, settings: unknown): ExpenseRefusal | null {
  if (!(amount > 0)) return { status: 400, message: 'Expense amount must be greater than zero' };
  if (amount > MAX_EXPENSE_AMOUNT) return { status: 400, message: 'Expense amount is too large' };
  if (hasFinancialAuthority(actorRoles)) return null;
  const limit = cashierExpenseLimit(settings);
  return amount > limit ? { status: 403, message: `Expenses above LKR ${limit.toLocaleString('en-LK')} need a manager` } : null;
}

/** Message-only form of {@link expenseRefusal}. */
export function expenseAuthorityError(amount: number, actorRoles: string[] | undefined, settings: unknown): string | null {
  return expenseRefusal(amount, actorRoles, settings)?.message ?? null;
}
