import * as fs from 'fs';
import * as path from 'path';

/**
 * Static guard (no nginx needed): every nginx config that serves /uploads/ must also have the regex block
 * that hides private runtime folders (WhatsApp credentials, pending-SSL queue). The behaviour itself was
 * verified against a real nginx container; this stops the block being dropped from a config later.
 */
const nginxDir = path.resolve(__dirname, '../../../../../nginx');
const confs = fs.readdirSync(nginxDir).filter((f) => f.endsWith('.conf'));

describe('nginx private upload folders', () => {
  it('finds the nginx configs', () => {
    expect(confs.length).toBeGreaterThan(0);
  });

  for (const conf of confs) {
    const text = fs.readFileSync(path.join(nginxDir, conf), 'utf8');
    const servesUploads = (text.match(/location\s+\/uploads\/\s*\{/g) ?? []).length;
    if (!servesUploads) continue;

    it(`${conf}: every /uploads/ location is guarded`, () => {
      const guards = text.match(/location\s+~\*\s+\^\/uploads\/\(\?:\.\*\/\)\?\(\?:whatsapp-sessions\|\\.ssl-pending\|\\.private\)\(\?:\/\|\$\)\s*\{\s*return\s+404;/g) ?? [];
      expect(guards.length).toBe(servesUploads);
    });
  }

  it('the API container does not keep WhatsApp credentials under the public uploads volume', () => {
    const compose = fs.readFileSync(path.resolve(nginxDir, '..', 'docker-compose.yml'), 'utf8');
    const m = compose.match(/WHATSAPP_AUTH_DIR:\s*(\S+)/);
    expect(m).not.toBeNull();
    expect(m![1].startsWith('/app/uploads')).toBe(false);
    // and the private folder is not mounted into the nginx service
    const nginxSection = compose.slice(compose.indexOf('container_name: fashionerp_nginx'));
    expect(nginxSection).not.toContain('storage-private');
  });
});
