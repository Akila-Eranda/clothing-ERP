import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { hasPairedCreds, listResumableTenants, MAX_AUTO_RECONNECT, reconnectCeilingMs, reconnectDelayMs, shouldResetAuth } from './whatsapp-reconnect.helper';

describe('whatsapp-reconnect.helper (QA-004)', () => {
  it('never wipes the saved login for a timeout or any transient drop', () => {
    expect(shouldResetAuth({ timedOut: true })).toBe(false);
    expect(shouldResetAuth({ timedOut: false })).toBe(false);
  });

  it('backs off exponentially (ceiling doubles) and caps at 60 s', () => {
    expect([0, 1, 2, 3].map((n) => reconnectCeilingMs(n))).toEqual([3000, 6000, 12000, 24000]);
    expect(reconnectCeilingMs(10)).toBe(60_000);
    expect(reconnectCeilingMs(0, true)).toBe(5000);
    expect(reconnectCeilingMs(-3)).toBe(3000);
    expect(MAX_AUTO_RECONNECT).toBeGreaterThan(3);
  });

  it('jitter keeps every wait between half the ceiling and the ceiling, and actually varies', () => {
    for (const attempt of [0, 1, 4, 9]) {
      const ceiling = reconnectCeilingMs(attempt);
      const samples = Array.from({ length: 200 }, () => reconnectDelayMs(attempt));
      expect(Math.min(...samples)).toBeGreaterThanOrEqual(ceiling / 2);
      expect(Math.max(...samples)).toBeLessThanOrEqual(ceiling);
      expect(new Set(samples).size).toBeGreaterThan(20);
    }
    expect(reconnectDelayMs(2, false, () => 0)).toBe(6000);
    expect(reconnectDelayMs(2, false, () => 1)).toBe(12000);
    expect(reconnectDelayMs(2, false, () => 7)).toBe(12000); // out-of-range random is clamped
  });

  describe('restart persistence', () => {
    let root: string;
    beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-')); });
    afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
    const put = (tenant: string, creds: unknown) => {
      fs.mkdirSync(path.join(root, tenant), { recursive: true });
      fs.writeFileSync(path.join(root, tenant, 'creds.json'), typeof creds === 'string' ? creds : JSON.stringify(creds));
    };

    it('resumes only tenants with a paired login', () => {
      put('t-paired', { me: { id: '9477@s.whatsapp.net' }, registered: true });
      put('t-unpaired', { registered: false });
      put('t-broken', '{not json');
      fs.mkdirSync(path.join(root, 't-empty'));
      fs.mkdirSync(path.join(root, '.hidden'));
      expect(listResumableTenants(root)).toEqual(['t-paired']);
      expect(hasPairedCreds(path.join(root, 't-paired'))).toBe(true);
      expect(hasPairedCreds(path.join(root, 't-unpaired'))).toBe(false);
    });

    it('a missing auth root is not an error', () => {
      expect(listResumableTenants(path.join(root, 'nope'))).toEqual([]);
    });
  });
});
