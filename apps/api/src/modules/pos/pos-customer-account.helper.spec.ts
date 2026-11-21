import { splitCustomerAccountTender } from './pos-customer-account.helper';

describe('splitCustomerAccountTender', () => {
  it('uses wallet funds only when they cover the bill', () => {
    expect(splitCustomerAccountTender(1500, 2000)).toEqual({
      walletAmount: 1500,
      creditAmount: 0,
    });
  });

  it('uses the remaining approved credit when wallet funds are insufficient', () => {
    expect(splitCustomerAccountTender(1000, 500)).toEqual({
      walletAmount: 500,
      creditAmount: 500,
    });
  });

  it('rounds each allocation to cents without losing the total', () => {
    expect(splitCustomerAccountTender(1.005, 0.335)).toEqual({
      walletAmount: 0.34,
      creditAmount: 0.67,
    });
  });

  it('does not allocate negative balances or amounts', () => {
    expect(splitCustomerAccountTender(-1, -2)).toEqual({
      walletAmount: 0,
      creditAmount: 0,
    });
  });
});
