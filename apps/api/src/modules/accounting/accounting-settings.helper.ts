/** Phase 06 Sprint 13 — Accounting settings helpers (pure). */

export type NumberSeriesResetPolicy = 'NEVER' | 'YEARLY' | 'MONTHLY' | 'DAILY';

export type NumberSeriesKey =
  | 'JOURNAL'
  | 'INVOICE'
  | 'PURCHASE_ORDER'
  | 'PURCHASE_REQUEST'
  | 'GRN'
  | 'DEBIT_NOTE'
  | 'PAYSLIP'
  | 'RETURN'
  | 'YEAR_END_JOURNAL';

export type NumberSeriesDefaults = {
  key: NumberSeriesKey;
  name: string;
  prefix: string;
  includeYear: boolean;
  includeMonth: boolean;
  padLength: number;
  resetPolicy: NumberSeriesResetPolicy;
  description: string;
};

export const DEFAULT_NUMBER_SERIES: NumberSeriesDefaults[] = [
  {
    key: 'JOURNAL',
    name: 'Journal Entry',
    prefix: 'JE',
    includeYear: true,
    includeMonth: false,
    padLength: 5,
    resetPolicy: 'YEARLY',
    description: 'Manual and system journal entries',
  },
  {
    key: 'INVOICE',
    name: 'Sales Invoice',
    prefix: 'INV',
    includeYear: true,
    includeMonth: true,
    padLength: 4,
    resetPolicy: 'DAILY',
    description: 'POS / sales invoices (legacy: INV-YYYYMMDD-####)',
  },
  {
    key: 'PURCHASE_ORDER',
    name: 'Purchase Order',
    prefix: 'PO',
    includeYear: true,
    includeMonth: false,
    padLength: 5,
    resetPolicy: 'YEARLY',
    description: 'Supplier purchase orders',
  },
  {
    key: 'PURCHASE_REQUEST',
    name: 'Purchase Request',
    prefix: 'PR',
    includeYear: true,
    includeMonth: false,
    padLength: 5,
    resetPolicy: 'YEARLY',
    description: 'Internal purchase requests',
  },
  {
    key: 'GRN',
    name: 'Goods Receipt',
    prefix: 'GRN',
    includeYear: true,
    includeMonth: false,
    padLength: 5,
    resetPolicy: 'YEARLY',
    description: 'Goods received notes',
  },
  {
    key: 'DEBIT_NOTE',
    name: 'Debit Note',
    prefix: 'DN',
    includeYear: true,
    includeMonth: false,
    padLength: 5,
    resetPolicy: 'YEARLY',
    description: 'Supplier debit notes',
  },
  {
    key: 'PAYSLIP',
    name: 'Payslip',
    prefix: 'PS',
    includeYear: true,
    includeMonth: true,
    padLength: 4,
    resetPolicy: 'MONTHLY',
    description: 'Employee payslips',
  },
  {
    key: 'RETURN',
    name: 'Sales Return',
    prefix: 'RET',
    includeYear: true,
    includeMonth: false,
    padLength: 5,
    resetPolicy: 'YEARLY',
    description: 'Customer returns / exchanges',
  },
  {
    key: 'YEAR_END_JOURNAL',
    name: 'Year-end Journal',
    prefix: 'YE',
    includeYear: true,
    includeMonth: false,
    padLength: 4,
    resetPolicy: 'YEARLY',
    description: 'Fiscal year closing journals',
  },
];

export type SeriesFormatInput = {
  prefix: string;
  includeYear: boolean;
  includeMonth: boolean;
  padLength: number;
  seq: number;
  date: Date;
};

export function computeResetKey(policy: NumberSeriesResetPolicy, date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  if (policy === 'NEVER') return 'NEVER';
  if (policy === 'YEARLY') return String(y);
  if (policy === 'MONTHLY') return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

export function formatDocumentNumber(input: SeriesFormatInput): string {
  const pad = Math.min(12, Math.max(1, input.padLength || 5));
  const seq = String(Math.max(1, input.seq)).padStart(pad, '0');
  const parts = [input.prefix.trim() || 'DOC'];
  if (input.includeYear) parts.push(String(input.date.getUTCFullYear()));
  if (input.includeMonth) {
    parts.push(String(input.date.getUTCMonth() + 1).padStart(2, '0'));
  }
  parts.push(seq);
  return parts.join('-');
}

export function previewDocumentNumber(series: {
  prefix: string;
  includeYear: boolean;
  includeMonth: boolean;
  padLength: number;
  nextValue: number;
}, at = new Date()): string {
  return formatDocumentNumber({
    prefix: series.prefix,
    includeYear: series.includeYear,
    includeMonth: series.includeMonth,
    padLength: series.padLength,
    seq: series.nextValue,
    date: at,
  });
}

export type AccountingPreferenceDefaults = {
  requireJournalApproval: boolean;
  allowPostDraft: boolean;
  blockPostingClosedPeriod: boolean;
  fiscalYearStartMonth: number;
  decimalPlaces: number;
};

export const DEFAULT_ACCOUNTING_PREFERENCES: AccountingPreferenceDefaults = {
  requireJournalApproval: true,
  allowPostDraft: false,
  blockPostingClosedPeriod: true,
  fiscalYearStartMonth: 1,
  decimalPlaces: 2,
};

export function assertFiscalYearStartMonth(month: number): number {
  const m = Math.trunc(month);
  if (m < 1 || m > 12) throw new Error('Fiscal year start month must be 1–12');
  return m;
}

export function assertDecimalPlaces(n: number): number {
  const d = Math.trunc(n);
  if (d < 0 || d > 4) throw new Error('Decimal places must be 0–4');
  return d;
}

export function assertPadLength(n: number): number {
  const p = Math.trunc(n);
  if (p < 1 || p > 12) throw new Error('Pad length must be 1–12');
  return p;
}

export function assertNextValue(n: number): number {
  const v = Math.trunc(n);
  if (v < 1) throw new Error('Next value must be at least 1');
  return v;
}

export const WORKFLOW_APPROVER_ROLES = [
  'TENANT_ADMIN',
  'BRANCH_MANAGER',
  'ACCOUNTANT',
  'INVENTORY_MANAGER',
  'CASHIER',
] as const;

export const CURRENCY_OPTIONS = ['LKR', 'INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'] as const;
