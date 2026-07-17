import {
  assertDebitEqualsCredit,
  expandPairedLines,
  formatJournalNumber,
  nextJournalSequence,
  normalizeJournalLines,
  parseJournalSeq,
  round2,
} from './journal-entries.helper';

describe('Phase 02 Sprint 3 — Journal Entries', () => {
  it('expands paired lines into debit+credit GL lines', () => {
    const lines = expandPairedLines([
      { debitAccountId: 'a', creditAccountId: 'b', amount: 100 },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ side: 'DEBIT', amount: 100 });
    expect(lines[1]).toMatchObject({ side: 'CREDIT', amount: 100 });
  });

  it('validates debit = credit', () => {
    expect(() =>
      assertDebitEqualsCredit([
        { accountId: 'a', side: 'DEBIT', amount: 100 },
        { accountId: 'b', side: 'CREDIT', amount: 60 },
        { accountId: 'c', side: 'CREDIT', amount: 40 },
      ]),
    ).not.toThrow();

    expect(() =>
      assertDebitEqualsCredit([
        { accountId: 'a', side: 'DEBIT', amount: 100 },
        { accountId: 'b', side: 'CREDIT', amount: 90 },
      ]),
    ).toThrow(/must equal/);
  });

  it('formats sequential journal numbers', () => {
    expect(formatJournalNumber(2026, 1)).toBe('JE-2026-00001');
    expect(nextJournalSequence(['JE-2026-00001', 'JE-2026-00007'], 2026)).toBe(8);
    expect(parseJournalSeq('JE-2026-00012', 2026)).toBe(12);
  });

  it('normalizes either glLines or paired lines', () => {
    const fromGl = normalizeJournalLines({
      glLines: [
        { accountId: 'a', side: 'DEBIT', amount: 50 },
        { accountId: 'b', side: 'CREDIT', amount: 50 },
      ],
    });
    expect(fromGl).toHaveLength(2);
    expect(round2(50.005)).toBe(50.01);
  });
});
