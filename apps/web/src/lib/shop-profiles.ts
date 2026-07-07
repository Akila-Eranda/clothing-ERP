/** Shop vertical profiles — frontend mirror of API shared config */

export enum ShopType {
  CLOTHING = 'CLOTHING',
  GROCERY = 'GROCERY',
  HARDWARE = 'HARDWARE',
  AGRICULTURE = 'AGRICULTURE',
  SPARE_PARTS = 'SPARE_PARTS',
  TIRE_SHOP = 'TIRE_SHOP',
  GENERAL = 'GENERAL',
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
    returns: boolean;
    promotions: boolean;
    loyalty: boolean;
    expiry: boolean;
    batch: boolean;
    vehicles: boolean;
    warranty: boolean;
    quotations: boolean;
    workshop: boolean;
    appointments: boolean;
  };
  labelTemplates: Array<'sticker' | 'hangtag' | 'shelf'>;
}

const OFF = { vehicles: false, warranty: false, quotations: false, workshop: false, appointments: false } as const;

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
    modules: { brands: true, collections: true, hangTags: true, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: false, ...OFF },
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
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: false, expiry: true, batch: true, ...OFF },
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
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: false, loyalty: false, expiry: false, batch: false, vehicles: false, warranty: false, quotations: true, workshop: false, appointments: false },
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
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: false, loyalty: false, expiry: true, batch: true, ...OFF },
    labelTemplates: ['sticker', 'shelf'],
  },
  [ShopType.SPARE_PARTS]: {
    type: ShopType.SPARE_PARTS,
    label: 'Spare Parts Shop',
    labelSi: 'Spare Parts කඩය',
    emoji: '🚗',
    description: 'Auto spare parts — vehicle compatibility, warranty, quotations',
    defaultCategories: ['Engine Parts', 'Brakes & Suspension', 'Filters', 'Electrical', 'Body Parts', 'Lubricants', 'Accessories'],
    variantAttributes: [
      { name: 'OEM No', presets: [], mapsTo: 'size' },
      { name: 'Part Type', presets: ['OEM', 'Aftermarket', 'Genuine'], mapsTo: 'style' },
    ],
    defaultUnit: 'pcs',
    units: ['pcs', 'set', 'pair', 'box', 'liter'],
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: true, vehicles: true, warranty: true, quotations: true, workshop: false, appointments: false },
    labelTemplates: ['sticker', 'shelf'],
  },
  [ShopType.TIRE_SHOP]: {
    type: ShopType.TIRE_SHOP,
    label: 'Tyre Shop',
    labelSi: 'Tyre Shop',
    emoji: '🛞',
    description: 'Tyres & rims — fitment, workshop services, job cards, fleet',
    defaultCategories: ['Passenger Tyres', 'SUV & 4x4 Tyres', 'Commercial Tyres', 'Rims & Wheels', 'Accessories'],
    variantAttributes: [
      { name: 'Tyre Size', presets: ['205/55R16', '195/65R15', '215/60R16', '265/65R17'], mapsTo: 'size' },
      { name: 'Season', presets: ['All Season', 'Summer', 'Winter'], mapsTo: 'style' },
      { name: 'Tube Type', presets: ['Tubeless', 'Tube'], mapsTo: 'material' },
    ],
    defaultUnit: 'pcs',
    units: ['pcs', 'set', 'pair', 'box'],
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: true, vehicles: true, warranty: true, quotations: true, workshop: true, appointments: true },
    labelTemplates: ['sticker', 'shelf'],
  },
  [ShopType.GENERAL]: {
    type: ShopType.GENERAL,
    label: 'General Shop',
    labelSi: 'සාමාන්‍ය කඩය',
    emoji: '🏪',
    description: 'General retail — mixed products, simple variants, POS & inventory',
    defaultCategories: ['General Merchandise', 'Electronics', 'Home & Living', 'Health & Beauty', 'Stationery', 'Other'],
    variantAttributes: [
      { name: 'Size', presets: ['Small', 'Medium', 'Large', 'Standard'], mapsTo: 'size' },
      { name: 'Variant', presets: ['Standard', 'Premium', 'Economy'], mapsTo: 'style' },
    ],
    defaultUnit: 'pcs',
    units: ['pcs', 'set', 'pair', 'box', 'kg', 'pack'],
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: false, vehicles: false, warranty: false, quotations: true, workshop: false, appointments: false },
    labelTemplates: ['sticker', 'shelf'],
  },
};

export const SHOP_TYPE_LIST = Object.values(SHOP_PROFILES);

export function getShopProfile(type: ShopType | string | null | undefined): ShopProfile {
  const key = (type ?? ShopType.CLOTHING) as ShopType;
  return SHOP_PROFILES[key] ?? SHOP_PROFILES[ShopType.CLOTHING];
}

export function defaultVariantAttributes(type: ShopType | string | null | undefined) {
  return getShopProfile(type).variantAttributes.map((a) => ({
    name: a.name,
    values: [] as string[],
    input: '',
  }));
}

export function variantAttrsFromProfile(type: ShopType | string | null | undefined) {
  return defaultVariantAttributes(type);
}

export function defaultHasVariants(type: ShopType | string | null | undefined): boolean {
  const key = (type ?? ShopType.CLOTHING) as ShopType;
  return key !== ShopType.CLOTHING;
}

export function variantColumnLabels(type: ShopType | string | null | undefined): [string, string] {
  const attrs = getShopProfile(type).variantAttributes;
  return [attrs[0]?.name ?? 'Size', attrs[1]?.name ?? 'Variant'];
}

const SHOP_TYPE_KEY = 'fe_shop_type';

export function getStoredShopType(): ShopType {
  if (typeof window === 'undefined') return ShopType.CLOTHING;
  const v = localStorage.getItem(SHOP_TYPE_KEY);
  return (v as ShopType) ?? ShopType.CLOTHING;
}

export function setStoredShopType(type: ShopType | string) {
  if (typeof window !== 'undefined') localStorage.setItem(SHOP_TYPE_KEY, type);
}
