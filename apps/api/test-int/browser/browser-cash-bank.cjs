#!/usr/bin/env node
/**
 * Browser check (QA-003 UI): on Accounting -> Cash & Bank the "Cashier wallets / Day End - Clear All" section must be the
 * LAST section of the page, below cash registers and bank accounts. Also verifies the page renders for a Tenant Admin
 * without runtime errors on desktop and mobile. Same environment variables as browser-smoke.cjs.
 */
const { chromium } = require('playwright-core');
const seed = JSON.parse(process.env.BROWSER_SEED || '{}');
const password = process.env.HEXA_BROWSER_PASSWORD;
const WEB = process.env.WEB_URL || 'http://127.0.0.1:3200';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let failed = 0;
const rec = (ok, name, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`); if (!ok) failed = 1; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  for (const [vp, size] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
    const ctx = await browser.newContext({ viewport: size });
    if (process.env.WEB_XFP) await ctx.route(`${WEB}/**`, (r) => r.continue({ headers: { ...r.request().headers(), 'x-forwarded-proto': process.env.WEB_XFP } }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    try {
      await page.goto(`${WEB}/login?tenant=${seed.subdomain}`, { waitUntil: 'networkidle', timeout: 240000 });
      await page.waitForSelector('#email', { timeout: 120000 });
      await page.waitForTimeout(1500);
      await page.fill('#email', seed.users.admin);
      await page.fill('#password', password);
      await page.click('button[type=submit]');
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 180000 });
      await page.goto(`${WEB}/accounting/cash-bank`, { waitUntil: 'domcontentloaded', timeout: 240000 });
      await page.waitForSelector('#cashier-wallets', { timeout: 60000 });
      const order = await page.evaluate(() => {
        const ids = ['cash-registers', 'cashier-wallets', 'other-accounts'];
        const top = (id) => { const el = document.getElementById(id); return el ? el.getBoundingClientRect().top + window.scrollY : null; };
        const wallets = top('cashier-wallets');
        const headings = [...document.querySelectorAll('h3')].map((h) => ({ t: (h.textContent || '').trim(), y: h.getBoundingClientRect().top + window.scrollY }));
        const qr = headings.find((h) => /QR/i.test(h.t));
        const bank = headings.find((h) => /bank account/i.test(h.t));
        return { wallets, registers: top('cash-registers'), other: top('other-accounts'), qrY: qr?.y ?? null, bankY: bank?.y ?? null, pageH: document.documentElement.scrollHeight };
      });
      rec(order.wallets != null, `${vp}: Day End (cashier wallets) section is present`);
      if (order.registers != null) rec(order.wallets > order.registers, `${vp}: Day End is below the cash registers`, `${Math.round(order.wallets)} > ${Math.round(order.registers)}`);
      if (order.bankY != null) rec(order.wallets > order.bankY, `${vp}: Day End is below the bank accounts`);
      if (order.qrY != null) rec(order.wallets > order.qrY, `${vp}: Day End is below the QR payments section`);
      rec(order.pageH - order.wallets < 900, `${vp}: Day End is at the END of the page`, `remaining below it: ${Math.round(order.pageH - order.wallets)}px`);
      rec(errors.length === 0, `${vp}: no runtime errors`, errors.slice(0, 1).join(''));
      if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/cash-bank-${vp}.png`, fullPage: true });
    } catch (e) { rec(false, `${vp}: flow`, String(e).slice(0, 200)); }
    await ctx.close();
  }
  await browser.close();
  process.exit(failed);
})();
