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
  if (t === ShopType.SPARE_PARTS) {
    return [{ v: 'WARRANTY', l: 'Warranty Claim' }, { v: 'WRONG_PART', l: 'Wrong Part' }, ...common];
  }
  if (t === ShopType.TIRE_SHOP) {
    return [{ v: 'WARRANTY', l: 'Warranty Claim' }, { v: 'DEFECTIVE_TREAD', l: 'Tread Defect' }, { v: 'WRONG_SIZE', l: 'Wrong Size' }, ...common];
  }
  return common;
}

export function getRouteLabels(ws: WorkspaceConfig, profile: ShopProfile): Record<string, string> {
  const customersTitle = profile.type === ShopType.AGRICULTURE
    ? `${ws.customerLabel} & Accounts`
    : `${ws.customerLabel} & CRM`;
  const printLabel = profile.labelTemplates.includes('hangtag') ? 'Print Tags' : 'Print Labels';
  const brandRouteLabel = getBrandPageCopy(profile, ws).pageTitle;
  const supplierRouteLabel = getSupplierPageCopy(profile, ws).pageTitle;

  return {
    '/dashboard': 'Dashboard',
    '/analytics': 'Analytics',
    '/pos': 'POS Terminal',
    '/sales': 'Sales',
    '/returns': 'Returns & Exchanges',
    '/products': ws.productLabel,
    '/categories': 'Categories',
    '/brands': brandRouteLabel,
    '/inventory': 'Inventory',
    '/workflows': 'Approval Workflows',
    '/advanced': 'ERP Roadmap',
    '/customers': customersTitle,
    '/suppliers': supplierRouteLabel,
    '/purchases': 'Purchase Orders',
    '/hr': 'HR & Payroll',
    '/accounting': 'Accounting',
    '/cash': 'Cash Management',
    '/expenses': 'Expenses',
    '/branches': 'Branches',
    '/reports': 'Reports & Analytics',
    '/promotions': 'Promotions & Offers',
    '/notifications': 'Notifications',
    '/settings': 'Settings',
    '/users': 'Users & Roles',
    '/features': 'Features',
    '/vehicles': 'Vehicle Compatibility',
    '/warranty': 'Warranty Claims',
    '/quotations': 'Quotations',
    '/job-cards': 'Job Cards',
    '/appointments': 'Appointments',
    '/services': 'Workshop Services',
    printTags: printLabel,
  };
}

/** Shorter labels for sidebar nav (248px width) */
export function getSidebarLabels(ws: WorkspaceConfig, profile: ShopProfile): Record<string, string> {
  const routes = getRouteLabels(ws, profile);
  const brand = getBrandPageCopy(profile, ws);
  const supplier = getSupplierPageCopy(profile, ws);

  const brandShort: Record<ShopType, string> = {
    [ShopType.CLOTHING]: 'Brands',
    [ShopType.GROCERY]: 'Brands',
    [ShopType.HARDWARE]: 'Manufacturers',
    [ShopType.AGRICULTURE]: 'Agri Brands',
    [ShopType.SPARE_PARTS]: 'Manufacturers',
    [ShopType.TIRE_SHOP]: 'Tyre Brands',
    [ShopType.GENERAL]: 'Brands',
  };

  const supplierShort: Record<ShopType, string> = {
    [ShopType.CLOTHING]: 'Suppliers',
    [ShopType.GROCERY]: 'Suppliers',
    [ShopType.HARDWARE]: 'Suppliers',
    [ShopType.AGRICULTURE]: 'Agri Suppliers',
    [ShopType.SPARE_PARTS]: 'Distributors',
    [ShopType.TIRE_SHOP]: 'Distributors',
    [ShopType.GENERAL]: 'Suppliers',
  };

  return {
    ...routes,
    '/returns': 'Returns',
    '/workflows': 'Workflows',
    '/customers': ws.customerLabel,
    '/purchases': 'Purchases',
    '/reports': 'Reports',
    '/promotions': 'Promotions',
    '/brands': brandShort[profile.type] ?? brand.pageTitle,
    '/suppliers': supplierShort[profile.type] ?? supplier.pageTitle,
    '/vehicles': profile.type === ShopType.SPARE_PARTS || profile.type === ShopType.TIRE_SHOP ? 'Vehicles' : 'Vehicle Compat.',
    '/warranty': 'Warranty',
    '/quotations': 'Quotations',
    '/job-cards': 'Job Cards',
    '/appointments': 'Appointments',
    '/services': 'Services',
    '/users': 'Users & Roles',
    '/cash': 'Cash Management',
  };
}

export function getSidebarSectionTitles(profile: ShopProfile) {
  const product =
    profile.type === ShopType.SPARE_PARTS ? 'PARTS & STOCK'
    : profile.type === ShopType.TIRE_SHOP ? 'TYRES & STOCK'
    : profile.type === ShopType.AGRICULTURE ? 'AGRI PRODUCTS'
    : profile.type === ShopType.HARDWARE ? 'ITEMS & STOCK'
    : profile.type === ShopType.GENERAL ? 'PRODUCTS'
    : 'PRODUCTS';

  const sales =
    profile.type === ShopType.GROCERY ? 'SALES & POS'
    : 'SALES';

  return {
    overview: 'OVERVIEW',
    sales,
    products: product,
    procurement: 'PROCUREMENT',
    finance: 'FINANCE',
    reports: 'REPORTS',
    hr: 'HR & STAFF',
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

export interface BrandPageCopy {
  pageTitle: string;
  subtitle: string;
  singular: string;
  plural: string;
  addButton: string;
  addModalTitle: string;
  editModalTitle: string;
  addModalSubtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
  activeHint: string;
  deleteConfirm: (name: string, productLabel: string) => string;
  tips: string[];
  csvFileName: string;
}

export function getBrandPageCopy(profile: ShopProfile, workspace: WorkspaceConfig): BrandPageCopy {
  const copies: Record<ShopType, Omit<BrandPageCopy, 'deleteConfirm'>> = {
    [ShopType.CLOTHING]: {
      pageTitle: 'Brands',
      subtitle: 'Fashion & apparel brands for your clothing catalog',
      singular: 'Brand',
      plural: 'Brands',
      addButton: 'Add Brand',
      addModalTitle: 'Add New Brand',
      editModalTitle: 'Edit Brand',
      addModalSubtitle: 'Create a fashion or apparel brand',
      nameLabel: 'Brand Name',
      namePlaceholder: "e.g. Levi's, Nike, H&M",
      descriptionPlaceholder: 'Brief description of this fashion brand…',
      activeHint: 'Brand visible in catalog and product forms',
      tips: [
        'Assign a brand when adding apparel products',
        'Use logos for a polished product catalog',
        'Filter POS and reports by brand for top sellers',
      ],
      csvFileName: 'brands-export',
    },
    [ShopType.GROCERY]: {
      pageTitle: 'Brands',
      subtitle: 'Food, beverage & household product brands',
      singular: 'Brand',
      plural: 'Brands',
      addButton: 'Add Brand',
      addModalTitle: 'Add New Brand',
      editModalTitle: 'Edit Brand',
      addModalSubtitle: 'Create a grocery or FMCG brand',
      nameLabel: 'Brand Name',
      namePlaceholder: 'e.g. Anchor, Nestlé, Maliban',
      descriptionPlaceholder: 'Brief description of this brand…',
      activeHint: 'Brand visible when adding products and at POS',
      tips: [
        'Group items by manufacturer for easy shelf planning',
        'Use brands to compare fast-moving vs slow products',
        'Set expiry tracking on perishable branded lines',
      ],
      csvFileName: 'grocery-brands-export',
    },
    [ShopType.HARDWARE]: {
      pageTitle: 'Manufacturers',
      subtitle: 'Tool, electrical & plumbing manufacturers',
      singular: 'Manufacturer',
      plural: 'Manufacturers',
      addButton: 'Add Manufacturer',
      addModalTitle: 'Add Manufacturer',
      editModalTitle: 'Edit Manufacturer',
      addModalSubtitle: 'Register a hardware or tool manufacturer',
      nameLabel: 'Manufacturer Name',
      namePlaceholder: 'e.g. Bosch, Stanley, PVC King',
      descriptionPlaceholder: 'Brief description of this manufacturer…',
      activeHint: 'Manufacturer visible in catalog and purchase orders',
      tips: [
        'Track manufacturer for warranty and supplier sourcing',
        'Use Material variants for pipes, fittings & tools',
        'Compare sales by manufacturer for reorder decisions',
      ],
      csvFileName: 'manufacturers-export',
    },
    [ShopType.AGRICULTURE]: {
      pageTitle: 'Agri Brands',
      subtitle: 'Seed, fertilizer, pesticide & feed brands',
      singular: 'Brand',
      plural: 'Agri Brands',
      addButton: 'Add Agri Brand',
      addModalTitle: 'Add Agri Brand',
      editModalTitle: 'Edit Agri Brand',
      addModalSubtitle: 'Create a seed, fertilizer or feed brand',
      nameLabel: 'Brand Name',
      namePlaceholder: 'e.g. CIC Seeds, Hayleys, Luxman',
      descriptionPlaceholder: 'Brief description of this agri brand…',
      activeHint: 'Brand visible when adding products and on farmer accounts',
      tips: [
        'Farmers often buy by trusted seed & fertilizer brand',
        'Link batch numbers to branded chemical lines',
        'Use Grade variants for seeds and animal feed',
      ],
      csvFileName: 'agri-brands-export',
    },
    [ShopType.SPARE_PARTS]: {
      pageTitle: 'Part Manufacturers',
      subtitle: 'OEM, genuine & aftermarket part makers',
      singular: 'Manufacturer',
      plural: 'Manufacturers',
      addButton: 'Add Manufacturer',
      addModalTitle: 'Add Part Manufacturer',
      editModalTitle: 'Edit Manufacturer',
      addModalSubtitle: 'Register an OEM or aftermarket parts maker',
      nameLabel: 'Manufacturer Name',
      namePlaceholder: 'e.g. Denso, Bosch, Toyota Genuine',
      descriptionPlaceholder: 'Brief description — OEM, genuine, aftermarket…',
      activeHint: 'Manufacturer visible on parts catalog and quotations',
      tips: [
        'Set OEM number and warranty months on each part',
        'Map parts to vehicle make & model for fast lookup',
        'Use Part Type variant: OEM, Genuine, Aftermarket',
      ],
      csvFileName: 'part-manufacturers-export',
    },
    [ShopType.TIRE_SHOP]: {
      pageTitle: 'Tyre Brands',
      subtitle: 'Passenger, SUV & commercial tyre manufacturers',
      singular: 'Brand',
      plural: 'Tyre Brands',
      addButton: 'Add Tyre Brand',
      addModalTitle: 'Add Tyre Brand',
      editModalTitle: 'Edit Tyre Brand',
      addModalSubtitle: 'Register a tyre manufacturer or importer brand',
      nameLabel: 'Brand Name',
      namePlaceholder: 'e.g. Michelin, Bridgestone, Dunlop',
      descriptionPlaceholder: 'Brief description of this tyre brand…',
      activeHint: 'Brand visible on tyre catalog, POS and quotations',
      tips: [
        'Group tyres by brand for easy shelf and warehouse planning',
        'Set load index and speed rating on premium tyre lines',
        'Map each size variant to compatible vehicle models',
      ],
      csvFileName: 'tyre-brands-export',
    },
    [ShopType.GENERAL]: {
      pageTitle: 'Brands',
      subtitle: 'Product brands for your general retail catalog',
      singular: 'Brand',
      plural: 'Brands',
      addButton: 'Add Brand',
      addModalTitle: 'Add New Brand',
      editModalTitle: 'Edit Brand',
      addModalSubtitle: 'Create a product brand',
      nameLabel: 'Brand Name',
      namePlaceholder: 'e.g. Samsung, Unilever, Local Brand',
      descriptionPlaceholder: 'Brief description of this brand…',
      activeHint: 'Brand visible in catalog and product forms',
      tips: [
        'Group products by brand for easier browsing',
        'Filter reports by brand to see top sellers',
        'Use brands on quotations for bulk customer orders',
      ],
      csvFileName: 'general-brands-export',
    },
  };
  const base = copies[profile.type] ?? copies[ShopType.CLOTHING];
  return {
    ...base,
    deleteConfirm: (name, pl) =>
      `Delete "${name}"? ${base.plural} linked to ${pl} will lose their ${base.singular.toLowerCase()} association.`,
  };
}

export interface SupplierPageCopy {
  pageTitle: string;
  subtitle: string;
  singular: string;
  plural: string;
  addButton: string;
  addPageTitle: string;
  editPageTitle: string;
  editButton: string;
  saveButton: string;
  updateButton: string;
  nameLabel: string;
  namePlaceholder: string;
  notesPlaceholder: string;
  activeLabel: string;
  activeHint: string;
  backLabel: string;
  backToDetailLabel: string;
  addModalTitle: string;
  editModalTitle: string;
  addModalSubtitle: string;
  paymentModalTitle: string;
  detailsSectionTitle: string;
  deleteConfirm: (name: string) => string;
  tips: string[];
  csvFileName: string;
}

export function getSupplierPageCopy(profile: ShopProfile, _workspace: WorkspaceConfig): SupplierPageCopy {
  const copies: Record<ShopType, Omit<SupplierPageCopy, 'deleteConfirm'>> = {
    [ShopType.CLOTHING]: {
      pageTitle: 'Suppliers',
      subtitle: 'Textile vendors, garment wholesalers & fashion distributors',
      singular: 'Supplier',
      plural: 'Suppliers',
      addButton: 'Add Supplier',
      addPageTitle: 'Add New Supplier',
      editPageTitle: 'Edit Supplier',
      editButton: 'Edit Supplier',
      saveButton: 'Save Supplier',
      updateButton: 'Update Supplier',
      nameLabel: 'Supplier Name',
      namePlaceholder: 'e.g. TextileCo Lanka, Fashion Hub',
      notesPlaceholder: 'Internal notes about this textile vendor…',
      activeLabel: 'Active Supplier',
      activeHint: 'Visible and available for purchase orders',
      backLabel: 'Back to Suppliers',
      backToDetailLabel: 'Back to Supplier',
      addModalTitle: 'Add Supplier',
      editModalTitle: 'Edit Supplier',
      addModalSubtitle: 'Create a textile or fashion supplier profile',
      paymentModalTitle: 'Record Supplier Payment',
      detailsSectionTitle: 'Supplier Details',
      tips: [
        'Create PO before seasonal fabric and apparel orders',
        'Track credit limits for bulk import suppliers',
        'Print hang tags when goods arrive from vendor',
      ],
      csvFileName: 'suppliers-export',
    },
    [ShopType.GROCERY]: {
      pageTitle: 'Suppliers',
      subtitle: 'FMCG distributors, wholesale vendors & importers',
      singular: 'Supplier',
      plural: 'Suppliers',
      addButton: 'Add Supplier',
      addPageTitle: 'Add New Supplier',
      editPageTitle: 'Edit Supplier',
      editButton: 'Edit Supplier',
      saveButton: 'Save Supplier',
      updateButton: 'Update Supplier',
      nameLabel: 'Supplier Name',
      namePlaceholder: 'e.g. Maliban Distributor, Cargills Wholesale',
      notesPlaceholder: 'Internal notes about this distributor…',
      activeLabel: 'Active Supplier',
      activeHint: 'Available for stock orders and GRN receiving',
      backLabel: 'Back to Suppliers',
      backToDetailLabel: 'Back to Supplier',
      addModalTitle: 'Add Supplier',
      editModalTitle: 'Edit Supplier',
      addModalSubtitle: 'Register a grocery or FMCG distributor',
      paymentModalTitle: 'Record Supplier Payment',
      detailsSectionTitle: 'Supplier Details',
      tips: [
        'Set expiry dates when receiving dairy & frozen stock',
        'Use batch numbers for traceability on branded lines',
        'Monitor credit with fast-moving distributors',
      ],
      csvFileName: 'grocery-suppliers-export',
    },
    [ShopType.HARDWARE]: {
      pageTitle: 'Suppliers',
      subtitle: 'Tool, electrical & building material wholesalers',
      singular: 'Supplier',
      plural: 'Suppliers',
      addButton: 'Add Supplier',
      addPageTitle: 'Add New Supplier',
      editPageTitle: 'Edit Supplier',
      editButton: 'Edit Supplier',
      saveButton: 'Save Supplier',
      updateButton: 'Update Supplier',
      nameLabel: 'Supplier Name',
      namePlaceholder: 'e.g. Abans Hardware Wholesale, Laksala Tools',
      notesPlaceholder: 'Internal notes about this wholesaler…',
      activeLabel: 'Active Supplier',
      activeHint: 'Available for purchase orders and GRN',
      backLabel: 'Back to Suppliers',
      backToDetailLabel: 'Back to Supplier',
      addModalTitle: 'Add Supplier',
      editModalTitle: 'Edit Supplier',
      addModalSubtitle: 'Register a hardware or tools wholesaler',
      paymentModalTitle: 'Record Supplier Payment',
      detailsSectionTitle: 'Supplier Details',
      tips: [
        'Create PO before bulk pipe, fitting & tool orders',
        'Track credit limits on importers and wholesalers',
        'Receive GRN with material and size variants',
      ],
      csvFileName: 'hardware-suppliers-export',
    },
    [ShopType.AGRICULTURE]: {
      pageTitle: 'Agri Suppliers',
      subtitle: 'Seed, fertilizer, pesticide & feed distributors',
      singular: 'Supplier',
      plural: 'Agri Suppliers',
      addButton: 'Add Agri Supplier',
      addPageTitle: 'Add Agri Supplier',
      editPageTitle: 'Edit Agri Supplier',
      editButton: 'Edit Supplier',
      saveButton: 'Save Supplier',
      updateButton: 'Update Supplier',
      nameLabel: 'Supplier Name',
      namePlaceholder: 'e.g. Hayleys Agri, CIC Fertilizer Depot',
      notesPlaceholder: 'Internal notes about this agri distributor…',
      activeLabel: 'Active Supplier',
      activeHint: 'Available for fertilizer, seed & feed orders',
      backLabel: 'Back to Agri Suppliers',
      backToDetailLabel: 'Back to Supplier',
      addModalTitle: 'Add Agri Supplier',
      editModalTitle: 'Edit Agri Supplier',
      addModalSubtitle: 'Register a seed, fertilizer or feed distributor',
      paymentModalTitle: 'Record Supplier Payment',
      detailsSectionTitle: 'Supplier Details',
      tips: [
        'Record batch numbers on fertilizer and chemical arrivals',
        'Track seasonal credit with seed suppliers',
        'Monitor outstanding before peak planting season',
      ],
      csvFileName: 'agri-suppliers-export',
    },
    [ShopType.SPARE_PARTS]: {
      pageTitle: 'Parts Distributors',
      subtitle: 'OEM & aftermarket auto parts wholesalers',
      singular: 'Distributor',
      plural: 'Distributors',
      addButton: 'Add Distributor',
      addPageTitle: 'Add Parts Distributor',
      editPageTitle: 'Edit Distributor',
      editButton: 'Edit Distributor',
      saveButton: 'Save Distributor',
      updateButton: 'Update Distributor',
      nameLabel: 'Distributor Name',
      namePlaceholder: 'e.g. Toyota Lanka Parts, AutoLanka Distributors',
      notesPlaceholder: 'Internal notes about this parts distributor…',
      activeLabel: 'Active Distributor',
      activeHint: 'Available for parts purchase orders and GRN',
      backLabel: 'Back to Distributors',
      backToDetailLabel: 'Back to Distributor',
      addModalTitle: 'Add Parts Distributor',
      editModalTitle: 'Edit Distributor',
      addModalSubtitle: 'Register an OEM or aftermarket parts wholesaler',
      paymentModalTitle: 'Record Distributor Payment',
      detailsSectionTitle: 'Distributor Details',
      tips: [
        'Link PO lines to OEM part numbers on receipt',
        'Track distributor credit for import orders',
        'Map received parts to vehicle compatibility',
      ],
      csvFileName: 'parts-distributors-export',
    },
    [ShopType.TIRE_SHOP]: {
      pageTitle: 'Tyre Distributors',
      subtitle: 'Tyre importers & wholesale distributors',
      singular: 'Distributor',
      plural: 'Distributors',
      addButton: 'Add Distributor',
      addPageTitle: 'Add Tyre Distributor',
      editPageTitle: 'Edit Distributor',
      editButton: 'Edit Distributor',
      saveButton: 'Save Distributor',
      updateButton: 'Update Distributor',
      nameLabel: 'Distributor Name',
      namePlaceholder: 'e.g. CEAT Distributors, Tyre Lanka Wholesale',
      notesPlaceholder: 'Internal notes about this tyre distributor…',
      activeLabel: 'Active Distributor',
      activeHint: 'Available for tyre purchase orders and GRN',
      backLabel: 'Back to Distributors',
      backToDetailLabel: 'Back to Distributor',
      addModalTitle: 'Add Tyre Distributor',
      editModalTitle: 'Edit Distributor',
      addModalSubtitle: 'Register a tyre importer or wholesaler',
      paymentModalTitle: 'Record Distributor Payment',
      detailsSectionTitle: 'Distributor Details',
      tips: [
        'Record DOT batch numbers when receiving tyre stock',
        'Track credit limits with import distributors',
        'Print barcode stickers on GRN for each tyre unit',
      ],
      csvFileName: 'tyre-distributors-export',
    },
    [ShopType.GENERAL]: {
      pageTitle: 'Suppliers',
      subtitle: 'Wholesale vendors & product suppliers',
      singular: 'Supplier',
      plural: 'Suppliers',
      addButton: 'Add Supplier',
      addPageTitle: 'Add New Supplier',
      editPageTitle: 'Edit Supplier',
      editButton: 'Edit Supplier',
      saveButton: 'Save Supplier',
      updateButton: 'Update Supplier',
      nameLabel: 'Supplier Name',
      namePlaceholder: 'e.g. Metro Wholesale, Local Distributor',
      notesPlaceholder: 'Internal notes about this supplier…',
      activeLabel: 'Active Supplier',
      activeHint: 'Visible and available for purchase orders',
      backLabel: 'Back to Suppliers',
      backToDetailLabel: 'Back to Supplier',
      addModalTitle: 'Add Supplier',
      editModalTitle: 'Edit Supplier',
      addModalSubtitle: 'Create a supplier profile',
      paymentModalTitle: 'Record Supplier Payment',
      detailsSectionTitle: 'Supplier Details',
      tips: [
        'Create purchase orders before restocking fast-moving items',
        'Track supplier credit limits for monthly settlements',
        'Receive GRN to update stock and print labels',
      ],
      csvFileName: 'general-suppliers-export',
    },
  };
  const base = copies[profile.type] ?? copies[ShopType.CLOTHING];
  return {
    ...base,
    deleteConfirm: (name) => `Delete "${name}"? This cannot be undone.`,
  };
}

export function getProductFormCopy(profile: ShopProfile, workspace: WorkspaceConfig): ProductFormCopy {
  const singular = workspace.productLabel.replace(/s$/i, '') || 'Product';
  const tips: Record<ShopType, string> = {
    [ShopType.CLOTHING]: 'Use Size + Color variants for apparel. Print hang tags after receiving stock.',
    [ShopType.GROCERY]: 'Set unit (kg, L, pack) and expiry date for perishable items.',
    [ShopType.HARDWARE]: 'Track by unit (pcs, meter, box) and use Material variants for fittings.',
    [ShopType.AGRICULTURE]: 'Record batch number and grade for seeds, fertilizer and feed.',
    [ShopType.SPARE_PARTS]: 'Set OEM number, part type and warranty months. Map to compatible vehicles.',
    [ShopType.TIRE_SHOP]: 'Set tyre size, season, load index and speed rating. Map to compatible vehicles.',
    [ShopType.GENERAL]: 'Add products with optional Size/Variant attributes. Use barcodes for fast POS billing.',
  };
  const placeholders: Record<ShopType, string> = {
    [ShopType.CLOTHING]: 'e.g. Premium Cotton T-Shirt',
    [ShopType.GROCERY]: 'e.g. Fresh Milk 1L',
    [ShopType.HARDWARE]: 'e.g. PVC Pipe 20mm',
    [ShopType.AGRICULTURE]: 'e.g. Hybrid Tomato Seeds 1kg',
    [ShopType.SPARE_PARTS]: 'e.g. Oil Filter — Toyota Axio',
    [ShopType.TIRE_SHOP]: 'e.g. Michelin Primacy 205/55R16',
    [ShopType.GENERAL]: 'e.g. Wireless Mouse, Shampoo 400ml',
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
