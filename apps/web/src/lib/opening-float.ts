/**
 * Client-side check of the opening float typed in the POS shift gate (same rules as the API:
 * apps/api/src/shared/opening-float.helper.ts). The API is the authority; this only stops an obviously wrong
 * figure before it is sent and tells the cashier the limit.
 */
export function openingFloatProblem(raw: string, max: number | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return "Enter the opening cash amount";
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return "Enter the amount as a number with at most 2 decimals (e.g. 5000 or 5000.50)";
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return "Enter the opening cash amount";
  if (max != null && Number.isFinite(max) && amount > max) {
    return `LKR ${amount.toLocaleString("en-US")} is above the maximum opening float of LKR ${max.toLocaleString("en-US")}. Count the drawer again, or ask an admin to change the limit (Settings → POS).`;
  }
  return null;
}
