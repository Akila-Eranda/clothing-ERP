/**
 * Bill-only ("custom" / Demo Product) lines at the POS.
 *
 * The API (PosService.createSale) treats them as non-stock lines and refuses them unless the ACTING cashier
 * (the PIN-unlocked operator when there is one, otherwise the signed-in user) is a super admin, tenant admin
 * or branch manager - the catalog price guard does not apply to custom lines, so a plain cashier could
 * otherwise sell at any price. Reload / recharge lines (they carry reloadType) are exempt.
 * This mirrors that rule so the screen tells the cashier BEFORE checkout instead of after a refused sale.
 * The API stays the authority; this is only early feedback.
 */

export const BILL_ONLY_ROLES = ["SUPER_ADMIN", "TENANT_ADMIN", "BRANCH_MANAGER", "CASHIER"] as const;

export const BILL_ONLY_MANAGER_MESSAGE =
  "Bill-only / Demo items need a cashier or manager. Unlock the POS with a cashier / manager PIN (or sign in) and try again.";

function normalizeRoleKey(role: unknown): string {
  return String(role ?? "").trim().toUpperCase().replace(/-/g, "_");
}

/** Roles carried in the access token (used only for early feedback; the API enforces). */
export function rolesFromToken(token: string | null | undefined): string[] {
  try {
    if (!token) return [];
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return Array.isArray(payload.roles) ? payload.roles.filter((r: unknown): r is string => typeof r === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Can the acting operator sell bill-only lines?
 * `pinCashierRole`: role of the PIN-unlocked operator, if any - when set it decides (the API attributes the sale to it).
 * Otherwise any of the signed-in user's roles (token roles, plus the single role kept in the store) may qualify.
 */
export function canSellBillOnlyItems(opts: {
  pinCashierRole?: string | null;
  tokenRoles?: readonly string[] | null;
  userRole?: string | null;
}): boolean {
  const allowed = new Set<string>(BILL_ONLY_ROLES);
  if (opts.pinCashierRole) return allowed.has(normalizeRoleKey(opts.pinCashierRole));
  const roles = [...(opts.tokenRoles ?? []), opts.userRole ?? ""].map(normalizeRoleKey).filter(Boolean);
  return roles.some((r) => allowed.has(r));
}

type CartLike = { variantId?: string | null; isCustom?: boolean | null; reloadType?: string | null };

/** Same rule as the API's customLineNeedsManager: a bill-only line that is not a reload / recharge line. */
export function cartHasBillOnlyItems(items: readonly CartLike[]): boolean {
  return items.some((i) => {
    const id = (i.variantId ?? "").trim();
    const isCustom = !!i.isCustom || !id || id.startsWith("custom-");
    return isCustom && !i.reloadType;
  });
}
