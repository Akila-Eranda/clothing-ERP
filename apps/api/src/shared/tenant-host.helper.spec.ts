import { extractTenantSlugFromHostHeader, resolveLoginTenantSlug } from './tenant-host.helper';

describe('tenant-host.helper', () => {
  it('extracts slug from shop subdomain Origin', () => {
    expect(extractTenantSlugFromHostHeader('https://grocery.shop.hexalyte.com/login')).toBe('grocery');
    expect(extractTenantSlugFromHostHeader('https://jo-lanka.shop.hexalyte.com')).toBe('jo-lanka');
  });

  it('ignores main shop and api hosts', () => {
    expect(extractTenantSlugFromHostHeader('https://shop.hexalyte.com/login')).toBeUndefined();
    expect(extractTenantSlugFromHostHeader('https://shop.clothing.api.hexalyte.com')).toBeUndefined();
  });

  it('prefers explicit x-tenant-id over Origin', () => {
    expect(
      resolveLoginTenantSlug({
        headerSlug: 'grocery',
        origin: 'https://jo-lanka.shop.hexalyte.com',
      }),
    ).toBe('grocery');
  });

  it('falls back to Origin when header missing', () => {
    expect(
      resolveLoginTenantSlug({
        origin: 'https://jo-lanka.shop.hexalyte.com/login',
      }),
    ).toBe('jo-lanka');
  });
});
