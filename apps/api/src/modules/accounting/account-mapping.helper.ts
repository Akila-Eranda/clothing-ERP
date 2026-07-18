/** Account mapping keys and default GL code fallbacks (Hexalyte Full Align). */

export const ACCOUNT_MAPPING_KEYS = [
  'CASH',
  'PETTY_CASH',
  'BANK',
  'CARD_CLEARING',
  'UPI_CLEARING',
  'AR',
  'AP',
  'VAT_OUTPUT',
  'VAT_INPUT',
  'INV_MOBILE',
  'INV_ACCESSORY',
  'INV_SPARE',
  'SALES_MOBILE',
  'SALES_ACCESSORY',
  'SERVICE_INCOME',
  'REPAIR_INCOME',
  'RELOAD_COMMISSION',
  'COGS_MOBILE',
  'COGS_ACCESSORY',
  'COGS_REPAIR',
  'OPERATING_EXPENSE',
  'CASH_OVER_SHORT',
  'SALES_RETURNS',
  'RETAINED_EARNINGS',
  'SALARY_PAYABLE',
  'EPF_PAYABLE',
  'ETF_PAYABLE',
] as const;

export type AccountMappingKey = (typeof ACCOUNT_MAPPING_KEYS)[number];

export const ACCOUNT_MAPPING_LABELS: Record<AccountMappingKey, string> = {
  CASH: 'Cash on Hand',
  PETTY_CASH: 'Petty Cash',
  BANK: 'Bank — Main',
  CARD_CLEARING: 'Card Clearing',
  UPI_CLEARING: 'UPI / Wallet Clearing',
  AR: 'Accounts Receivable',
  AP: 'Accounts Payable',
  VAT_OUTPUT: 'VAT Output Payable',
  VAT_INPUT: 'VAT Input',
  INV_MOBILE: 'Inventory — Mobile / Products',
  INV_ACCESSORY: 'Inventory — Accessories',
  INV_SPARE: 'Inventory — Spare Parts',
  SALES_MOBILE: 'Sales Revenue — Mobile / Products',
  SALES_ACCESSORY: 'Sales Revenue — Accessories',
  SERVICE_INCOME: 'Service Income',
  REPAIR_INCOME: 'Repair Income',
  RELOAD_COMMISSION: 'Reload Commission',
  COGS_MOBILE: 'COGS — Mobile / Products',
  COGS_ACCESSORY: 'COGS — Accessories',
  COGS_REPAIR: 'Repair Parts COGS',
  OPERATING_EXPENSE: 'Operating Expenses',
  CASH_OVER_SHORT: 'Cash Over / Short',
  SALES_RETURNS: 'Sales Returns & Allowances',
  RETAINED_EARNINGS: 'Retained Earnings',
  SALARY_PAYABLE: 'Salary Payable',
  EPF_PAYABLE: 'EPF Payable',
  ETF_PAYABLE: 'ETF Payable',
};

/** Preferred codes first (report-style + legacy compatibility). */
export const ACCOUNT_MAPPING_CODE_FALLBACKS: Record<AccountMappingKey, string[]> = {
  CASH: ['1100', '1000'],
  PETTY_CASH: ['1110', '1010'],
  BANK: ['1200', '1100'],
  CARD_CLEARING: ['1210', '1110', '1200'],
  UPI_CLEARING: ['1120', '1210', '1200'],
  AR: ['1300', '1200'],
  AP: ['2100'],
  VAT_OUTPUT: ['2200'],
  VAT_INPUT: ['2210'],
  INV_MOBILE: ['1400', '1300'],
  INV_ACCESSORY: ['1310', '1400'],
  INV_SPARE: ['1320', '1400'],
  SALES_MOBILE: ['4100', '4000'],
  SALES_ACCESSORY: ['4010', '4100', '4000'],
  SERVICE_INCOME: ['4020', '4100', '4000'],
  REPAIR_INCOME: ['4030', '4020', '4100'],
  RELOAD_COMMISSION: ['4040', '4100'],
  COGS_MOBILE: ['5100', '5000'],
  COGS_ACCESSORY: ['5110', '5100'],
  COGS_REPAIR: ['5120', '5100'],
  OPERATING_EXPENSE: ['5600', '5200', '5000'],
  CASH_OVER_SHORT: ['5700', '5200'],
  SALES_RETURNS: ['4200', '5999', '4100'],
  RETAINED_EARNINGS: ['3100'],
  SALARY_PAYABLE: ['2300'],
  EPF_PAYABLE: ['2310'],
  ETF_PAYABLE: ['2320', '2311'],
};

export type InventoryKind = 'mobile' | 'accessory' | 'spare' | 'service' | 'reload';

/** Heuristic product/line classification for revenue & inventory splits. */
export function classifyInventoryKind(input: {
  categoryName?: string | null;
  productName?: string | null;
  tags?: string[] | null;
  lineType?: string | null;
}): InventoryKind {
  const line = String(input.lineType ?? '').toUpperCase();
  if (line === 'LABOR' || line === 'SERVICE') return 'service';
  if (line === 'PART') return 'spare';

  const blob = [
    input.categoryName,
    input.productName,
    ...(input.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!blob) return 'mobile';
  if (/\b(reload|top.?up|airtime|commission)\b/.test(blob)) return 'reload';
  if (/\b(repair|spare|part|oem)\b/.test(blob)) return 'spare';
  if (/\b(service|labour|labor|fitting)\b/.test(blob)) return 'service';
  if (/\baccessories?\b|\b(case|charger|cable|cover|glass|tempered|earbud|headphone)s?\b/.test(blob)) {
    return 'accessory';
  }
  if (/\b(phone|mobile|iphone|samsung|device)\b/.test(blob)) return 'mobile';
  return 'mobile';
}
