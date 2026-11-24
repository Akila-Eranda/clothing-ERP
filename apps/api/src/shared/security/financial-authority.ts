import { RoleType } from '@prisma/client';

/**
 * Roles allowed to create or forgive value by hand (wallet top-ups, loyalty adjustments,
 * credit-limit changes, credit notes). Cashiers can still take payments, but cannot mint money.
 */
export const FINANCIAL_AUTHORITY_ROLES: RoleType[] = [
  RoleType.SUPER_ADMIN,
  RoleType.TENANT_ADMIN,
  RoleType.BRANCH_MANAGER,
  RoleType.ACCOUNTANT,
];

/**
 * Owner decision: no role restriction on manual money actions (wallet top-ups, loyalty adjustments, credit limits,
 * credit notes, expense limits, refund limits). Everyone who can reach the action may do it; the audit trail still
 * records who acted. FINANCIAL_AUTHORITY_ROLES is kept for reporting.
 */
export function hasFinancialAuthority(_roles: string[] | null | undefined): boolean {
  return true;
}

export function assertFinancialAuthority(_roles: string[] | null | undefined, _action: string): void {
  /* intentionally no check (see hasFinancialAuthority) */
}

/** Upper bounds for manual adjustments — stops fat-finger and scripted abuse. */
export const MAX_MANUAL_WALLET_TOPUP = 1_000_000;
export const MAX_MANUAL_LOYALTY_ADJUST = 100_000;
