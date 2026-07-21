/** Phase 06 Sprint 13 — Accounting settings helpers (re-exports + accounting-only prefs). */

export {
  assertNextValue,
  assertPadLength,
  computeResetKey,
  DEFAULT_NUMBER_SERIES,
  formatDocumentNumber,
  previewDocumentNumber,
  shouldUseCompactDate,
  type NumberSeriesDefaults,
  type NumberSeriesKey,
  type NumberSeriesResetPolicy,
  type SeriesFormatInput,
} from '@/modules/document-numbering/document-numbering.helper';

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

export const WORKFLOW_APPROVER_ROLES = [
  'TENANT_ADMIN',
  'BRANCH_MANAGER',
  'ACCOUNTANT',
  'INVENTORY_MANAGER',
  'CASHIER',
] as const;

export const CURRENCY_OPTIONS = ['LKR', 'INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'] as const;
