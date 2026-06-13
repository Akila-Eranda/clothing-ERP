/** Per-vertical workspace UX — dashboard, labels, quick actions */

import { ShopType } from '@/lib/shop-profiles';

export interface QuickAction {
  label: string;
  labelSi: string;
  href?: string;
  pos?: boolean;
  icon: 'pos' | 'product' | 'purchase' | 'inventory' | 'customer' | 'report' | 'barcode';
}

export interface WorkspaceConfig {
  dashboardTitle: string;
  dashboardSubtitle: string;
  dashboardSubtitleSi: string;
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
    dashboardSubtitleSi: 'ඇඳුම්, sizes, colors — ඔබේ shop එක එක look එකකින්',
    customerLabel: 'Customers',
    productLabel: 'Products',
    topSellingLabel: 'Top Selling Items',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Open POS', labelSi: 'POS විවෘත කරන්න', pos: true, icon: 'pos' },
      { label: 'Add Product', labelSi: 'Product එකක් add කරන්න', href: '/products', icon: 'product' },
      { label: 'Print Hang Tags', labelSi: 'Hang tags print කරන්න', href: '/purchases', icon: 'barcode' },
      { label: 'Manage Returns', labelSi: 'Returns manage කරන්න', href: '/returns', icon: 'report' },
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
    dashboardSubtitleSi: 'Fast POS, expiry, stock — සිල්ලර shop එක easy',
    customerLabel: 'Customers',
    productLabel: 'Products',
    topSellingLabel: 'Fast-Moving Items',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Fast POS', labelSi: 'Fast POS', pos: true, icon: 'pos' },
      { label: 'Add Product', labelSi: 'Product add', href: '/products', icon: 'product' },
      { label: 'New Purchase', labelSi: 'Purchase order', href: '/purchases/new', icon: 'purchase' },
      { label: 'Stock Check', labelSi: 'Stock බලන්න', href: '/inventory', icon: 'inventory' },
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
    dashboardSubtitleSi: 'Tools, units, stock — hardware shop easy manage',
    customerLabel: 'Customers',
    productLabel: 'Items',
    topSellingLabel: 'Top Selling Items',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Open POS', labelSi: 'POS', pos: true, icon: 'pos' },
      { label: 'Add Item', labelSi: 'Item add', href: '/products', icon: 'product' },
      { label: 'Purchase Order', labelSi: 'PO create', href: '/purchases/new', icon: 'purchase' },
      { label: 'Receive GRN', labelSi: 'GRN receive', href: '/purchases', icon: 'inventory' },
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
    dashboardSubtitleSi: 'Seeds, fertilizer, farmers — agri shop smart manage',
    customerLabel: 'Farmers',
    productLabel: 'Products',
    topSellingLabel: 'Top Agri Products',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Open POS', labelSi: 'POS', pos: true, icon: 'pos' },
      { label: 'Add Product', labelSi: 'Product add', href: '/products', icon: 'product' },
      { label: 'New Purchase', labelSi: 'Stock order', href: '/purchases/new', icon: 'purchase' },
      { label: 'Farmer Accounts', labelSi: 'Farmers', href: '/customers', icon: 'customer' },
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
    dashboardSubtitleSi: 'Vehicle parts, warranty, stock — spare parts shop easy',
    customerLabel: 'Customers',
    productLabel: 'Parts',
    topSellingLabel: 'Top Selling Parts',
    aiBrand: 'ShopAI™',
    quickActions: [
      { label: 'Open POS', labelSi: 'POS', pos: true, icon: 'pos' },
      { label: 'Add Part', labelSi: 'Part add', href: '/products', icon: 'product' },
      { label: 'Vehicle Lookup', labelSi: 'Vehicle search', href: '/vehicles', icon: 'barcode' },
      { label: 'New Quotation', labelSi: 'Quotation', href: '/quotations', icon: 'report' },
    ],
    tips: [
      'Map parts to vehicle make, model & year for fast lookup',
      'Set OEM number and warranty months on each part',
      'Use quotations for workshop and fleet customers',
    ],
  },
};

export function getWorkspace(type: ShopType | string | null | undefined): WorkspaceConfig {
  const key = (type ?? ShopType.CLOTHING) as ShopType;
  return WORKSPACE[key] ?? WORKSPACE[ShopType.CLOTHING];
}
