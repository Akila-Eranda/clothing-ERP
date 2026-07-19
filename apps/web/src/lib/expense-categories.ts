export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salary",
  "Electricity",
  "Transport",
  "Marketing",
  "Other Expenses",
] as const;

export const normalizeExpenseCategory = (value?: string | null): string => {
  const aliases: Record<string, string> = {
    Payroll: "Salary",
    Utilities: "Electricity",
    Logistics: "Transport",
    Other: "Other Expenses",
    Operations: "Other Expenses",
    Assets: "Other Expenses",
    Maintenance: "Other Expenses",
  };
  return value && EXPENSE_CATEGORIES.includes(value as (typeof EXPENSE_CATEGORIES)[number])
    ? value
    : aliases[value ?? ""] ?? "Other Expenses";
};
