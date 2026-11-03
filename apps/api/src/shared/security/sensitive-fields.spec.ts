import { stripSensitiveFields } from './sensitive-fields';

describe('stripSensitiveFields', () => {
  it('removes credential fields at any depth, including arrays', () => {
    const role = {
      id: 'r1',
      users: [
        {
          user: {
            id: 'u1',
            email: 'a@shop.lk',
            passwordHash: '$2a$12$abc',
            twoFactorSecret: 'JBSWY3DPEHPK3PXP',
            posPinHash: '$2a$10$pin',
            refreshTokens: [{ token: 'rt' }],
          },
        },
      ],
    };
    expect(stripSensitiveFields(role)).toEqual({ id: 'r1', users: [{ user: { id: 'u1', email: 'a@shop.lk' } }] });
  });

  it('does not mutate the input', () => {
    const input = { passwordHash: 'x', name: 'n' };
    stripSensitiveFields(input);
    expect(input.passwordHash).toBe('x');
  });

  it('keeps legitimate token fields and non-plain values intact', () => {
    const when = new Date('2026-11-02T00:00:00Z');
    const buf = Buffer.from('pdf');
    const out = stripSensitiveFields({ accessToken: 'a', refreshToken: 'r', unlockToken: 'u', when, buf, n: 1, s: null });
    expect(out).toEqual({ accessToken: 'a', refreshToken: 'r', unlockToken: 'u', when, buf, n: 1, s: null });
    expect(out.when).toBe(when);
    expect(out.buf).toBe(buf);
  });

  it('strips every occurrence of a shared object, not just the first', () => {
    const u = { id: 'u', passwordHash: 'h', posPinHash: 'p' };
    const list = [u];
    const out = stripSensitiveFields({ createdBy: u, updatedBy: u, a: list, b: list });
    expect(JSON.stringify(out)).not.toMatch(/passwordHash|posPinHash/);
    expect(out.updatedBy).toEqual({ id: 'u' });
    expect(out.b).toEqual([{ id: 'u' }]);
  });

  it('passes primitives through and survives cycles', () => {
    expect(stripSensitiveFields('x')).toBe('x');
    expect(stripSensitiveFields(null)).toBeNull();
    const a: Record<string, unknown> = { id: 1, passwordHash: 'h' };
    a.self = a;
    const out = stripSensitiveFields(a) as Record<string, unknown>;
    expect(out.passwordHash).toBeUndefined();
    expect(out.id).toBe(1);
    // The cycle points at the stripped copy, not back at the original (which still has the hash).
    expect(out.self).toBe(out);
  });
});
