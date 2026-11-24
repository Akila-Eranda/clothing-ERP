/**
 * Selling ABOVE the maximum (MRP) price is a manager/admin override. Cashiers cannot do it at all (the price guard
 * refuses them). For an authorised override (Step 1B decision 4) the sale must carry a REASON, and an audit record
 * with user, reason and transaction details is written in the same transaction as the sale.
 *
 * This helper is pure so the rules are unit-tested; the wiring is in PosService.createSale.
 */

export const ABOVE_MAX_PRICE = 'ABOVE_MAX_PRICE';
export const PRICE_OVERRIDE_REASON_MAX = 300;

export type PriceOverrideLine = { variantId: string; unitPrice: number; limit: number; kind: string };

export function mrpOverrides(overrides: readonly PriceOverrideLine[]): PriceOverrideLine[] {
  return overrides.filter((o) => o.kind === ABOVE_MAX_PRICE);
}

/**
 * Message when an above-MRP override carries an unusable reason, else null. A reason is OPTIONAL (owner decision):
 * an authorised manager/admin may sell above MRP without being asked why; the override is still audited (user, lines,
 * totals) and a reason is stored when one is sent.
 */
export function priceOverrideReasonError(overrides: readonly PriceOverrideLine[], reason: string | null | undefined): string | null {
  if (!mrpOverrides(overrides).length) return null;
  const text = (reason ?? '').trim();
  if (text.length > PRICE_OVERRIDE_REASON_MAX) return `The price override reason is too long (max ${PRICE_OVERRIDE_REASON_MAX} characters).`;
  return null;
}

/** What is stored on the sale for each override: MRP overrides additionally carry who and why. */
export function annotateOverrides(
  overrides: readonly PriceOverrideLine[],
  userId: string,
  reason: string | null | undefined,
): Array<PriceOverrideLine & { overriddenBy?: string; reason?: string }> {
  const text = (reason ?? '').trim();
  return overrides.map((o) => (o.kind === ABOVE_MAX_PRICE ? { ...o, overriddenBy: userId, reason: text } : { ...o }));
}

export function buildMrpOverrideAudit(input: {
  tenantId: string;
  userId: string;
  saleId: string;
  invoiceNumber: string;
  branchId: string;
  total: number;
  reason: string;
  lines: readonly PriceOverrideLine[];
  productNames?: Record<string, string>;
}) {
  return {
    tenantId: input.tenantId,
    userId: input.userId,
    action: 'APPROVE',
    resource: 'SalePriceOverride',
    resourceId: input.saleId,
    newData: {
      kind: ABOVE_MAX_PRICE,
      invoiceNumber: input.invoiceNumber,
      branchId: input.branchId,
      saleTotal: input.total,
      reason: input.reason.trim(),
      lines: mrpOverrides(input.lines).map((l) => ({
        variantId: l.variantId,
        product: input.productNames?.[l.variantId] ?? null,
        unitPrice: l.unitPrice,
        maximumPrice: l.limit,
      })),
    },
  };
}
