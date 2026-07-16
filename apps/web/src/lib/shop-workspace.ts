/** Per-vertical workspace UX — dashboard, labels, quick actions */

import { ShopType } from '@/lib/shop-profiles';

export interface QuickAction {
  label: string;
  href?: string;
  pos?: boolean;
  icon: 'pos' | 'product' | 'purchase' | 'inventory' | 'customer' | 'report' | 'barcode';
}

export interface WorkspaceConfig {
  dashboardTitle: string;
  dashboardSubtitle: string;
  customerLabel: string;
  productLabel: string;
  topSellingLabel: string;
  aiBrand: string;
  quickActions: QuickAction[];
  tips: string[];
}

export const WORKSPACE: Record<ShopType, WorkspaceConfig> = {
  [ShopType.CLOTHING]: {
    dashboardTitle: 'Clothing Dashboard',
    dashboardSubtitle: 'Sizes, colors, brands & fashion retail at a glance',
    customerLabel: 'Customers',
    productLabel: 'Products',
    topSellingLabel: 'Top Selling Items',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Open POS', pos: true, icon: 'pos' },
      { label: 'Add Product', href: '/products', icon: 'product' },
      { label: 'Print Hang Tags', href: '/purchases', icon: 'barcode' },
      { label: 'Manage Returns', href: '/returns', icon: 'report' },
    ],
    tips: [
      'Use Size + Color variants for every apparel SKU',
      'Print hang tags when goods arrive from supplier',
      'Run promotions before weekends for best results',
    ],
  },
  [ShopType.GROCERY]: {
    dashboardTitle: 'Grocery Dashboard',
    dashboardSubtitle: 'Fast billing, expiry tracking & daily profit',
    customerLabel: 'Customers',
    productLabel: 'Products',
    topSellingLabel: 'Fast-Moving Items',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Fast POS', pos: true, icon: 'pos' },
      { label: 'Add Product', href: '/products', icon: 'product' },
      { label: 'New Purchase', href: '/purchases/new', icon: 'purchase' },
      { label: 'Stock Check', href: '/inventory', icon: 'inventory' },
    ],
    tips: [
      'Set expiry dates on dairy & frozen items',
      'Use batch numbers for traceability',
      'Check low-stock alerts before opening each day',
    ],
  },
  [ShopType.HARDWARE]: {
    dashboardTitle: 'Hardware Dashboard',
    dashboardSubtitle: 'Units, materials, PO & inventory control',
    customerLabel: 'Customers',
    productLabel: 'Items',
    topSellingLabel: 'Top Selling Items',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Open POS', pos: true, icon: 'pos' },
      { label: 'Add Item', href: '/products', icon: 'product' },
      { label: 'Purchase Order', href: '/purchases/new', icon: 'purchase' },
      { label: 'Receive GRN', href: '/purchases', icon: 'inventory' },
    ],
    tips: [
      'Track items by meter, feet, kg or piece',
      'Use Material variant for pipes, fittings & tools',
      'Create PO before bulk supplier orders',
    ],
  },
  [ShopType.AGRICULTURE]: {
    dashboardTitle: 'Agriculture Dashboard',
    dashboardSubtitle: 'Seeds, fertilizer, batch & farmer credit',
    customerLabel: 'Farmers',
    productLabel: 'Products',
    topSellingLabel: 'Top Agri Products',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Open POS', pos: true, icon: 'pos' },
      { label: 'Add Product', href: '/products', icon: 'product' },
      { label: 'New Purchase', href: '/purchases/new', icon: 'purchase' },
      { label: 'Farmer Accounts', href: '/customers', icon: 'customer' },
    ],
    tips: [
      'Track batch & expiry on fertilizer and chemicals',
      'Use Weight + Grade variants for seeds & feed',
      'Monitor farmer credit limits on customer profiles',
    ],
  },
  [ShopType.SPARE_PARTS]: {
    dashboardTitle: 'Spare Parts Dashboard',
    dashboardSubtitle: 'Vehicle compatibility, warranty, stock & sales',
    customerLabel: 'Customers',
    productLabel: 'Parts',
    topSellingLabel: 'Top Selling Parts',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Open POS', pos: true, icon: 'pos' },
      { label: 'Add Part', href: '/products', icon: 'product' },
      { label: 'Vehicle Lookup', href: '/vehicles', icon: 'barcode' },
      { label: 'New Quotation', href: '/quotations', icon: 'report' },
    ],
    tips: [
      'Map parts to vehicle make, model & year for fast lookup',
      'Set OEM number and warranty months on each part',
      'Use quotations for workshop and fleet customers',
    ],
  },
  [ShopType.TIRE_SHOP]: {
    dashboardTitle: 'Tyre Shop Dashboard',
    dashboardSubtitle: 'Tyre sizes, vehicle fitment, warranty & fleet sales',
    customerLabel: 'Customers',
    productLabel: 'Tyres',
    topSellingLabel: 'Top Selling Tyres',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Open POS', pos: true, icon: 'pos' },
      { label: 'Add Tyre', href: '/products', icon: 'product' },
      { label: 'Vehicle Lookup', href: '/vehicles', icon: 'barcode' },
      { label: 'New Quotation', href: '/quotations', icon: 'report' },
    ],
    tips: [
      'Set tyre size (205/55R16) and season on every SKU',
      'Map compatible tyres to vehicle make & model',
      'Print barcode stickers when tyres arrive via GRN',
    ],
  },
  [ShopType.GENERAL]: {
    dashboardTitle: 'General Shop Dashboard',
    dashboardSubtitle: 'Mixed retail — products, stock, sales & customers',
    customerLabel: 'Customers',
    productLabel: 'Products',
    topSellingLabel: 'Top Selling Products',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Open POS', pos: true, icon: 'pos' },
      { label: 'Add Product', href: '/products', icon: 'product' },
      { label: 'New Purchase', href: '/purchases/new', icon: 'purchase' },
      { label: 'Stock Check', href: '/inventory', icon: 'inventory' },
    ],
    tips: [
      'Use Size or Variant attributes only when products need them',
      'Set selling price and barcode on each SKU for fast POS',
      'Run promotions on weekends for higher foot traffic',
    ],
  },
};

export function getWorkspace(type: ShopType | string | null | undefined): WorkspaceConfig {
  const key = (type ?? ShopType.CLOTHING) as ShopType;
  return WORKSPACE[key] ?? WORKSPACE[ShopType.CLOTHING];
}
