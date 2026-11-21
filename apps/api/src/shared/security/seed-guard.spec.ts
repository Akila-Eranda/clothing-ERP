import * as fs from 'fs';
import * as path from 'path';
import { decideSeedRun, INITIAL_SETUP_FLAG, INITIAL_SETUP_VALUE } from './seed-guard';

describe('seed guard (production seeding is initial setup only)', () => {
  it('runs outside production', () => {
    expect(decideSeedRun({ NODE_ENV: 'development' }, 12).action).toBe('run');
    expect(decideSeedRun({ NODE_ENV: 'test' }, 0).action).toBe('run');
    expect(decideSeedRun({}, 3).action).toBe('run');
  });

  it('skips in production without the flag (exit 0), even on an empty database', () => {
    for (const tenants of [0, 10]) {
      const d = decideSeedRun({ NODE_ENV: 'production' }, tenants);
      expect(d).toMatchObject({ action: 'skip', exitCode: 0 });
    }
  });

  it('ignores a wrong or casual flag value', () => {
    for (const v of ['1', 'true', 'yes', 'EMPTY-DATABASE-ONLY']) {
      expect(decideSeedRun({ NODE_ENV: 'production', [INITIAL_SETUP_FLAG]: v }, 0).action).toBe('skip');
    }
  });

  it('refuses in production with the flag when any shop exists (exit 1)', () => {
    const d = decideSeedRun({ NODE_ENV: 'production', [INITIAL_SETUP_FLAG]: INITIAL_SETUP_VALUE }, 1);
    expect(d).toMatchObject({ action: 'refuse', exitCode: 1 });
    expect(d.reason).toMatch(/already has 1 shop/);
  });

  it('runs in production only with the flag on an empty database', () => {
    expect(decideSeedRun({ NODE_ENV: 'production', [INITIAL_SETUP_FLAG]: INITIAL_SETUP_VALUE }, 0).action).toBe('run');
  });

  it('seed.ts consults the guard before writing anything', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../prisma/seed.ts'), 'utf8');
    const main = src.slice(src.indexOf('async function main()'));
    const guardAt = main.indexOf('decideSeedRun(');
    const firstWrite = main.search(/prisma\.\w+\.(upsert|create|createMany|update|updateMany|delete|deleteMany)\(/);
    expect(guardAt).toBeGreaterThan(0);
    expect(guardAt).toBeLessThan(firstWrite);
  });
});
