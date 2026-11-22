#!/usr/bin/env node
/**
 * Browser smoke / role / responsive tests (Part 9) against a LOCAL stack: web (next dev) + API + throw-away DB.
 * Drives the locally installed Chrome through playwright-core (install it OUTSIDE the repo, e.g. in a scratch folder:
 *   npm i playwright-core   and run with NODE_PATH pointing at that node_modules).
 *
 * Env: BROWSER_SEED (JSON printed by seed-browser-env.ts), HEXA_BROWSER_PASSWORD, WEB_URL (default http://127.0.0.1:3200),
 *      SHOTS_DIR (screenshots), CHROME_PATH (default: Windows Chrome).
 */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const seed = JSON.parse(process.env.BROWSER_SEED || '{}');
const password = process.env.HEXA_BROWSER_PASSWORD;
const WEB = process.env.WEB_URL || 'http://127.0.0.1:3200';
const SHOTS = process.env.SHOTS_DIR || path.join(process.cwd(), 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!seed.subdomain || !password) { console.error('BROWSER_SEED and HEXA_BROWSER_PASSWORD are required'); process.exit(1); }
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};
const results = [];
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`); };

async function login(page, email) {
  await page.goto(`${WEB}/login?tenant=${seed.subdomain}`, { waitUntil: 'networkidle', timeout: 240000 });
  await page.waitForSelector('#email', { timeout: 120000 });
  await page.waitForTimeout(1500); // let React hydrate before submitting (a pre-hydration submit is a native form post)
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 120000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    for (const [role, email] of Object.entries(seed.users)) {
      for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
        const ctx = await browser.newContext({ viewport });
        // Behind the real reverse proxy TLS is terminated and X-Forwarded-Proto=https is set. When the web container is
        // reached directly (staging rehearsal) set WEB_XFP=https so the production HTTPS-redirect middleware behaves the same.
        if (process.env.WEB_XFP) await ctx.route(`${WEB}/**`, (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-proto': process.env.WEB_XFP } }));
        const page = await ctx.newPage();
        const consoleErrors = [];
        page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
        page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
        const label = `${role}/${vpName}`;
        try {
          await login(page, email);
          record(`${label}: login succeeds`, true, new URL(page.url()).pathname);
          await page.goto(`${WEB}/pos`, { waitUntil: 'domcontentloaded', timeout: 240000 }); // the POS polls continuously: 'networkidle' never settles
          await page.waitForTimeout(3000);
          await page.screenshot({ path: path.join(SHOTS, `${role}-${vpName}-pos.png`) });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          record(`${label}: POS has no horizontal page scroll`, overflow <= 1, `overflow=${overflow}px`);
          const fatal = consoleErrors.filter((e) => /pageerror|Hydration|Uncaught|is not defined/i.test(e));
          record(`${label}: no runtime errors in console`, fatal.length === 0, fatal.slice(0, 2).join(' | '));
        } catch (e) {
          record(`${label}: flow`, false, String(e).slice(0, 220));
          try { await page.screenshot({ path: path.join(SHOTS, `${role}-${vpName}-FAIL.png`) }); } catch { /* ignore */ }
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
