import {
  buildBalanceSheet,
  buildProfitLoss,
  buildTrialBalance,
  classifyCashFlowMovement,
  periodNet,
  summarizeCashFlowBuckets,
  trialBalanceColumns,
} from './financial-reports.helper';

describe('Sprint 11 — Financial reports helpers', () => {
  it('splits trial balance debit/credit by normal balance', () => {
    expect(trialBalanceColumns('ASSET', 1000)).toEqual({ debit: 1000, credit: 0 });
    expect(trialBalanceColumns('LIABILITY', 500)).toEqual({ debit: 0, credit: 500 });
    expect(trialBalanceColumns('REVENUE', 200)).toEqual({ debit: 0, credit: 200 });
    const tb = buildTrialBalance([
      { code: '1100', name: 'Cash', type: 'ASSET', balance: 1000 },
      { code: '2100', name: 'AP', type: 'LIABILITY', balance: 400 },
      { code: '3000', name: 'Equity', type: 'EQUITY', balance: 600 },
    ]);
    expect(tb.totalDebit).toBe(1000);
    expect(tb.totalCredit).toBe(1000);
    expect(tb.balanced).toBe(true);
  });

  it('builds P&L and balance sheet', () => {
    const pl = buildProfitLoss(
      [{ code: '4100', name: 'Sales', amount: 50000 }],
      [{ code: '5200', name: 'Rent', amount: 10000 }],
    );
    expect(pl.netProfit).toBe(40000);

    const bs = buildBalanceSheet([
      { code: '1100', name: 'Cash', type: 'ASSET', balance: 50000 },
      { code: '2100', name: 'AP', type: 'LIABILITY', balance: 10000 },
      { code: '3000', name: 'Equity', type: 'EQUITY', balance: 0 },
      { code: '4100', name: 'Sales', type: 'REVENUE', balance: 50000 },
      { code: '5200', name: 'Rent', type: 'EXPENSE', balance: 10000 },
    ]);
    expect(bs.totalAssets).toBe(50000);
    expect(bs.equity.total).toBe(40000); // current P&L plug
    expect(periodNet('EXPENSE', 100, 20)).toBe(80);
  });

  it('classifies cash flow buckets', () => {
    expect(classifyCashFlowMovement({ referenceType: 'FA_ACQUISITION', signedAmount: -1 })).toBe('investing');
    expect(classifyCashFlowMovement({ referenceType: 'SALE', signedAmount: 1 })).toBe('operating');
    const s = summarizeCashFlowBuckets([
      { bucket: 'operating', amount: 100 },
      { bucket: 'investing', amount: -40 },
      { bucket: 'financing', amount: 10 },
    ]);
    expect(s.netChange).toBe(70);
  });
});
