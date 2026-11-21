import { ForbiddenException } from '@nestjs/common';
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

export function hasFinancialAuthority(roles: string[] | null | undefined): boolean {
  return !!roles?.some((r) => FINANCIAL_AUTHORITY_ROLES.includes(r as RoleType));
}

export function assertFinancialAuthority(roles: string[] | null | undefined, action: string): void {
  if (!hasFinancialAuthority(roles)) {
    throw new ForbiddenException(`${action} requires a manager, accountant or shop admin`);
  }
}

/** Upper bounds for manual adjustments — stops fat-finger and scripted abuse. */
export const MAX_MANUAL_WALLET_TOPUP = 1_000_000;
export const MAX_MANUAL_LOYALTY_ADJUST = 100_000;
