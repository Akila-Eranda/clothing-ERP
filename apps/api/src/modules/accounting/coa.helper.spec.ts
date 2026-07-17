import { AccountType } from '@prisma/client';
import {
  assertCodeInTypeRange,
  assertValidParent,
  buildAccountTree,
  flattenAccountTree,
  collectDescendantIds,
  normalizeAccountCode,
  suggestNextAccountCode,
  parseCoaImportRow,
  COA_TYPE_RANGES,
} from './coa.helper';

describe('Phase 01 Sprint 1 — Chart of Accounts', () => {
  it('suggests first code in type range', () => {
    expect(suggestNextAccountCode({ type: AccountType.ASSET, existingCodes: [] })).toBe('1000');
    expect(suggestNextAccountCode({ type: AccountType.EXPENSE, existingCodes: [] })).toBe('5000');
  });

  it('increments within range', () => {
    expect(
      suggestNextAccountCode({ type: AccountType.ASSET, existingCodes: ['1000', '1100', '1205'] }),
    ).toBe('1206');
  });

  it('suggests child under parent', () => {
    expect(
      suggestNextAccountCode({
        type: AccountType.ASSET,
        existingCodes: ['1000', '1100'],
        parentCode: '1000',
      }),
    ).toBe('1001');
  });

  it('validates code range', () => {
    expect(() => assertCodeInTypeRange('1500', AccountType.ASSET)).not.toThrow();
    expect(() => assertCodeInTypeRange('2500', AccountType.ASSET)).toThrow();
  });

  it('validates parent same type', () => {
    expect(() =>
      assertValidParent({
        parentId: 'p1',
        parent: { id: 'p1', type: AccountType.ASSET, isActive: true },
        type: AccountType.LIABILITY,
      }),
    ).toThrow(/same account type/);
  });

  it('builds and flattens tree with depth', () => {
    const tree = buildAccountTree([
      {
        id: '1', parentId: null, code: '1000', name: 'Assets', type: AccountType.ASSET,
        description: null, isSystem: false, isActive: true, balance: 0, openingBalance: 0, openingBalanceDate: null,
      },
      {
        id: '2', parentId: '1', code: '1100', name: 'Cash', type: AccountType.ASSET,
        description: null, isSystem: false, isActive: true, balance: 100, openingBalance: 100, openingBalanceDate: null,
      },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].depth).toBe(1);
    expect(flattenAccountTree(tree).map((n) => n.code)).toEqual(['1000', '1100']);
  });

  it('collects descendants for cycle checks', () => {
    const ids = collectDescendantIds('a', [
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'b' },
    ]);
    expect([...ids].sort()).toEqual(['b', 'c']);
  });

  it('parses import rows including Income → REVENUE', () => {
    const row = parseCoaImportRow({
      code: '4100',
      name: 'Sales',
      type: 'Income',
      parentCode: '4000',
      openingBalance: '0',
    });
    expect(row.type).toBe(AccountType.REVENUE);
    expect(normalizeAccountCode(row.code)).toBe('4100');
  });

  it('exposes income label for REVENUE', () => {
    expect(COA_TYPE_RANGES.REVENUE.label).toBe('Income');
  });
});
