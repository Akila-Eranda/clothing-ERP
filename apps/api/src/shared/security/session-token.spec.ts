import { hashSessionToken } from './session-token';

describe('hashSessionToken', () => {
  it('is a stable 64-char hex digest that never contains the token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.sig';
    const h = hashSessionToken(jwt);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashSessionToken(jwt));
    expect(h).not.toContain('eyJ');
    expect(hashSessionToken(`${jwt}x`)).not.toBe(h);
  });

  it('is plain SHA-256 hex (same as PostgreSQL encode(sha256(...), \'hex\'))', () => {
    expect(hashSessionToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
