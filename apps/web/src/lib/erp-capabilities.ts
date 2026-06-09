/** ShopERP capability matrix — live vs partial vs planned */

export type CapabilityStatus = 'live' | 'partial' | 'planned';

export interface Capability {
  id: string;
  label: string;
  status: CapabilityStatus;
  module: string;
  priority?: number;
}

export const ERP_PRIORITY = [
  { rank: 1, label: 'Inventory Ledger', status: 'live' as const },
  { rank: 2, label: 'Workflow & Approval Engine', status: 'live' as const },
  { rank: 3, label: 'Customer Wallet + Loyalty', status: 'live' as const },
  { rank: 4, label: 'Advanced Analytics', status: 'live' as const },
  { rank: 5, label: 'Subscription Billing Engine', status: 'partial' as const },
  { rank: 6, label: 'Vehicle Parts Module', status: 'planned' as const },
  { rank: 7, label: 'Mobile App', status: 'planned' as const },
  { rank: 8, label: 'WhatsApp Integration', status: 'planned' as const },
  { rank: 9, label: 'BI Dashboard', status: 'planned' as const },
  { rank: 10, label: 'AI Forecasting', status: 'planned' as const },
];

export const ERP_MODULES: { title: string; icon: string; items: Capability[] }[] = [
  {
    title: 'Inventory',
    icon: '📦',
    items: [
      { id: 'inv-products', label: 'Products', status: 'live', module: 'inventory' },
      { id: 'inv-categories', label: 'Categories', status: 'live', module: 'inventory' },
      { id: 'inv-stock', label: 'Stock Levels', status: 'live', module: 'inventory' },
      { id: 'inv-warehouse', label: 'Warehouse (Multi-Branch)', status: 'live', module: 'inventory' },
      { id: 'inv-ledger', label: 'Inventory Ledger', status: 'live', module: 'inventory', priority: 1 },
      { id: 'inv-reserved', label: 'Reserved Stock', status: 'live', module: 'inventory' },
      { id: 'inv-available', label: 'Available Stock', status: 'live', module: 'inventory' },
      { id: 'inv-damaged', label: 'Damaged Stock', status: 'live', module: 'inventory' },
      { id: 'inv-returned', label: 'Returned Stock', status: 'live', module: 'inventory' },
      { id: 'inv-batch', label: 'Batch-wise Stock', status: 'live', module: 'inventory' },
      { id: 'inv-aging', label: 'Stock Aging Analysis', status: 'live', module: 'inventory' },
      { id: 'inv-dead', label: 'Dead Stock Analysis', status: 'live', module: 'inventory' },
      { id: 'inv-abc', label: 'ABC Inventory Analysis', status: 'live', module: 'inventory' },
      { id: 'inv-cycle', label: 'Cycle Count Management', status: 'live', module: 'inventory' },
    ],
  },
  {
    title: 'POS & Sales',
    icon: '💰',
    items: [
      { id: 'pos-billing', label: 'POS Billing', status: 'live', module: 'pos' },
      { id: 'pos-hold', label: 'Hold Sales', status: 'live', module: 'pos' },
      { id: 'pos-park', label: 'Park & Resume Orders', status: 'live', module: 'pos' },
      { id: 'pos-split-pay', label: 'Split Payments', status: 'live', module: 'pos' },
      { id: 'pos-split-bill', label: 'Split Bills', status: 'live', module: 'pos' },
      { id: 'pos-multi-currency', label: 'Multi-Currency (Tenant Currency)', status: 'live', module: 'pos' },
      { id: 'pos-cust-discount', label: 'Customer Specific Discounts', status: 'live', module: 'pos' },
      { id: 'pos-promo-engine', label: 'Promotion Rules Engine', status: 'live', module: 'pos' },
      { id: 'pos-voucher', label: 'Gift Voucher System', status: 'live', module: 'pos' },
      { id: 'pos-store-credit', label: 'Store Credit (Wallet)', status: 'live', module: 'pos' },
      { id: 'pos-partial-pay', label: 'Partial Payments', status: 'live', module: 'pos' },
    ],
  },
  {
    title: 'Purchases',
    icon: '🛒',
    items: [
      { id: 'po-basic', label: 'Purchase Orders & GRN', status: 'live', module: 'purchases' },
      { id: 'po-approval', label: 'Purchase Approval Workflow', status: 'live', module: 'purchases' },
      { id: 'po-multi-approval', label: 'Multi-Level Approvals', status: 'live', module: 'purchases' },
      { id: 'po-price-history', label: 'Supplier Price History', status: 'live', module: 'purchases' },
      { id: 'po-quotations', label: 'Supplier Quotations', status: 'planned', module: 'purchases' },
      { id: 'po-comparison', label: 'Purchase Comparison', status: 'planned', module: 'purchases' },
      { id: 'po-reorder', label: 'Auto Reorder Suggestions', status: 'live', module: 'purchases' },
      { id: 'po-supplier-analytics', label: 'Supplier Performance Analytics', status: 'live', module: 'purchases' },
    ],
  },
  {
    title: 'CRM',
    icon: '👥',
    items: [
      { id: 'crm-basic', label: 'Customer Management', status: 'live', module: 'crm' },
      { id: 'crm-segmentation', label: 'Customer Segmentation', status: 'live', module: 'crm' },
      { id: 'crm-vip', label: 'VIP Customers (Tiers)', status: 'live', module: 'crm' },
      { id: 'crm-groups', label: 'Customer Groups', status: 'planned', module: 'crm' },
      { id: 'crm-loyalty-tiers', label: 'Loyalty Tiers', status: 'live', module: 'crm' },
      { id: 'crm-wallet', label: 'Customer Wallet', status: 'live', module: 'crm' },
      { id: 'crm-clv', label: 'Customer Lifetime Value', status: 'live', module: 'crm' },
      { id: 'crm-rfm', label: 'RFM Analysis', status: 'planned', module: 'crm' },
    ],
  },
  {
    title: 'Analytics',
    icon: '📊',
    items: [
      { id: 'an-dashboard', label: 'Dashboard Widgets', status: 'live', module: 'analytics' },
      { id: 'an-gross-profit', label: 'Gross Profit', status: 'live', module: 'analytics' },
      { id: 'an-net-profit', label: 'Net Profit', status: 'live', module: 'analytics' },
      { id: 'an-margin', label: 'Margin %', status: 'live', module: 'analytics' },
      { id: 'an-top-categories', label: 'Top Categories', status: 'live', module: 'analytics' },
      { id: 'an-top-branches', label: 'Top Branches', status: 'live', module: 'analytics' },
      { id: 'an-turnover', label: 'Inventory Turnover', status: 'live', module: 'analytics' },
      { id: 'an-customer-growth', label: 'Customer Growth', status: 'live', module: 'analytics' },
      { id: 'an-revenue-trends', label: 'Revenue Trends', status: 'live', module: 'analytics' },
      { id: 'an-heatmap', label: 'Heat Maps', status: 'planned', module: 'analytics' },
    ],
  },
  {
    title: 'Accounts',
    icon: '💵',
    items: [
      { id: 'acc-coa', label: 'Chart of Accounts', status: 'live', module: 'accounting' },
      { id: 'acc-journal', label: 'Journal Entries', status: 'live', module: 'accounting' },
      { id: 'acc-trial', label: 'Trial Balance', status: 'live', module: 'accounting' },
      { id: 'acc-bs', label: 'Balance Sheet', status: 'live', module: 'accounting' },
      { id: 'acc-pl', label: 'Profit & Loss', status: 'live', module: 'accounting' },
      { id: 'acc-ar', label: 'Accounts Receivable', status: 'live', module: 'accounting' },
      { id: 'acc-ap', label: 'Accounts Payable', status: 'live', module: 'accounting' },
      { id: 'acc-bank-rec', label: 'Bank Reconciliation', status: 'planned', module: 'accounting' },
    ],
  },
  {
    title: 'HR & Staff',
    icon: '👨‍💼',
    items: [
      { id: 'hr-employees', label: 'Employee Management', status: 'live', module: 'hr' },
      { id: 'hr-attendance', label: 'Attendance', status: 'live', module: 'hr' },
      { id: 'hr-leave', label: 'Leave Management', status: 'live', module: 'hr' },
      { id: 'hr-payroll', label: 'Payroll', status: 'live', module: 'hr' },
      { id: 'hr-commission', label: 'Commission Tracking', status: 'planned', module: 'hr' },
      { id: 'hr-incentives', label: 'Incentives', status: 'planned', module: 'hr' },
      { id: 'hr-performance', label: 'Staff Performance Score', status: 'planned', module: 'hr' },
    ],
  },
  {
    title: 'Security',
    icon: '🔐',
    items: [
      { id: 'sec-audit', label: 'Audit Logs', status: 'live', module: 'security' },
      { id: 'sec-session', label: 'Session Management', status: 'live', module: 'security' },
      { id: 'sec-device', label: 'Device Tracking', status: 'planned', module: 'security' },
      { id: 'sec-login-history', label: 'Login History', status: 'live', module: 'security' },
      { id: 'sec-ip', label: 'IP Restrictions', status: 'planned', module: 'security' },
      { id: 'sec-2fa', label: '2FA', status: 'planned', module: 'security' },
      { id: 'sec-permissions', label: 'Permission Matrix', status: 'live', module: 'security' },
    ],
  },
  {
    title: 'SaaS Platform',
    icon: '☁️',
    items: [
      { id: 'saas-features', label: 'Feature Toggle System', status: 'live', module: 'saas' },
      { id: 'saas-plans', label: 'Plan-Based Access', status: 'live', module: 'saas' },
      { id: 'saas-limits', label: 'Usage Limits', status: 'live', module: 'saas' },
      { id: 'saas-billing', label: 'Billing Engine', status: 'live', module: 'saas' },
      { id: 'saas-lifecycle', label: 'Subscription Lifecycle', status: 'live', module: 'saas' },
      { id: 'saas-tenant-analytics', label: 'Tenant Analytics', status: 'live', module: 'saas' },
      { id: 'saas-white-label', label: 'White Labeling', status: 'planned', module: 'saas' },
    ],
  },
  {
    title: 'Workflow Engine',
    icon: '⚙️',
    items: [
      { id: 'wf-po', label: 'PO → Manager → Finance → GRN', status: 'live', module: 'workflow' },
      { id: 'wf-discount', label: 'Discount Request Approval', status: 'live', module: 'workflow' },
      { id: 'wf-adjust', label: 'Stock Adjustment Approval', status: 'live', module: 'workflow' },
      { id: 'wf-transfer', label: 'Stock Transfer Approval', status: 'live', module: 'workflow' },
      { id: 'wf-audit', label: 'Workflow Audit Trail', status: 'live', module: 'workflow' },
    ],
  },
];

export const INDUSTRY_MODULES = [
  {
    type: 'CLOTHING',
    emoji: '👕',
    items: [
      { label: 'Size Matrix Grid', status: 'live' as const },
      { label: 'Season Collections', status: 'partial' as const },
      { label: 'Fashion Analytics', status: 'live' as const },
    ],
  },
  {
    type: 'GROCERY',
    emoji: '🛒',
    items: [
      { label: 'Expiry Dashboard', status: 'live' as const },
      { label: 'Near Expiry Sales', status: 'partial' as const },
      { label: 'Batch Profit Analysis', status: 'partial' as const },
    ],
  },
  {
    type: 'HARDWARE',
    emoji: '🔧',
    items: [
      { label: 'Unit Conversion Engine', status: 'live' as const },
      { label: 'Bundle Items', status: 'planned' as const },
    ],
  },
  {
    type: 'AGRICULTURE',
    emoji: '🌾',
    items: [
      { label: 'Farmer Accounts', status: 'live' as const },
      { label: 'Fertilizer Batch Tracking', status: 'live' as const },
      { label: 'Seasonal Purchase Analysis', status: 'partial' as const },
    ],
  },
];

export function countByStatus(items: Capability[]) {
  return {
    live: items.filter((i) => i.status === 'live').length,
    partial: items.filter((i) => i.status === 'partial').length,
    planned: items.filter((i) => i.status === 'planned').length,
  };
}

export function allCapabilities() {
  return ERP_MODULES.flatMap((m) => m.items);
}
