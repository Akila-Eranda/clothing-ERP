const { chromium } = require('playwright');

(async () => {
  const SHOP = process.argv[2] || 'https://demo.shop.hexalyte.com';
  const tenant = process.argv[3] || 'demo';
  const API = 'https://shop.clothing.api.hexalyte.com/api/v1';

  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenant },
    body: JSON.stringify({ email: 'admin@demo.fashionerp.com', password: 'Admin@123456' }),
  });
  const login = await loginRes.json();
  const token = login.data?.accessToken;
  if (!token) {
    console.error('Login failed', login);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  await page.context().addCookies([{
    name: 'fe_access_token',
    value: token,
    domain: new URL(SHOP).hostname,
    path: '/',
  }]);

  await page.addInitScript(({ accessToken, refreshToken, tenantId, user }) => {
    localStorage.setItem('fe_access_token', accessToken);
    localStorage.setItem('fe_refresh_token', refreshToken);
    localStorage.setItem('fe_tenant_id', tenantId);
    localStorage.setItem('fashion-erp-auth', JSON.stringify({
      state: {
        user,
        accessToken,
        refreshToken,
        isAuthenticated: true,
      },
      version: 0,
    }));
  }, {
    accessToken: token,
    refreshToken: login.data.refreshToken,
    tenantId: login.data.user.tenantId,
    user: {
      id: login.data.user.id,
      name: `${login.data.user.firstName} ${login.data.user.lastName}`,
      email: login.data.user.email,
      role: (login.data.user.roles?.[0] || 'TENANT_ADMIN').toLowerCase(),
      permissions: [],
      isActive: true,
      twoFactorEnabled: false,
      branchId: login.data.user.branchId,
      createdAt: new Date().toISOString(),
    },
  });

  await page.goto(`${SHOP}/dashboard`, { waitUntil: 'networkidle', timeout: 90000 });
  const body = await page.textContent('body');
  console.log('URL:', page.url());
  console.log('App error:', body?.includes('Application error') ?? false);
  console.log('Has Dashboard heading:', body?.includes('Dashboard') ?? false);
  if (errors.length) {
    console.log('Page errors:');
    errors.forEach((e) => console.log(' -', e));
  }
  await browser.close();
  process.exit(body?.includes('Application error') || errors.length ? 1 : 0);
})();
