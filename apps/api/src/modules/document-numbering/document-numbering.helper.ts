/** Shared document numbering — pure helpers (format, defaults, validation). */

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
  | 'EXCHANGE'
  | 'SUPPLIER_RETURN'
  | 'SUPPLIER_INVOICE'
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
    description: 'Customer returns',
  },
  {
    key: 'EXCHANGE',
    name: 'Sales Exchange',
    prefix: 'EXC',
    includeYear: true,
    includeMonth: false,
    padLength: 5,
    resetPolicy: 'YEARLY',
    description: 'Customer exchanges',
  },
  {
    key: 'SUPPLIER_RETURN',
    name: 'Supplier Return',
    prefix: 'SRET',
    includeYear: true,
    includeMonth: false,
    padLength: 5,
    resetPolicy: 'YEARLY',
    description: 'Returns to supplier',
  },
  {
    key: 'SUPPLIER_INVOICE',
    name: 'Supplier Invoice',
    prefix: 'SINV',
    includeYear: true,
    includeMonth: false,
    padLength: 5,
    resetPolicy: 'YEARLY',
    description: 'Supplier invoices / bills',
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

export const NUMBER_SERIES_KEYS = DEFAULT_NUMBER_SERIES.map((d) => d.key);

export type SeriesFormatInput = {
  prefix: string;
  includeYear: boolean;
  includeMonth: boolean;
  padLength: number;
  seq: number;
  date: Date;
  /** When true with year+month → PREFIX-YYYYMMDD-SEQ (POS legacy invoice style). */
  compactDate?: boolean;
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
  const prefix = input.prefix.trim() || 'DOC';

  if (input.compactDate && input.includeYear && input.includeMonth) {
    const y = input.date.getUTCFullYear();
    const m = String(input.date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(input.date.getUTCDate()).padStart(2, '0');
    return `${prefix}-${y}${m}${d}-${seq}`;
  }

  const parts = [prefix];
  if (input.includeYear) parts.push(String(input.date.getUTCFullYear()));
  if (input.includeMonth) {
    parts.push(String(input.date.getUTCMonth() + 1).padStart(2, '0'));
  }
  parts.push(seq);
  return parts.join('-');
}

/** Daily + year + month → compact YYYYMMDD (matches legacy POS INV-YYYYMMDD-####). */
export function shouldUseCompactDate(series: {
  includeYear: boolean;
  includeMonth: boolean;
  resetPolicy: NumberSeriesResetPolicy | string;
}): boolean {
  return series.includeYear && series.includeMonth && series.resetPolicy === 'DAILY';
}

export function previewDocumentNumber(
  series: {
    prefix: string;
    includeYear: boolean;
    includeMonth: boolean;
    padLength: number;
    nextValue: number;
    resetPolicy?: NumberSeriesResetPolicy | string;
  },
  at = new Date(),
): string {
  return formatDocumentNumber({
    prefix: series.prefix,
    includeYear: series.includeYear,
    includeMonth: series.includeMonth,
    padLength: series.padLength,
    seq: series.nextValue,
    date: at,
    compactDate: series.resetPolicy
      ? shouldUseCompactDate({
          includeYear: series.includeYear,
          includeMonth: series.includeMonth,
          resetPolicy: series.resetPolicy,
        })
      : false,
  });
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

export function isValidSeriesKey(key: string): key is NumberSeriesKey {
  return (NUMBER_SERIES_KEYS as string[]).includes(key);
}
