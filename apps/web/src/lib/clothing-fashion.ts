/**
 * Clothing-only fashion config — presets & helpers.
 * Not applied to Grocery/Hardware/etc. Use only behind ShopType.CLOTHING / hangTags/collections gates.
 */

export type ClothingSizeGroup = {
  id: string;
  label: string;
  sizes: string[];
};

export type ClothingColorDef = {
  name: string;
  hex: string;
  code?: string;
};

/** Reusable size groups (config only — not DB enums). */
export const CLOTHING_SIZE_GROUPS: ClothingSizeGroup[] = [
  { id: 'mens', label: "Men's", sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { id: 'womens', label: "Women's", sizes: ['XS', 'S', 'M', 'L', 'XL'] },
  { id: 'kids', label: 'Kids', sizes: ['2Y', '4Y', '6Y', '8Y', '10Y', '12Y'] },
  { id: 'shoes', label: 'Shoes', sizes: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44'] },
  { id: 'onesize', label: 'One Size', sizes: ['OS'] },
];

export const CLOTHING_SEASONS = [
  'Spring',
  'Summer',
  'Autumn',
  'Winter',
  'Festive',
  'All Season',
  'Clearance',
] as const;

export const CLOTHING_COLORS: ClothingColorDef[] = [
  { name: 'Black', hex: '#111827', code: 'BLK' },
  { name: 'White', hex: '#F9FAFB', code: 'WHT' },
  { name: 'Navy', hex: '#1E3A5F', code: 'NVY' },
  { name: 'Red', hex: '#DC2626', code: 'RED' },
  { name: 'Green', hex: '#16A34A', code: 'GRN' },
  { name: 'Grey', hex: '#6B7280', code: 'GRY' },
  { name: 'Beige', hex: '#D4C4A8', code: 'BGE' },
  { name: 'Pink', hex: '#EC4899', code: 'PNK' },
  { name: 'Maroon', hex: '#7F1D1D', code: 'MRN' },
  { name: 'Blue', hex: '#2563EB', code: 'BLU' },
];

export const CLOTHING_CAMPAIGN_KINDS = [
  { value: 'STANDARD', label: 'Standard promo' },
  { value: 'MARKDOWN', label: 'Markdown' },
  { value: 'CLEARANCE', label: 'Clearance' },
  { value: 'FINAL_SALE', label: 'Final sale' },
] as const;

export function clothingColorHex(name?: string | null): string | undefined {
  if (!name) return undefined;
  const hit = CLOTHING_COLORS.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  return hit?.hex;
}

export function sellThroughPct(unitsSold: number, remainingStock: number): number {
  const sold = Math.max(0, Number(unitsSold) || 0);
  const stock = Math.max(0, Number(remainingStock) || 0);
  const denom = sold + stock;
  if (denom <= 0) return 0;
  return Math.min(100, Math.round((sold / denom) * 1000) / 10);
}
