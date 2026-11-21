/**
 * Quick GRN line cost (Step 1B decision 1).
 *
 * A Cashier receives stock at the product's EXISTING cost and may not change it; only inventory / finance roles can.
 * The screen cannot know who is really acting (a PIN-switched cashier acts on a manager's terminal login), so the rule
 * is value-based and the API is the authority:
 *   - the line shows the catalogue cost by default;
 *   - `unitCost` is sent ONLY when the typed cost differs from the catalogue cost (a real edit). Untouched lines send
 *     nothing and the server uses the catalogue cost itself;
 *   - an edit by someone without the role is refused by the API (403) with a clear message.
 */
const EPSILON = 0.005;

/** The cost a line starts with: the catalogue cost, else the last buying price, else 0. */
export function defaultGrnLineCost(p: { costPrice?: number | null; lastBuyingPrice?: number | null }): number {
  const catalogue = Number(p.costPrice ?? 0);
  if (catalogue > 0) return catalogue;
  const last = Number(p.lastBuyingPrice ?? 0);
  return last > 0 ? last : 0;
}

/** True when the typed cost is a change from the product's existing cost. */
export function isGrnCostEdit(unitCost: number, catalogueCost: number | null | undefined): boolean {
  return Math.abs(unitCost - Number(catalogueCost ?? 0)) > EPSILON;
}

/** The `unitCost` field of the request: present only for a real edit. */
export function grnLineCostPayload(unitCost: number, catalogueCost: number | null | undefined): { unitCost?: number } {
  return isGrnCostEdit(unitCost, catalogueCost) ? { unitCost } : {};
}
