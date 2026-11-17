import { escapeLike, normalizeSearch, searchWords, textSearch, MAX_SEARCH_LENGTH } from './search.helper';

describe('search.helper', () => {
  it('trims, collapses whitespace and caps the length', () => {
    expect(normalizeSearch('  zebra   mango  ')).toBe('zebra mango');
    expect(normalizeSearch('\tzebra\n')).toBe('zebra');
    expect(normalizeSearch('x'.repeat(500))).toHaveLength(MAX_SEARCH_LENGTH);
    expect(normalizeSearch(undefined)).toBe('');
    expect(normalizeSearch(42 as unknown)).toBe('');
  });

  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%')).toBe('50\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('c:\\path')).toBe('c:\\\\path');
    expect(escapeLike('plain')).toBe('plain');
  });

  it('returns nothing for an empty or blank search (caller where unchanged)', () => {
    expect(textSearch('', ['name'])).toEqual({});
    expect(textSearch('   ', ['name'])).toEqual({});
    expect(textSearch(undefined, ['name'])).toEqual({});
  });

  it('builds AND-of-words, OR-of-fields, case-insensitive, with nested paths', () => {
    expect(textSearch('Zelda zebra', ['firstName', 'customer.phone'])).toEqual({
      AND: [
        { OR: [{ firstName: { contains: 'Zelda', mode: 'insensitive' } }, { customer: { phone: { contains: 'Zelda', mode: 'insensitive' } } }] },
        { OR: [{ firstName: { contains: 'zebra', mode: 'insensitive' } }, { customer: { phone: { contains: 'zebra', mode: 'insensitive' } } }] },
      ],
    });
  });

  it('supports builder fields (list relations, exact tags) with the raw word', () => {
    const w = textSearch('%off', [(f, word) => ({ variants: { some: { sku: f } } }), (_f, word) => ({ tags: { has: word } })]);
    expect(w).toEqual({ AND: [{ OR: [{ variants: { some: { sku: { contains: '\\%off', mode: 'insensitive' } } } }, { tags: { has: '%off' } }] }] });
  });

  it('limits the number of words', () => {
    expect(searchWords('a b c d e f g h')).toHaveLength(6);
  });
});
