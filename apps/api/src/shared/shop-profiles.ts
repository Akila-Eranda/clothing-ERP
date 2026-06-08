/** Shop vertical profiles — shared config for CLOTHING, GROCERY, HARDWARE, AGRICULTURE */

export enum ShopType {
  CLOTHING = 'CLOTHING',
  GROCERY = 'GROCERY',
  HARDWARE = 'HARDWARE',
  AGRICULTURE = 'AGRICULTURE',
}

export interface VariantAttributeDef {
  name: string;
  presets: string[];
  mapsTo?: 'size' | 'color' | 'material' | 'style';
}

export interface ShopProfile {
  type: ShopType;
  label: string;
  labelSi: string;
  emoji: string;
  description: string;
  defaultCategories: string[];
  variantAttributes: VariantAttributeDef[];
  defaultUnit: string;
  units: string[];
  modules: {
    brands: boolean;
    collections: boolean;
    hangTags: boolean;
    variants: boolean;
  };
  labelTemplates: Array<'sticker' | 'hangtag' | 'shelf'>;
}

export const SHOP_PROFILES: Record<ShopType, ShopProfile> = {
  [ShopType.CLOTHING]: {
    type: ShopType.CLOTHING,
    label: 'Clothing Shop',
    labelSi: 'ඇඳුම් කඩය',
    emoji: '👕',
    description: 'Apparel, fashion, boutiques — sizes, colors, hang tags',
    defaultCategories: ["Men's Wear", "Women's Wear", "Kids' Wear", 'Accessories', 'Footwear'],
    variantAttributes: [
      { name: 'Size', presets: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], mapsTo: 'size' },
      { name: 'Color', presets: ['Black', 'White', 'Navy', 'Red', 'Blue', 'Green'], mapsTo: 'color' },
    ],
    defaultUnit: 'pcs',
    units: ['pcs'],
    modules: { brands: true, collections: true, hangTags: true, variants: true },
    labelTemplates: ['sticker', 'hangtag'],
  },
  [ShopType.GROCERY]: {
    type: ShopType.GROCERY,
    label: 'Grocery Shop',
    labelSi: 'සිල්ලර කඩය',
    emoji: '🛒',
    description: 'Supermarket, mini-mart — weight, volume, expiry tracking',
    defaultCategories: ['Fresh Produce', 'Dairy & Eggs', 'Beverages', 'Snacks', 'Frozen Foods', 'Household'],
    variantAttributes: [
      { name: 'Weight', presets: ['250g', '500g', '1kg', '2kg', '5kg'], mapsTo: 'size' },
      { name: 'Pack', presets: ['Single', '6-Pack', '12-Pack', 'Carton'], mapsTo: 'style' },
    ],
    defaultUnit: 'kg',
    units: ['pcs', 'kg', 'g', 'L', 'ml', 'pack'],
    modules: { brands: true, collections: false, hangTags: false, variants: true },
    labelTemplates: ['sticker', 'shelf'],
  },
  [ShopType.HARDWARE]: {
    type: ShopType.HARDWARE,
    label: 'Hardware Shop',
    labelSi: 'Hardware කඩය',
    emoji: '🔧',
    description: 'Tools, plumbing, electrical — specs, SKU, bulk items',
    defaultCategories: ['Tools', 'Electrical', 'Plumbing', 'Paint', 'Building Materials', 'Safety Gear'],
    variantAttributes: [
      { name: 'Size', presets: ['Small', 'Medium', 'Large', '10mm', '12mm', '20mm'], mapsTo: 'size' },
      { name: 'Material', presets: ['Steel', 'Brass', 'PVC', 'Copper', 'Aluminium'], mapsTo: 'material' },
    ],
    defaultUnit: 'pcs',
    units: ['pcs', 'piece', 'kg', 'feet', 'meter', 'box', 'set', 'roll'],
    modules: { brands: true, collections: false, hangTags: false, variants: true },
    labelTemplates: ['sticker', 'shelf'],
  },
  [ShopType.AGRICULTURE]: {
    type: ShopType.AGRICULTURE,
    label: 'Agriculture Shop',
    labelSi: 'කෘෂිකර්ම කඩය',
    emoji: '🌾',
    description: 'Seeds, fertilizer, equipment — grade, batch, season',
    defaultCategories: ['Seeds', 'Fertilizer', 'Pesticides', 'Equipment', 'Animal Feed', 'Irrigation'],
    variantAttributes: [
      { name: 'Weight', presets: ['1kg', '5kg', '10kg', '25kg', '50kg'], mapsTo: 'size' },
      { name: 'Grade', presets: ['Grade A', 'Grade B', 'Premium', 'Standard'], mapsTo: 'style' },
    ],
    defaultUnit: 'kg',
    units: ['kg', 'bag', 'pcs', 'liter', 'acre'],
    modules: { brands: true, collections: false, hangTags: false, variants: true },
    labelTemplates: ['sticker', 'shelf'],
  },
};

export const SHOP_TYPE_LIST = Object.values(SHOP_PROFILES);

export function getShopProfile(type: ShopType | string | null | undefined): ShopProfile {
  const key = (type ?? ShopType.CLOTHING) as ShopType;
  return SHOP_PROFILES[key] ?? SHOP_PROFILES[ShopType.CLOTHING];
}

export function slugifyCategory(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function defaultVariantAttributes(type: ShopType | string | null | undefined): VariantAttributeDef[] {
  return getShopProfile(type).variantAttributes.map((a) => ({ ...a, presets: [...a.presets] }));
}
