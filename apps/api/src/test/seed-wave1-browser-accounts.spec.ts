const { validateBrowserSeedEnvironment } = require('../../test/seed-wave1-browser-accounts.cjs');

describe('seed-wave1-browser-accounts guard', () => {
  const baseEnv = {
    NODE_ENV: 'test',
    E2E_WAVE1: '1',
    E2E_BROWSER_SUBDOMAIN: 'wave1-browser-verify01',
    E2E_BROWSER_PASSWORD: 's3cret-test-password',
    E2E_WAVE1_RUNNER_MODE: 'container',
    E2E_WAVE1_PROJECT: 'hexaone-e2e-wave1',
    E2E_WAVE1_NETWORK: 'hexaone_e2e_wave1_network',
  };

  function expectValid(url: string, envOverrides: Record<string, string> = {}) {
    const env = { ...baseEnv, ...envOverrides };
    expect(() => validateBrowserSeedEnvironment(env, url, () => undefined)).not.toThrow();
  }

  function expectRejected(url: string, envOverrides: Record<string, string> = {}) {
    const env = { ...baseEnv, ...envOverrides };
    expect(() => validateBrowserSeedEnvironment(env, url, () => undefined)).toThrow();
  }

  it('accepts the approved internal Docker endpoint with all runner identity checks', () => {
    expectValid('postgresql://hexa_e2e:s3cret@postgres:5432/hexa_e2e_wave1?schema=public');
  });

  it('requires the internal network attestation to pass', () => {
    const env = { ...baseEnv };
    const networkGuard = jest.fn();
    expect(() =>
      validateBrowserSeedEnvironment(
        env,
        'postgresql://hexa_e2e:s3cret@postgres:5432/hexa_e2e_wave1?schema=public',
        networkGuard,
      ),
    ).not.toThrow();
    expect(networkGuard).toHaveBeenCalledTimes(1);

    expect(() =>
      validateBrowserSeedEnvironment(
        env,
        'postgresql://hexa_e2e:s3cret@postgres:5432/hexa_e2e_wave1?schema=public',
        () => {
          throw new Error('network identity check failed');
        },
      ),
    ).toThrow('network identity check failed');
  });

  it('accepts the legacy loopback endpoint while preserving host-mode protections', () => {
    expectValid(
      'postgresql://hexa_e2e:s3cret@127.0.0.1:15434/hexa_e2e_wave1?schema=public',
      { E2E_WAVE1_RUNNER_MODE: '' },
    );
  });

  it.each([
    ['wrong hostname', 'postgresql://hexa_e2e:s3cret@127.0.0.1:5432/hexa_e2e_wave1?schema=public'],
    ['wrong port', 'postgresql://hexa_e2e:s3cret@postgres:15434/hexa_e2e_wave1?schema=public'],
    ['wrong database', 'postgresql://hexa_e2e:s3cret@postgres:5432/postgres?schema=public'],
    ['wrong role', 'postgresql://postgres:s3cret@postgres:5432/hexa_e2e_wave1?schema=public'],
  ])('rejects %s', (_label: string, url: string) => {
    expectRejected(url);
  });

  it('rejects a wrong project while keeping the approved internal endpoint otherwise valid', () => {
    expectRejected('postgresql://hexa_e2e:s3cret@postgres:5432/hexa_e2e_wave1?schema=public', {
      E2E_WAVE1_PROJECT: 'wrong-project',
    });
  });

  it('rejects a wrong internal network marker', () => {
    expectRejected('postgresql://hexa_e2e:s3cret@postgres:5432/hexa_e2e_wave1?schema=public', {
      E2E_WAVE1_NETWORK: 'wrong-network',
    });
  });

  it('rejects a missing Wave 1 environment marker', () => {
    expectRejected('postgresql://hexa_e2e:s3cret@postgres:5432/hexa_e2e_wave1?schema=public', {
      E2E_WAVE1: '',
    });
  });

  it.each([
    ['production database', 'postgresql://hexa_e2e:s3cret@prod-db.internal:5432/hexa_e2e_wave1?schema=public'],
    ['legacy database', 'postgresql://hexa_e2e:s3cret@hexa-e2e-pg:5432/hexa_e2e_wave1?schema=public'],
    ['local non-wave1 database', 'postgresql://hexa_e2e:s3cret@127.0.0.1:15434/postgres?schema=public'],
  ])('rejects %s', (_label: string, url: string) => {
    expectRejected(url);
  });
});
