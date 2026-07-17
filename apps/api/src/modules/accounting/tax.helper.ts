/** Sprint 7 — VAT & Tax pure helpers */

import { BadRequestException } from '@nestjs/common';

export function roundTax(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Exclusive tax: tax = net * rate/100 */
export function calculateExclusiveTax(netAmount: number, ratePercent: number): {
  net: number;
  tax: number;
  gross: number;
} {
  const net = roundTax(Math.max(0, netAmount));
  const rate = Math.max(0, ratePercent);
  const tax = roundTax(net * (rate / 100));
  return { net, tax, gross: roundTax(net + tax) };
}

/** Inclusive tax: extract tax from gross */
export function calculateInclusiveTax(grossAmount: number, ratePercent: number): {
  net: number;
  tax: number;
  gross: number;
} {
  const gross = roundTax(Math.max(0, grossAmount));
  const rate = Math.max(0, ratePercent);
  if (rate <= 0) return { net: gross, tax: 0, gross };
  const net = roundTax(gross / (1 + rate / 100));
  const tax = roundTax(gross - net);
  return { net, tax, gross };
}

export function calculateLineTax(
  amount: number,
  ratePercent: number,
  inclusive = false,
): { net: number; tax: number; gross: number } {
  if (inclusive) return calculateInclusiveTax(amount, ratePercent);
  return calculateExclusiveTax(amount, ratePercent);
}

export type VatPeriodTotals = {
  outputVat: number;
  inputVat: number;
  netVat: number;
  salesNet: number;
  salesGross: number;
  purchasesNet: number;
  purchasesGross: number;
};

export function computeVatPeriodTotals(input: {
  outputVat: number;
  inputVat: number;
  salesNet: number;
  salesGross: number;
  purchasesNet: number;
  purchasesGross: number;
}): VatPeriodTotals {
  const outputVat = roundTax(input.outputVat);
  const inputVat = roundTax(input.inputVat);
  return {
    outputVat,
    inputVat,
    netVat: roundTax(outputVat - inputVat),
    salesNet: roundTax(input.salesNet),
    salesGross: roundTax(input.salesGross),
    purchasesNet: roundTax(input.purchasesNet),
    purchasesGross: roundTax(input.purchasesGross),
  };
}

export function assertValidTaxRate(rate: number) {
  if (rate < 0 || rate > 100) {
    throw new BadRequestException('Tax rate must be between 0 and 100');
  }
}

export function defaultTaxSeed(): Array<{
  code: string;
  name: string;
  rate: number;
  direction: 'OUTPUT' | 'INPUT' | 'BOTH';
  isDefault?: boolean;
  description?: string;
}> {
  return [
    {
      code: 'VAT18',
      name: 'VAT 18%',
      rate: 18,
      direction: 'BOTH',
      isDefault: true,
      description: 'Standard VAT',
    },
    {
      code: 'VAT0',
      name: 'Zero-rated',
      rate: 0,
      direction: 'BOTH',
      description: 'Zero-rated supplies',
    },
    {
      code: 'EXEMPT',
      name: 'Exempt',
      rate: 0,
      direction: 'BOTH',
      description: 'VAT exempt',
    },
  ];
}
