const SYSTEM_PREFIXES = [
  "unit:",
  "exp:",
  "batch:",
  "ptype:",
  "barmode:",
  "wholesale:",
  "opstock:",
  "reorder:",
  "minstock:",
  "maxstock:",
  "wh:",
  "allowneg:",
  "decimal:",
  "wscale:",
  "defsup:",
  "sku:",
  "smeta:",
] as const;

export type GroceryProductType = "STANDARD" | "VARIANT" | "WEIGHTED";
export type BarcodeMode = "SHARED" | "UNIQUE";

export interface GroceryMeta {
  productType: GroceryProductType;
  barcodeMode: BarcodeMode;
  wholesalePrice: string;
  openingStock: string;
  reorderLevel: string;
  minStock: string;
  maxStock: string;
  warehouseId: string;
  allowNegative: boolean;
  allowDecimalSelling: boolean;
  weightScaleReady: boolean;
  defaultSupplierId: string;
  /** Optional display SKU hint (product SKU is server-generated). */
  skuHint: string;
  /** Per-supplier UI extras keyed by supplierId */
  supplierMeta: Record<string, { buyingPrice: string; leadTime: string; moq: string; active: boolean }>;
}

export const DEFAULT_GROCERY_META: GroceryMeta = {
  productType: "STANDARD",
  barcodeMode: "UNIQUE",
  wholesalePrice: "",
  openingStock: "",
  reorderLevel: "",
  minStock: "",
  maxStock: "",
  warehouseId: "",
  allowNegative: false,
  allowDecimalSelling: false,
  weightScaleReady: false,
  defaultSupplierId: "",
  skuHint: "",
  supplierMeta: {},
};

export function isSystemProductTag(tag: string): boolean {
  return SYSTEM_PREFIXES.some((p) => tag.startsWith(p));
}

export function splitProductTags(tags: string[] = []) {
  const systemTags = tags.filter(isSystemProductTag);
  const userTags = tags.filter((t) => !isSystemProductTag(t));
  return { userTags, systemTags };
}

function tagValue(tags: string[], prefix: string): string | undefined {
  const hit = tags.find((t) => t.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

export function parseGroceryMeta(tags: string[] = []): GroceryMeta {
  const meta = { ...DEFAULT_GROCERY_META, supplierMeta: {} as GroceryMeta["supplierMeta"] };
  const ptype = tagValue(tags, "ptype:");
  if (ptype === "STANDARD" || ptype === "VARIANT" || ptype === "WEIGHTED") meta.productType = ptype;
  const barmode = tagValue(tags, "barmode:");
  if (barmode === "SHARED" || barmode === "UNIQUE") meta.barcodeMode = barmode;
  meta.wholesalePrice = tagValue(tags, "wholesale:") ?? "";
  meta.openingStock = tagValue(tags, "opstock:") ?? "";
  meta.reorderLevel = tagValue(tags, "reorder:") ?? "";
  meta.minStock = tagValue(tags, "minstock:") ?? "";
  meta.maxStock = tagValue(tags, "maxstock:") ?? "";
  meta.warehouseId = tagValue(tags, "wh:") ?? "";
  meta.allowNegative = tagValue(tags, "allowneg:") === "1";
  meta.allowDecimalSelling = tagValue(tags, "decimal:") === "1";
  meta.weightScaleReady = tagValue(tags, "wscale:") === "1";
  meta.defaultSupplierId = tagValue(tags, "defsup:") ?? "";
  meta.skuHint = tagValue(tags, "sku:") ?? "";

  for (const t of tags) {
    if (!t.startsWith("smeta:")) continue;
    // smeta:{supplierId}|{buy}|{lead}|{moq}|{1|0}
    const raw = t.slice(6);
    const [sid, buy = "", lead = "", moq = "", active = "1"] = raw.split("|");
    if (!sid) continue;
    meta.supplierMeta[sid] = {
      buyingPrice: buy,
      leadTime: lead,
      moq,
      active: active !== "0",
    };
  }
  return meta;
}

export function buildGroceryMetaTags(meta: GroceryMeta): string[] {
  const out: string[] = [
    `ptype:${meta.productType}`,
    `barmode:${meta.barcodeMode}`,
  ];
  if (meta.wholesalePrice.trim()) out.push(`wholesale:${meta.wholesalePrice.trim()}`);
  if (meta.openingStock.trim()) out.push(`opstock:${meta.openingStock.trim()}`);
  if (meta.reorderLevel.trim()) out.push(`reorder:${meta.reorderLevel.trim()}`);
  if (meta.minStock.trim()) out.push(`minstock:${meta.minStock.trim()}`);
  if (meta.maxStock.trim()) out.push(`maxstock:${meta.maxStock.trim()}`);
  if (meta.warehouseId.trim()) out.push(`wh:${meta.warehouseId.trim()}`);
  if (meta.allowNegative) out.push("allowneg:1");
  if (meta.allowDecimalSelling) out.push("decimal:1");
  if (meta.weightScaleReady) out.push("wscale:1");
  if (meta.defaultSupplierId.trim()) out.push(`defsup:${meta.defaultSupplierId.trim()}`);
  if (meta.skuHint.trim()) out.push(`sku:${meta.skuHint.trim()}`);
  for (const [sid, m] of Object.entries(meta.supplierMeta)) {
    out.push(
      `smeta:${sid}|${m.buyingPrice || ""}|${m.leadTime || ""}|${m.moq || ""}|${m.active ? "1" : "0"}`,
    );
  }
  return out;
}

/** Merge user tags + pending input; optionally append unit/exp/batch meta tags. */
export function buildProductTags(opts: {
  tags: string[];
  tagInput?: string;
  unit?: string;
  expiryDate?: string;
  batchNumber?: string;
  showUnit?: boolean;
  showExpiry?: boolean;
  showBatch?: boolean;
  /** Preserve meta tags from existing product when edit form has no unit fields. */
  preserveSystemTags?: string[];
  groceryMeta?: GroceryMeta;
}): string[] {
  const pending = opts.tagInput?.trim().replace(/,$/, "") ?? "";
  const userTags = [...opts.tags.filter((t) => !isSystemProductTag(t))];
  if (pending && !userTags.includes(pending)) userTags.push(pending);

  const meta: string[] = [];
  if (opts.showUnit && opts.unit) meta.push(`unit:${opts.unit}`);
  if (opts.showExpiry && opts.expiryDate) meta.push(`exp:${opts.expiryDate}`);
  if (opts.showBatch && opts.batchNumber) meta.push(`batch:${opts.batchNumber}`);
  if (opts.groceryMeta) meta.push(...buildGroceryMetaTags(opts.groceryMeta));

  if (meta.length > 0) return [...userTags, ...meta];
  if (opts.preserveSystemTags?.length) return [...userTags, ...opts.preserveSystemTags];
  return userTags;
}
