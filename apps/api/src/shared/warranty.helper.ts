/** Product has warranty coverage when warrantyMonths is set and > 0. */
export function isWarrantyEligible(warrantyMonths: number | null | undefined): boolean {
  return warrantyMonths != null && warrantyMonths > 0;
}

export function warrantyExpiresAt(purchaseDate: Date, warrantyMonths: number): Date {
  const d = new Date(purchaseDate);
  d.setMonth(d.getMonth() + warrantyMonths);
  return d;
}

export function isWithinWarrantyPeriod(
  purchaseDate: Date,
  warrantyMonths: number,
  asOf: Date = new Date(),
): boolean {
  return asOf <= warrantyExpiresAt(purchaseDate, warrantyMonths);
}
