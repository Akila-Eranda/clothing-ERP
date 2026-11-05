import * as fs from 'fs';
import * as path from 'path';
import { PERMISSION_CATALOGUE, splitPermissionKey } from './permission-catalogue';

/** Every "resource:action" string passed to a permission decorator anywhere under src/. */
function permissionsUsedInCode(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.ts') || p.endsWith('.spec.ts')) continue;
      const src = fs.readFileSync(p, 'utf8');
      for (const call of src.matchAll(/Require(?:Any)?Permissions\(([^)]*)\)/g)) {
        for (const key of call[1].matchAll(/'([a-z-]+:[a-z-]+)'/g)) {
          used.set(key[1], [...(used.get(key[1]) ?? []), path.relative(path.join(__dirname, '..', '..'), p)]);
        }
      }
    }
  };
  walk(path.join(__dirname, '..', '..'));
  return used;
}

describe('PERMISSION_CATALOGUE', () => {
  it('contains every permission used by a @RequirePermissions / @RequireAnyPermissions decorator', () => {
    const missing = [...permissionsUsedInCode().entries()]
      .filter(([key]) => !(PERMISSION_CATALOGUE as readonly string[]).includes(key))
      .map(([key, files]) => `${key} (${files[0]})`);
    expect(missing).toEqual([]);
  });

  it('includes the 8 permissions that were missing before (audit F-06)', () => {
    for (const key of ['accounting:update', 'accounting:delete', 'suppliers:update', 'suppliers:delete',
      'returns:create', 'returns:read', 'returns:update', 'settings:read']) {
      expect(PERMISSION_CATALOGUE).toContain(key);
    }
  });

  it('has no duplicates and only well-formed keys', () => {
    expect(new Set(PERMISSION_CATALOGUE).size).toBe(PERMISSION_CATALOGUE.length);
    for (const key of PERMISSION_CATALOGUE) {
      const { resource, action } = splitPermissionKey(key);
      expect(resource).toMatch(/^[a-z-]+$/);
      expect(action).toMatch(/^[a-z-]+$/);
    }
  });

  it('is in sync with the permission-catalogue migration', () => {
    const migrationsDir = path.join(__dirname, '..', '..', '..', 'prisma', 'migrations');
    const dir = fs.readdirSync(migrationsDir).find((d) => d.endsWith('_permission_catalogue'));
    expect(dir).toBeDefined();
    const sql = fs.readFileSync(path.join(migrationsDir, dir!, 'migration.sql'), 'utf8');
    for (const key of PERMISSION_CATALOGUE) {
      const { resource, action } = splitPermissionKey(key);
      expect(sql).toContain(`('${resource}', '${action}')`);
    }
  });
});
