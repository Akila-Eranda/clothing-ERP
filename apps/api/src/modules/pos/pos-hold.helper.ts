/**
 * Held bills (audit P-F9 / P-F10): payload shape check and the ownership filter shared by
 * list / delete / resume-at-checkout.
 */

/** Upper bound on lines in one hold (each catalog line writes a stock reservation). */
const MAX_HOLD_LINES = 1000;

/**
 * Minimal check of HoldBillDto.data (the web cart snapshot: items, customer, discount, notes, …).
 * Only `items` is interpreted by the API (it reserves stock), so only `items` is checked:
 * an array of objects whose quantity is a finite number > 0 and whose variantId, when present, is a string.
 * Every other key is kept as sent so existing front-end payloads stay valid.
 * Returns an error message or null.
 */
export function holdBillDataRejection(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Held bill data must be an object';
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return 'Held bill data.items must be an array';
  if (items.length > MAX_HOLD_LINES) return `A held bill can have at most ${MAX_HOLD_LINES} lines`;
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i] as { variantId?: unknown; quantity?: unknown } | null;
    if (!it || typeof it !== 'object' || Array.isArray(it)) return `Held bill line ${i + 1} must be an object`;
    if (it.variantId != null && typeof it.variantId !== 'string') return `Held bill line ${i + 1}: variantId must be a string`;
    if (typeof it.quantity !== 'number' || !Number.isFinite(it.quantity) || it.quantity <= 0) {
      return `Held bill line ${i + 1}: quantity must be a number greater than 0`;
    }
  }
  return null;
}

/**
 * Where-clause for a held bill the caller may use: always this tenant and branch; cashiers only their own
 * holds, managers / admins (canViewAllPosSales) any hold of the branch — the same scope as GET /pos/hold.
 */
export function heldBillScopeWhere(
  id: string,
  tenantId: string,
  branchId: string,
  opts?: { cashierId?: string; scopeAll?: boolean },
): { id: string; tenantId: string; branchId: string; cashierId?: string } {
  return {
    id,
    tenantId,
    branchId,
    ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
  };
}
