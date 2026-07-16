/** Build a readable SKU stem from product name + variant labels. */
export function genSku(name: string, combo: string[]): string {
  const b = name ? name.replace(/\s+/g, "").slice(0, 3).toUpperCase() : "PRD";
  // Keep enough of each label so "Variant 1" / "Variant 2" stay distinct (not both "VAR").
  const parts = combo
    .map((v) => v.replace(/\s+/g, "").toUpperCase().slice(0, 12))
    .filter(Boolean);
  return [b, ...parts].join("-") || `PRD-${Date.now().toString(36).toUpperCase()}`;
}

/** Ensure SKU is unique within the current product's variant list. */
export function uniqueSku(base: string, used: Iterable<string>): string {
  const set = used instanceof Set ? used : new Set(used);
  const stem = (base || "VAR").trim() || "VAR";
  if (!set.has(stem)) return stem;
  let i = 2;
  while (set.has(`${stem}-${i}`)) i += 1;
  return `${stem}-${i}`;
}

/** Deduplicate SKUs in a payload (mutates nothing — returns new array). */
export function ensureUniqueVariantSkus<T extends { sku?: string }>(rows: T[]): T[] {
  const used = new Set<string>();
  return rows.map((row) => {
    const next = uniqueSku(row.sku || "VAR", used);
    used.add(next);
    return { ...row, sku: next };
  });
}
