import { generateSeedPassword, resolveSeedPassword, SEED_PASSWORD_ENV } from './seed-passwords';
import * as fs from 'fs';
import * as path from 'path';

describe('seed passwords (F-11)', () => {
  it('uses the environment value when set', () => {
    const p = resolveSeedPassword('SEED_ADMIN_PASSWORD', { SEED_ADMIN_PASSWORD: 'a-long-local-secret' });
    expect(p).toEqual({ value: 'a-long-local-secret', source: 'env', display: 'from SEED_ADMIN_PASSWORD' });
  });

  it('refuses short values and the published defaults', () => {
    expect(() => resolveSeedPassword('X', { X: 'short' })).toThrow(/at least 12/);
    for (const v of ['Admin@123456', 'Cashier@123456', 'Manager@123456']) {
      expect(() => resolveSeedPassword('X', { X: v })).toThrow(/published default/);
    }
  });

  it('generates a random password when unset and shows it only outside production', () => {
    const dev = resolveSeedPassword('X', { NODE_ENV: 'development' }, () => 'generated-pw-123');
    expect(dev.source).toBe('generated');
    expect(dev.display).toContain('generated-pw-123');

    const prod = resolveSeedPassword('X', { NODE_ENV: 'production' }, () => 'generated-pw-123');
    expect(prod.value).toBe('generated-pw-123');
    expect(prod.display).not.toContain('generated-pw-123');
  });

  it('generates different, long passwords', () => {
    const a = generateSeedPassword();
    const b = generateSeedPassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(20);
  });

  it('seed.ts contains no fixed password and reads every SEED_* variable', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../prisma/seed.ts'), 'utf8');
    expect(src).not.toMatch(/(Admin|Cashier|Manager)@123456/);
    expect(src).not.toMatch(/bcrypt\.hash\(\s*['"`]/);
    for (const key of Object.keys(SEED_PASSWORD_ENV)) expect(src).toContain(`SEED_PASSWORD_ENV.${key}`);
  });
});
