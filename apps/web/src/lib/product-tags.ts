const SYSTEM_PREFIXES = ["unit:", "exp:", "batch:"] as const;

export function isSystemProductTag(tag: string): boolean {
  return SYSTEM_PREFIXES.some((p) => tag.startsWith(p));
}

export function splitProductTags(tags: string[] = []) {
  const systemTags = tags.filter(isSystemProductTag);
  const userTags = tags.filter((t) => !isSystemProductTag(t));
  return { userTags, systemTags };
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
}): string[] {
  const pending = opts.tagInput?.trim().replace(/,$/, "") ?? "";
  const userTags = [...opts.tags.filter((t) => !isSystemProductTag(t))];
  if (pending && !userTags.includes(pending)) userTags.push(pending);

  const meta: string[] = [];
  if (opts.showUnit && opts.unit) meta.push(`unit:${opts.unit}`);
  if (opts.showExpiry && opts.expiryDate) meta.push(`exp:${opts.expiryDate}`);
  if (opts.showBatch && opts.batchNumber) meta.push(`batch:${opts.batchNumber}`);

  if (meta.length > 0) return [...userTags, ...meta];
  if (opts.preserveSystemTags?.length) return [...userTags, ...opts.preserveSystemTags];
  return userTags;
}
