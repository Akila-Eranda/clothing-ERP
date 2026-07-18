/** Phase 01 Sprint 1 — Chart of Accounts helpers (pure, unit-tested). */

import { AccountType } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

export type CoaTypeRange = { start: number; end: number; label: string };

/** Standard retail COA code ranges. Income maps to REVENUE. */
export const COA_TYPE_RANGES: Record<AccountType, CoaTypeRange> = {
  ASSET: { start: 1000, end: 1999, label: 'Assets' },
  LIABILITY: { start: 2000, end: 2999, label: 'Liabilities' },
  EQUITY: { start: 3000, end: 3999, label: 'Equity' },
  REVENUE: { start: 4000, end: 4999, label: 'Income' },
  EXPENSE: { start: 5000, end: 5999, label: 'Expenses' },
};

export function normalizeAccountCode(code: string): string {
  return String(code ?? '').trim().toUpperCase();
}

export function parseNumericCode(code: string): number | null {
  const n = parseInt(normalizeAccountCode(code).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/** Suggest next code in type range (or under parent prefix). */
export function suggestNextAccountCode(params: {
  type: AccountType;
  existingCodes: string[];
  parentCode?: string | null;
}): string {
  const range = COA_TYPE_RANGES[params.type];
  const numeric = params.existingCodes
    .map(parseNumericCode)
    .filter((n): n is number => n != null && n >= range.start && n <= range.end);

  if (params.parentCode) {
    const parentNum = parseNumericCode(params.parentCode);
    if (parentNum != null) {
      const siblings = numeric.filter((n) => n > parentNum && n < parentNum + 100);
      const next = siblings.length ? Math.max(...siblings) + 1 : parentNum + 1;
      if (next <= range.end && next < parentNum + 100) {
        return String(next);
      }
    }
  }

  if (!numeric.length) return String(range.start);
  const max = Math.max(...numeric);
  const next = max + 1;
  if (next > range.end) {
    throw new BadRequestException(
      `No free account codes left in ${range.label} range (${range.start}–${range.end})`,
    );
  }
  return String(next);
}

export function assertCodeInTypeRange(code: string, type: AccountType): void {
  const n = parseNumericCode(code);
  if (n == null) return; // allow alphanumeric codes
  const range = COA_TYPE_RANGES[type];
  if (n < range.start || n > range.end) {
    throw new BadRequestException(
      `Code ${code} is outside ${range.label} range (${range.start}–${range.end})`,
    );
  }
}

export function assertValidParent(params: {
  parentId: string | null | undefined;
  accountId?: string;
  parent: { id: string; type: AccountType; isActive: boolean } | null;
  type: AccountType;
  descendantIds?: Set<string>;
}): void {
  if (!params.parentId) return;
  if (!params.parent || !params.parent.isActive) {
    throw new BadRequestException('Parent account not found or inactive');
  }
  if (params.parent.type !== params.type) {
    throw new BadRequestException('Parent account must be the same account type');
  }
  if (params.accountId && params.parentId === params.accountId) {
    throw new BadRequestException('Account cannot be its own parent');
  }
  if (params.accountId && params.descendantIds?.has(params.parentId)) {
    throw new BadRequestException('Cannot set a descendant as parent (cycle)');
  }
}

export type CoaTreeNode = {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  type: AccountType;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  balance: number;
  openingBalance: number;
  openingBalanceDate: Date | string | null;
  depth: number;
  children: CoaTreeNode[];
};

export function buildAccountTree<T extends {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  type: AccountType;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  balance: number;
  openingBalance: number;
  openingBalanceDate: Date | string | null;
}>(rows: T[]): CoaTreeNode[] {
  const byId = new Map<string, CoaTreeNode>();
  for (const r of rows) {
    byId.set(r.id, {
      ...r,
      depth: 0,
      children: [],
    });
  }
  const roots: CoaTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      const parent = byId.get(node.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: CoaTreeNode[]) => {
    nodes.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  // Fix depths after attach (BFS)
  const queue = [...roots];
  while (queue.length) {
    const n = queue.shift()!;
    for (const c of n.children) {
      c.depth = n.depth + 1;
      queue.push(c);
    }
  }
  return roots;
}

export function flattenAccountTree(nodes: CoaTreeNode[]): CoaTreeNode[] {
  const out: CoaTreeNode[] = [];
  const walk = (list: CoaTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function collectDescendantIds(
  accountId: string,
  rows: { id: string; parentId: string | null }[],
): Set<string> {
  const childrenMap = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const list = childrenMap.get(r.parentId) ?? [];
    list.push(r.id);
    childrenMap.set(r.parentId, list);
  }
  const out = new Set<string>();
  const stack = [...(childrenMap.get(accountId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of childrenMap.get(id) ?? []) stack.push(c);
  }
  return out;
}

/** Default starter COA for a new shop (additive Hexalyte retail / mobile splits). */
export function defaultCoaSeed(): {
  code: string;
  name: string;
  type: AccountType;
  description?: string;
  parentCode?: string;
}[] {
  return [
    { code: '1000', name: 'Current Assets', type: AccountType.ASSET, description: 'Cash and short-term assets' },
    { code: '1100', name: 'Cash on Hand', type: AccountType.ASSET, parentCode: '1000' },
    { code: '1110', name: 'Petty Cash', type: AccountType.ASSET, parentCode: '1000' },
    { code: '1200', name: 'Bank — Main', type: AccountType.ASSET, parentCode: '1000' },
    { code: '1210', name: 'Card Clearing', type: AccountType.ASSET, parentCode: '1000', description: 'Card settlement clearing' },
    { code: '1120', name: 'UPI / Wallet Clearing', type: AccountType.ASSET, parentCode: '1000', description: 'UPI and digital wallet clearing' },
    { code: '1220', name: 'Cheques Receivable', type: AccountType.ASSET, parentCode: '1000', description: 'Customer cheques awaiting clearance' },
    { code: '1300', name: 'Accounts Receivable', type: AccountType.ASSET, parentCode: '1000' },
    { code: '1400', name: 'Inventory — Mobile Devices', type: AccountType.ASSET, parentCode: '1000' },
    { code: '1310', name: 'Inventory — Accessories', type: AccountType.ASSET, parentCode: '1000' },
    { code: '1320', name: 'Inventory — Spare Parts', type: AccountType.ASSET, parentCode: '1000' },
    { code: '1500', name: 'Fixed Assets', type: AccountType.ASSET, parentCode: '1000' },
    { code: '1510', name: 'Property Plant & Equipment', type: AccountType.ASSET, parentCode: '1500' },
    { code: '1590', name: 'Accumulated Depreciation', type: AccountType.ASSET, parentCode: '1500' },
    { code: '2000', name: 'Current Liabilities', type: AccountType.LIABILITY },
    { code: '2100', name: 'Accounts Payable', type: AccountType.LIABILITY, parentCode: '2000' },
    { code: '2200', name: 'VAT Output Payable', type: AccountType.LIABILITY, parentCode: '2000' },
    { code: '2210', name: 'VAT Input Receivable', type: AccountType.ASSET, parentCode: '1000' },
    { code: '2300', name: 'Salary Payable', type: AccountType.LIABILITY, parentCode: '2000' },
    { code: '2310', name: 'EPF Payable', type: AccountType.LIABILITY, parentCode: '2000' },
    { code: '2320', name: 'ETF Payable', type: AccountType.LIABILITY, parentCode: '2000' },
    { code: '2400', name: 'Customer Wallet Advances', type: AccountType.LIABILITY, parentCode: '2000' },
    { code: '2410', name: 'Gift Voucher Liability', type: AccountType.LIABILITY, parentCode: '2000' },
    { code: '2420', name: 'Cheques Payable', type: AccountType.LIABILITY, parentCode: '2000' },
    { code: '3000', name: 'Owner Equity', type: AccountType.EQUITY },
    { code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, parentCode: '3000' },
    { code: '4000', name: 'Sales Income', type: AccountType.REVENUE },
    { code: '4100', name: 'Sales Revenue — Mobile', type: AccountType.REVENUE, parentCode: '4000' },
    { code: '4010', name: 'Sales Revenue — Accessories', type: AccountType.REVENUE, parentCode: '4000' },
    { code: '4020', name: 'Service Income', type: AccountType.REVENUE, parentCode: '4000' },
    { code: '4030', name: 'Repair Income', type: AccountType.REVENUE, parentCode: '4000' },
    { code: '4040', name: 'Reload Commission', type: AccountType.REVENUE, parentCode: '4000' },
    { code: '4200', name: 'Sales Returns & Allowances', type: AccountType.REVENUE, parentCode: '4000', description: 'Contra revenue for returns' },
    { code: '4300', name: 'Sales Discounts', type: AccountType.REVENUE, parentCode: '4000', description: 'Contra revenue for discounts' },
    { code: '5000', name: 'Cost of Sales & Expenses', type: AccountType.EXPENSE },
    { code: '5100', name: 'COGS — Mobile', type: AccountType.EXPENSE, parentCode: '5000' },
    { code: '5110', name: 'COGS — Accessories', type: AccountType.EXPENSE, parentCode: '5000' },
    { code: '5120', name: 'Repair Parts COGS', type: AccountType.EXPENSE, parentCode: '5000' },
    { code: '5200', name: 'Rent & Utilities', type: AccountType.EXPENSE, parentCode: '5000' },
    { code: '5300', name: 'Salaries & Wages', type: AccountType.EXPENSE, parentCode: '5000' },
    { code: '5310', name: 'EPF Employer Contribution', type: AccountType.EXPENSE, parentCode: '5000' },
    { code: '5320', name: 'ETF Contribution', type: AccountType.EXPENSE, parentCode: '5000' },
    { code: '5500', name: 'Depreciation Expense', type: AccountType.EXPENSE, parentCode: '5000' },
    { code: '5600', name: 'Operating Expenses', type: AccountType.EXPENSE, parentCode: '5000' },
    { code: '5700', name: 'Cash Over / Short', type: AccountType.EXPENSE, parentCode: '5000' },
    { code: '5999', name: 'Sales Returns Contra (legacy)', type: AccountType.EXPENSE, parentCode: '5000', description: 'Optional contra; prefer 4200' },
  ];
}

export function parseCoaImportRow(row: Record<string, string>): {
  code: string;
  name: string;
  type: AccountType;
  description?: string;
  parentCode?: string;
  openingBalance?: number;
} {
  const code = normalizeAccountCode(row.code ?? row.Code ?? '');
  const name = String(row.name ?? row.Name ?? '').trim();
  const typeRaw = String(row.type ?? row.Type ?? '').trim().toUpperCase();
  const typeMap: Record<string, AccountType> = {
    ASSET: AccountType.ASSET,
    ASSETS: AccountType.ASSET,
    LIABILITY: AccountType.LIABILITY,
    LIABILITIES: AccountType.LIABILITY,
    EQUITY: AccountType.EQUITY,
    REVENUE: AccountType.REVENUE,
    INCOME: AccountType.REVENUE,
    EXPENSE: AccountType.EXPENSE,
    EXPENSES: AccountType.EXPENSE,
  };
  const type = typeMap[typeRaw];
  if (!code || !name || !type) {
    throw new BadRequestException(`Invalid import row: code=${code || '?'}, name=${name || '?'}, type=${typeRaw || '?'}`);
  }
  const parentCode = normalizeAccountCode(row.parentCode ?? row.ParentCode ?? row.parent ?? '') || undefined;
  const obRaw = row.openingBalance ?? row.OpeningBalance ?? '';
  const openingBalance = obRaw === '' ? undefined : Number(obRaw);
  if (openingBalance != null && (Number.isNaN(openingBalance))) {
    throw new BadRequestException(`Invalid openingBalance for ${code}`);
  }
  return {
    code,
    name,
    type,
    description: String(row.description ?? row.Description ?? '').trim() || undefined,
    parentCode,
    openingBalance,
  };
}
