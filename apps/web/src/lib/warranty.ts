/** Product is warranty-covered only when warranty months > 0 (null/0 = no warranty). */
export function productHasWarranty(warrantyMonths?: number | null): boolean {
  return warrantyMonths != null && warrantyMonths > 0;
}

export function warrantyPeriodLabel(months?: number | null): string {
  if (!productHasWarranty(months)) return "No warranty";
  return `${months} month${months === 1 ? "" : "s"}`;
}
