import {
  accountBalanceDrift, compareSources, glBalance, inventoryValuation, notChecked, stockLedgerDrift, summarizeChecks,
  totalsByAccount, trialBalanceTotals, unbalancedEntries, withinTolerance, sumCents, duplicateReferences, missingReferences,
} from './reconciliation.helper';

const side = (value: number | null) => ({ label: 'x', source: 's', value });

describe('compareSources', () => {
  it('OK within one cent, MISMATCH beyond', () => {
    expect(compareSources('k', 't', side(100), side(100.01)).status).toBe('OK');
    const c = compareSources('k', 't', side(100), side(100.02));
    expect(c.status).toBe('MISMATCH');
    expect(c.difference).toBe(-0.02);
  });

  describe('reference posting checks', () => {
    it('accumulates money in exact cents', () => {
      expect(sumCents([0.1, 0.2, 0.3])).toBe(0.6);
    });

    it('detects duplicate non-void source references', () => {
      expect(duplicateReferences([
        { referenceType: 'SALE', referenceId: 's1' },
        { referenceType: 'SALE', referenceId: 's1' },
        { referenceType: 'SALE', referenceId: 's2' },
        { referenceType: null, referenceId: 'ignored' },
      ])).toEqual(['SALE:s1']);
    });

    it('detects missing expected postings without crossing source tenants', () => {
      expect(missingReferences(
        [{ referenceType: 'SALE', referenceId: 's1' }, { referenceType: 'SALE', referenceId: 's2' }],
        [{ referenceType: 'SALE', referenceId: 's1' }],
      )).toEqual(['SALE:s2']);
    });
  });
  it('a missing side is NOT_CHECKED, never OK', () => {
    expect(compareSources('k', 't', side(null), side(0)).status).toBe('NOT_CHECKED');
    expect(compareSources('k', 't', side(NaN), side(0)).status).toBe('NOT_CHECKED');
  });
  it('a known open accounting question is DECISION_REQUIRED, not MISMATCH', () => {
    const c = compareSources('k', 't', side(10), side(0), { decisionNote: 'free qty valuation' });
    expect(c.status).toBe('DECISION_REQUIRED');
    expect(c.note).toBe('free qty valuation');
    expect(compareSources('k', 't', side(5), side(5), { decisionNote: 'x' }).status).toBe('OK');
  });
  it('withinTolerance rounds to cents first', () => {
    expect(withinTolerance(0.1 + 0.2, 0.3)).toBe(true);
  });
});

describe('GL balances from journal lines', () => {
  const lines = [
    { debitAccountId: 'cash', creditAccountId: 'sales', amount: 100 },
    { debitAccountId: 'cogs', creditAccountId: 'inv', amount: 60 },
    { debitAccountId: 'wallet', creditAccountId: null, amount: 10 },
    { debitAccountId: null, creditAccountId: 'wallet', amount: 50 },
  ];
  const t = totalsByAccount(lines);
  it('computes normal-side balances', () => {
    expect(glBalance(t, ['cash'], 'DEBIT')).toBe(100);
    expect(glBalance(t, ['wallet'], 'CREDIT')).toBe(40);
    expect(glBalance(t, ['inv'], 'DEBIT')).toBe(-60);
    expect(glBalance(t, ['cash', 'cogs'], 'DEBIT')).toBe(160);
    expect(glBalance(t, ['missing'], 'DEBIT')).toBe(0);
  });
});

describe('unbalancedEntries', () => {
  it('finds entries whose debit and credit differ', () => {
    const r = unbalancedEntries([
      { journalEntryId: 'a', debitAccountId: 'x', creditAccountId: 'y', amount: 10 },
      { journalEntryId: 'b', debitAccountId: 'x', amount: 10 },
      { journalEntryId: 'b', creditAccountId: 'y', amount: 9.5 },
    ]);
    expect(r).toEqual([{ journalEntryId: 'b', debit: 10, credit: 9.5, difference: 0.5 }]);
  });
});

describe('trial balance', () => {
  it('debits equal credits for a consistent ledger and differ otherwise', () => {
    expect(trialBalanceTotals([{ type: 'ASSET', balance: 100 }, { type: 'LIABILITY', balance: 60 }, { type: 'EQUITY', balance: 40 }])).toEqual({ debit: 100, credit: 100 });
    const bad = trialBalanceTotals([{ type: 'ASSET', balance: 100 }, { type: 'LIABILITY', balance: 60 }]);
    expect(bad.debit - bad.credit).toBe(40);
  });
  it('negative balances move to the other side', () => {
    expect(trialBalanceTotals([{ type: 'ASSET', balance: -5 }, { type: 'REVENUE', balance: -5 }])).toEqual({ debit: 5, credit: 5 });
  });
});

describe('accountBalanceDrift', () => {
  it('reports stored balances that the journal does not explain', () => {
    const totals = [{ accountId: 'a1', debit: 100, credit: 20 }, { accountId: 'a2', debit: 0, credit: 50 }];
    const r = accountBalanceDrift(
      [
        { id: 'a1', code: '1100', type: 'ASSET', balance: 80 },
        { id: 'a2', code: '2400', type: 'LIABILITY', balance: 55 },
        { id: 'a3', code: '1250', type: 'ASSET', balance: 0 },
      ],
      totals,
    );
    expect(r).toEqual([{ accountId: 'a2', code: '2400', stored: 55, fromJournal: 50, difference: 5 }]);
  });
});

describe('stock ledger and valuation', () => {
  it('finds variants whose on-hand differs from the movement ledger', () => {
    const r = stockLedgerDrift(
      [{ variantId: 'v1', quantity: 10 }, { variantId: 'v1', quantity: 5 }, { variantId: 'v2', quantity: 3 }],
      [{ variantId: 'v1', quantityChange: 12 }, { variantId: 'v1', quantityChange: 3 }, { variantId: 'v2', quantityChange: 1 }, { variantId: 'v3', quantityChange: 2 }],
    );
    expect(r).toEqual([
      { variantId: 'v2', onHand: 3, ledger: 1, difference: 2 },
      { variantId: 'v3', onHand: 0, ledger: 2, difference: -2 },
    ]);
  });
  it('values stock at quantity x average cost and ignores negative stock', () => {
    expect(inventoryValuation([{ quantity: 10, avgCost: 2.5 }, { quantity: -4, avgCost: 9 }, { quantity: 3, avgCost: 0 }])).toBe(25);
  });
  it('free quantity case: stock qty includes free units, GL value only the paid ones -> difference is surfaced', () => {
    const valuation = inventoryValuation([{ quantity: 110, avgCost: 10 }]);
    const c = compareSources('inventory', 't', side(valuation), side(1000), { decisionNote: 'free-qty valuation undecided' });
    expect(c.difference).toBe(100);
    expect(c.status).toBe('DECISION_REQUIRED');
  });
});

describe('summarizeChecks', () => {
  it('counts statuses; clean only when no mismatch or open decision', () => {
    const ok = compareSources('a', 'a', side(1), side(1));
    const bad = compareSources('b', 'b', side(1), side(2));
    const nc = notChecked('c', 'c', side(null), side(null), 'n/a');
    expect(summarizeChecks([ok, nc])).toMatchObject({ total: 2, ok: 1, notChecked: 1, clean: true });
    expect(summarizeChecks([ok, bad])).toMatchObject({ mismatch: 1, clean: false });
  });
});
