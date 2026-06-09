import { BadRequestException } from '@nestjs/common';

/** Customer credit — limit checks and balance helpers */

export function creditAvailable(creditLimit: number, creditBalance: number): number {
  if (creditLimit <= 0) return 0;
  return Math.max(0, creditLimit - creditBalance);
}

export function assertCreditAvailable(
  creditLimit: number,
  creditBalance: number,
  chargeAmount: number,
): void {
  if (chargeAmount <= 0) return;
  if (creditLimit <= 0) {
    throw new BadRequestException('Customer has no credit limit — set a limit in customer profile first');
  }
  const available = creditAvailable(creditLimit, creditBalance);
  if (chargeAmount > available + 0.01) {
    throw new BadRequestException(`Credit limit exceeded. Available: LKR ${available.toFixed(2)}`);
  }
}
