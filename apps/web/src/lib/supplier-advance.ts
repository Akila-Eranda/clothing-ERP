/**
 * Supplier advance (overpayment kept on account) on the payment screen. The API is the authority; these
 * helpers only show the split before the user confirms (same rule as apps/api/.../supplier-advance.helper.ts).
 */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** How a payment of `amount` against `due` selected payables splits. `excess` is what would become advance. */
export function paymentSplit(amount: number, due: number): { toBills: number; excess: number } {
  const pay = r2(Number.isFinite(amount) && amount > 0 ? amount : 0);
  const owed = r2(Math.max(0, due));
  if (pay <= owed + 0.01) return { toBills: Math.min(pay, owed), excess: 0 };
  return { toBills: owed, excess: r2(pay - owed) };
}

/** Default amount to apply: all the advance, but never more than the bills still owe. */
export function defaultAdvanceToApply(advance: number, selectedDue: number): number {
  return r2(Math.max(0, Math.min(advance, selectedDue)));
}

/** Why the "apply advance" amount cannot be sent, or null. */
export function applyAdvanceProblem(amount: number, advance: number, selectedDue: number, selectedCount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter the amount of advance to apply";
  if (Math.round(amount * 100) / 100 !== amount) return "At most 2 decimal places";
  if (selectedCount === 0) return "Select at least one bill";
  if (amount > advance + 0.01) return `Only LKR ${advance.toFixed(2)} of advance is available`;
  if (amount > selectedDue + 0.01) return `The selected bills only owe LKR ${selectedDue.toFixed(2)}`;
  return null;
}
