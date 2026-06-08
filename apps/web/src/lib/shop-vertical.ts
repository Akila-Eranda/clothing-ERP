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

export function useShopWorkspacePair() {
  // re-exported from hook file — kept here for non-hook consumers
  const type = typeof window !== 'undefined'
    ? (localStorage.getItem('fe_shop_type') as ShopType) ?? ShopType.CLOTHING
    : ShopType.CLOTHING;
  const profile = getShopProfile(type);
  return { profile, workspace: getWorkspace(type) };
}
