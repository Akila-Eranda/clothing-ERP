import { PaymentMethod } from '@prisma/client';
import { netCashFromSalePayments } from './cash-register.helper';

describe('netCashFromSalePayments', () => {
  const cash = [{ method: PaymentMethod.CASH, amount: 200 }];

  it('keeps saved change in the till instead of treating it as cash returned', () => {
    expect(netCashFromSalePayments(cash, 71, 71)).toBe(200);
  });

  it('subtracts only the cash change actually handed back', () => {
    expect(netCashFromSalePayments(cash, 71, 20)).toBe(149);
  });

  it('preserves the existing cash calculation when no change is saved', () => {
    expect(netCashFromSalePayments(cash, 71)).toBe(129);
  });
});
