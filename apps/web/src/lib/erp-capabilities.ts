/** HexaOne capability matrix — live vs partial vs planned */

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
  { rank: 6, label: 'Vehicle Parts Module', status: 'live' as const },
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
      { id: 'inv-warehouse', label: 'Multi Warehouse', status: 'live', module: 'inventory' },
      { id: 'inv-warehouse-transfers', label: 'Warehouse Transfers', status: 'live', module: 'inventory' },
      { id: 'inv-warehouse-stock', label: 'Warehouse Stock', status: 'live', module: 'inventory' },
      { id: 'inv-warehouse-dash', label: 'Warehouse Dashboard', status: 'live', module: 'inventory' },
      { id: 'inv-ledger', label: 'Inventory Ledger', status: 'live', module: 'inventory', priority: 1 },
      { id: 'inv-reserved', label: 'Reserved Stock', status: 'live', module: 'inventory' },
      { id: 'inv-available', label: 'Available Stock', status: 'live', module: 'inventory' },
      { id: 'inv-damaged', label: 'Damaged Stock', status: 'live', module: 'inventory' },
      { id: 'inv-returned', label: 'Returned Stock', status: 'live', module: 'inventory' },
      { id: 'inv-batch', label: 'Batch-wise Stock', status: 'live', module: 'inventory' },
      { id: 'inv-near-expiry', label: 'Near Expiry', status: 'live', module: 'inventory' },
      { id: 'inv-expired', label: 'Expired Stock', status: 'live', module: 'inventory' },
      { id: 'inv-expiry-dash', label: 'Expiry Dashboard', status: 'live', module: 'inventory' },
      { id: 'inv-expiry-reports', label: 'Expiry Reports', status: 'live', module: 'inventory' },
      { id: 'inv-block-expired', label: 'POS Block Expired', status: 'live', module: 'inventory' },
      { id: 'inv-fefo', label: 'FEFO Lot Allocation at POS', status: 'live', module: 'inventory' },
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
      { id: 'pos-qty-popup', label: 'Quantity Popup', status: 'live', module: 'pos' },
      { id: 'pos-touch', label: 'Touch Mode', status: 'live', module: 'pos' },
      { id: 'pos-sound', label: 'Sound Alerts', status: 'live', module: 'pos' },
      { id: 'pos-helper', label: 'Helper Commission', status: 'live', module: 'pos' },
      { id: 'pos-reprint', label: 'Reprint Bill', status: 'live', module: 'pos' },
      { id: 'pos-customer-display', label: 'Customer Display', status: 'live', module: 'pos' },
      { id: 'pos-store-credit', label: 'Store Credit (Wallet)', status: 'live', module: 'pos' },
      { id: 'pos-partial-pay', label: 'Partial Payments', status: 'live', module: 'pos' },
    ],
  },
  {
    title: 'Cash Management',
    icon: '💵',
    items: [
      { id: 'cash-daily-close', label: 'Daily Cash Close', status: 'live', module: 'cash' },
      { id: 'cash-shift', label: 'Shift Management (Open/Close)', status: 'live', module: 'cash' },
      { id: 'cash-in-out', label: 'Cash In / Cash Out', status: 'live', module: 'cash' },
      { id: 'cash-variance', label: 'Cash Variance Approval', status: 'live', module: 'cash' },
      { id: 'cash-petty', label: 'Petty Cash (Shift Expenses)', status: 'live', module: 'cash' },
      { id: 'cash-history', label: 'Cash History & Reports', status: 'live', module: 'cash' },
      { id: 'cash-bank-deposit', label: 'Bank Deposit Tracking', status: 'planned', module: 'cash' },
      { id: 'cash-branch-transfer', label: 'Branch Cash Transfer', status: 'planned', module: 'cash' },
      { id: 'cash-safe', label: 'Safe Deposit Tracking', status: 'planned', module: 'cash' },
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
      { id: 'acc-credit-customers', label: 'Credit Customers', status: 'live', module: 'accounting' },
      { id: 'acc-credit-due', label: 'Credit Due Dates', status: 'live', module: 'accounting' },
      { id: 'acc-credit-schedule', label: 'Payment Schedules', status: 'live', module: 'accounting' },
      { id: 'acc-credit-reminders', label: 'Credit Reminders', status: 'live', module: 'accounting' },
      { id: 'acc-collections', label: 'Collection Reports', status: 'live', module: 'accounting' },
      { id: 'acc-calendar', label: 'Business Calendar', status: 'live', module: 'accounting' },
      { id: 'acc-cash-book', label: 'Cash Book', status: 'live', module: 'accounting' },
      { id: 'acc-bank', label: 'Bank Accounts', status: 'live', module: 'accounting' },
      { id: 'acc-cheques', label: 'Cheque Management', status: 'live', module: 'accounting' },
      { id: 'acc-bank-rec', label: 'Bank Reconciliation', status: 'live', module: 'accounting' },
      { id: 'acc-expenses', label: 'Daily Expenses', status: 'live', module: 'accounting' },
    ],
  },
  {
    title: 'Notifications',
    icon: '🔔',
    items: [
      { id: 'ntf-low-stock', label: 'Low Stock Alerts', status: 'live', module: 'notifications' },
      { id: 'ntf-reorder', label: 'Reorder Alerts', status: 'live', module: 'notifications' },
      { id: 'ntf-expiry', label: 'Expiry Alerts', status: 'live', module: 'notifications' },
      { id: 'ntf-customer-due', label: 'Customer Due Alerts', status: 'live', module: 'notifications' },
      { id: 'ntf-supplier-due', label: 'Supplier Due Alerts', status: 'live', module: 'notifications' },
      { id: 'ntf-cheques', label: 'Cheque Due Alerts', status: 'live', module: 'notifications' },
      { id: 'ntf-grn', label: 'GRN Pending Alerts', status: 'live', module: 'notifications' },
      { id: 'ntf-po', label: 'PO Pending Alerts', status: 'live', module: 'notifications' },
      { id: 'ntf-daily', label: 'Daily Summary', status: 'live', module: 'notifications' },
    ],
  },
  {
    title: 'Reports',
    icon: '📊',
    items: [
      { id: 'rpt-sales', label: 'Sales Reports', status: 'live', module: 'reports' },
      { id: 'rpt-purchases', label: 'Purchase Reports', status: 'live', module: 'reports' },
      { id: 'rpt-inventory', label: 'Inventory Reports', status: 'live', module: 'reports' },
      { id: 'rpt-suppliers', label: 'Supplier Reports', status: 'live', module: 'reports' },
      { id: 'rpt-customers', label: 'Customer Reports', status: 'live', module: 'reports' },
      { id: 'rpt-cashier', label: 'Cashier Reports', status: 'live', module: 'reports' },
      { id: 'rpt-branches', label: 'Branch Reports', status: 'live', module: 'reports' },
      { id: 'rpt-tax', label: 'Tax Reports', status: 'live', module: 'reports' },
      { id: 'rpt-expiry', label: 'Expiry Reports', status: 'live', module: 'reports' },
      { id: 'rpt-cheques', label: 'Cheque Reports', status: 'live', module: 'reports' },
      { id: 'rpt-commission', label: 'Commission Reports', status: 'live', module: 'reports' },
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
      { id: 'hr-commission', label: 'Commission Tracking', status: 'live', module: 'hr' },
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
      { label: 'Near Expiry / Expired', status: 'live' as const },
      { label: 'POS Block Expired', status: 'live' as const },
      { label: 'FEFO at POS', status: 'live' as const },
      { label: 'GRN Batch / Expiry Capture', status: 'live' as const },
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
  {
    type: 'SPARE_PARTS',
    emoji: '🚗',
    items: [
      { label: 'Vehicle Compatibility', status: 'live' as const },
      { label: 'Warranty Claims', status: 'live' as const },
      { label: 'Quotations', status: 'live' as const },
      { label: 'VIN / Chassis Lookup', status: 'live' as const },
    ],
  },
  {
    type: 'TIRE_SHOP',
    emoji: '🛞',
    items: [
      { label: 'Tyre Size Fitment', status: 'live' as const },
      { label: 'Vehicle Compatibility', status: 'live' as const },
      { label: 'Warranty Claims', status: 'live' as const },
      { label: 'Fleet Quotations', status: 'live' as const },
    ],
  },
  {
    type: 'GENERAL',
    emoji: '🏪',
    items: [
      { label: 'Mixed Product Catalog', status: 'live' as const },
      { label: 'Barcode POS', status: 'live' as const },
      { label: 'Quotations', status: 'live' as const },
      { label: 'Loyalty & Promotions', status: 'live' as const },
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
