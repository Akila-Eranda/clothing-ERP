export const EXPENSE_CATEGORIES = [
  'Rent',
  'Salary',
  'Electricity',
  'Transport',
  'Marketing',
  'Other Expenses',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const LEGACY_CATEGORY_ALIASES: Record<string, ExpenseCategory> = {
  Payroll: 'Salary',
  Utilities: 'Electricity',
  Logistics: 'Transport',
  Other: 'Other Expenses',
  Operations: 'Other Expenses',
  Assets: 'Other Expenses',
  Maintenance: 'Other Expenses',
};

export function normalizeExpenseCategory(value?: string | null): ExpenseCategory {
  if (!value) return 'Other Expenses';
  if ((EXPENSE_CATEGORIES as readonly string[]).includes(value)) {
    return value as ExpenseCategory;
  }
  return LEGACY_CATEGORY_ALIASES[value] ?? 'Other Expenses';
}
