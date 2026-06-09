/** Per-vertical config — labels, reasons, routes (design stays the same) */

import { ShopType, getShopProfile, variantAttrsFromProfile, defaultHasVariants, type ShopProfile } from '@/lib/shop-profiles';
import { getWorkspace, type WorkspaceConfig } from '@/lib/shop-workspace';

export function hasShopModule(profile: ShopProfile, mod: keyof ShopProfile['modules']): boolean {
  return profile.modules[mod];
}

export function getReturnReasons(type: ShopType | string | null | undefined) {
  const t = (type ?? ShopType.CLOTHING) as ShopType;
  const common = [
    { v: 'DEFECTIVE', l: 'Defective' },
    { v: 'WRONG_ITEM', l: 'Wrong Item' },
    { v: 'DAMAGED', l: 'Damaged' },
    { v: 'CUSTOMER_CHANGED_MIND', l: 'Changed Mind' },
    { v: 'OTHER', l: 'Other' },
  ];
  if (t === ShopType.CLOTHING) {
    return [{ v: 'SIZE_ISSUE', l: 'Size Issue' }, ...common];
  }
  if (t === ShopType.GROCERY) {
    return [{ v: 'EXPIRED', l: 'Expired Product' }, { v: 'QUALITY_ISSUE', l: 'Quality Issue' }, ...common];
  }
  if (t === ShopType.AGRICULTURE) {
    return [{ v: 'BATCH_ISSUE', l: 'Batch Issue' }, { v: 'QUALITY_ISSUE', l: 'Grade / Quality Issue' }, ...common];
  }
  return common;
}

export function getRouteLabels(ws: WorkspaceConfig, profile: ShopProfile): Record<string, string> {
  const customersTitle = profile.type === ShopType.AGRICULTURE
    ? `${ws.customerLabel} & Accounts`
    : `${ws.customerLabel} & CRM`;
  const printLabel = profile.labelTemplates.includes('hangtag') ? 'Print Tags' : 'Print Labels';

  return {
    '/dashboard': 'Dashboard',
    '/analytics': 'Analytics',
    '/pos': 'POS Terminal',
    '/sales': 'Sales',
    '/returns': 'Returns & Exchanges',
    '/products': ws.productLabel,
    '/categories': 'Categories',
    '/brands': 'Brands',
    '/inventory': 'Inventory',
    '/workflows': 'Approval Workflows',
    '/advanced': 'ERP Roadmap',
    '/customers': customersTitle,
    '/suppliers': 'Suppliers',
    '/purchases': 'Purchase Orders',
    '/hr': 'HR & Payroll',
    '/accounting': 'Accounting',
    '/expenses': 'Expenses',
    '/branches': 'Branches',
    '/reports': 'Reports & Analytics',
    '/promotions': 'Promotions & Offers',
    '/notifications': 'Notifications',
    '/settings': 'Settings',
    '/users': 'Users & Roles',
    '/features': 'Features',
    printTags: printLabel,
  };
}

export function variantVariantHint(profile: ShopProfile): string {
  const names = profile.variantAttributes.map((a) => a.name).join(', ');
  return names || 'variants';
}

export function variantTableColumns(profile: ShopProfile) {
  return profile.variantAttributes.map((a) => ({
    label: a.name,
    field: (a.mapsTo ?? 'size') as 'size' | 'color' | 'material' | 'style',
    isColor: a.mapsTo === 'color',
    presets: a.presets,
  }));
}

export type VariantAttrField = 'size' | 'color' | 'material' | 'style';

export function variantFieldValue(
  v: { size?: string | null; color?: string | null; material?: string | null; style?: string | null },
  field: VariantAttrField,
): string | undefined {
  const val = v[field];
  return val ?? undefined;
}

export function variantDisplayLabel(
  v: { size?: string | null; color?: string | null; material?: string | null; style?: string | null; variantName?: string },
  profile: ShopProfile,
): string {
  const parts = variantTableColumns(profile)
    .map((c) => variantFieldValue(v, c.field))
    .filter(Boolean);
  return parts.join(' · ') || v.variantName || '';
}

export function formatVariantCell(
  variant: { size?: string | null; color?: string | null; material?: string | null; style?: string | null; name?: string } | null | undefined,
  profile: ShopProfile,
  fallback = '—',
): string {
  if (!variant) return fallback;
  const label = variantDisplayLabel({ ...variant, variantName: variant.name }, profile);
  return label || fallback;
}

export function buildProductFormDefaults(type: ShopType | string | null | undefined) {
  const profile = getShopProfile(type);
  return {
    hasVariants: defaultHasVariants(profile.type),
    attributes: variantAttrsFromProfile(profile.type),
    unit: profile.defaultUnit,
  };
}

export function nextVariantAttributeName(profile: ShopProfile, existing: { name: string }[]): string | null {
  const used = new Set(existing.map((a) => a.name.toLowerCase()));
  const next = profile.variantAttributes.find((a) => !used.has(a.name.toLowerCase()));
  return next?.name ?? null;
}

export function findVariantAttrDef(profile: ShopProfile, attrName: string) {
  return profile.variantAttributes.find((d) => d.name.toLowerCase() === attrName.toLowerCase());
}

export function isColorVariantAttr(profile: ShopProfile, attrName: string): boolean {
  return findVariantAttrDef(profile, attrName)?.mapsTo === 'color';
}

export function applyVariantCombo(
  profile: ShopProfile,
  validAttrs: { name: string }[],
  combo: string[],
): Partial<Record<VariantAttrField, string>> {
  const out: Partial<Record<VariantAttrField, string>> = {};
  validAttrs.forEach((attr, idx) => {
    const def = findVariantAttrDef(profile, attr.name);
    const key = (def?.mapsTo ?? attr.name.toLowerCase()) as string;
    if (key === 'size' || key === 'color' || key === 'material' || key === 'style') {
      out[key] = combo[idx];
    }
  });
  return out;
}

export function autoFillVariantAttributes(
  profile: ShopProfile,
  attributes: Array<{ name: string; values: string[]; input: string }>,
) {
  return attributes.map((attr) => {
    const def = findVariantAttrDef(profile, attr.name);
    if (!def?.presets.length || attr.values.length > 0) return attr;
    return { ...attr, values: [...def.presets], input: '' };
  });
}

export interface ProductFormCopy {
  pageTitle: string;
  nameLabel: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
  showBrand: boolean;
  defaultTaxRate: string;
  variantSectionHint: string;
  productTip: string;
}

export function getProductFormCopy(profile: ShopProfile, workspace: WorkspaceConfig): ProductFormCopy {
  const singular = workspace.productLabel.replace(/s$/i, '') || 'Product';
  const tips: Record<ShopType, string> = {
    [ShopType.CLOTHING]: 'Use Size + Color variants for apparel. Print hang tags after receiving stock.',
    [ShopType.GROCERY]: 'Set unit (kg, L, pack) and expiry date for perishable items.',
    [ShopType.HARDWARE]: 'Track by unit (pcs, meter, box) and use Material variants for fittings.',
    [ShopType.AGRICULTURE]: 'Record batch number and grade for seeds, fertilizer and feed.',
  };
  const placeholders: Record<ShopType, string> = {
    [ShopType.CLOTHING]: 'e.g. Premium Cotton T-Shirt',
    [ShopType.GROCERY]: 'e.g. Fresh Milk 1L',
    [ShopType.HARDWARE]: 'e.g. PVC Pipe 20mm',
    [ShopType.AGRICULTURE]: 'e.g. Hybrid Tomato Seeds 1kg',
  };
  const lowTax = profile.type === ShopType.GROCERY || profile.type === ShopType.AGRICULTURE;
  return {
    pageTitle: `Add New ${singular}`,
    nameLabel: `${singular} Name`,
    namePlaceholder: placeholders[profile.type] ?? placeholders[ShopType.CLOTHING],
    descriptionPlaceholder: `Describe this ${singular.toLowerCase()}…`,
    showBrand: profile.modules.brands,
    defaultTaxRate: lowTax ? '0' : '18',
    variantSectionHint: profile.variantAttributes.map((a) => a.name).join(' · '),
    productTip: tips[profile.type] ?? tips[ShopType.CLOTHING],
  };
}

export function useShopWorkspacePair() {
  // re-exported from hook file — kept here for non-hook consumers
  const type = typeof window !== 'undefined'
    ? (localStorage.getItem('fe_shop_type') as ShopType) ?? ShopType.CLOTHING
    : ShopType.CLOTHING;
  const profile = getShopProfile(type);
  return { profile, workspace: getWorkspace(type) };
}
