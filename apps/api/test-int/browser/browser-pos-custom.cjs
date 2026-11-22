#!/usr/bin/env node
/**
 * Browser test for custom / Demo items at the POS, per ROLE (Part 7 + Part 9). Same environment variables as
 * browser-smoke.cjs. Verifies, in a real browser against the real API + database:
 *   - cashier: gets the "needs a manager" warning when adding a Demo item and is stopped BEFORE a sale is attempted
 *   - manager: adds a Demo item silently and completes a cash sale
 * The caller then checks the database (exactly one bill-only sale, made by the manager).
 */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const seed = JSON.parse(process.env.BROWSER_SEED || '{}');
const password = process.env.HEXA_BROWSER_PASSWORD;
const WEB = process.env.WEB_URL || 'http://127.0.0.1:3200';
const SHOTS = process.env.SHOTS_DIR || path.join(process.cwd(), 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`); };

async function login(page, email) {
  await page.goto(`${WEB}/login?tenant=${seed.subdomain}`, { waitUntil: 'networkidle', timeout: 240000 });
  await page.waitForSelector('#email', { timeout: 120000 });
  await page.waitForTimeout(1500); // let React hydrate before submitting
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 180000 });
}

async function openPos(page) {
  await page.goto(`${WEB}/pos`, { waitUntil: 'domcontentloaded', timeout: 240000 }); // the POS polls continuously: 'networkidle' never settles
  const cont = page.getByRole('button', { name: /^Continue$/ });
  try { await cont.waitFor({ timeout: 20000 }); await cont.click(); } catch { /* shift already continued */ }
  await page.waitForTimeout(1500);
}

async function addDemoItem(page, name, price) {
  await page.locator('button:has-text("Demo Product"), a:has-text("Demo Product"), [role=button]:has-text("Demo Product")').first().click();
  await page.getByPlaceholder('Demo item name').fill(name);
  await page.locator('label:has-text("Selling")').locator('..').locator('input').fill(String(price));
  await page.getByPlaceholder('Demo item name').press('Enter');
}

/** Opens the checkout dialog (Ctrl+Enter), enters LKR 500 cash with the quick-cash key and confirms the payment. */
async function payCash500(page) {
  await page.keyboard.press('Control+Enter');
  await page.getByText('Cash Received (LKR)').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: '500', exact: true }).click();
  await page.getByRole('button', { name: /Confirm Payment/ }).click();
}

async function scenario(browser, role, expectManager) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Behind the real reverse proxy TLS is terminated and X-Forwarded-Proto=https is set. When the web container is
  // reached directly (staging rehearsal) set WEB_XFP=https so the production HTTPS-redirect middleware behaves the same.
  if (process.env.WEB_XFP) await ctx.route(`${WEB}/**`, (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-proto': process.env.WEB_XFP } }));
  const page = await ctx.newPage();
  try {
    await login(page, seed.users[role]);
    await openPos(page);
    await addDemoItem(page, `Browser cake ${role}`, 500);
    const warning = page.getByText(/need a manager/i).first();
    if (expectManager) {
      await page.getByText(/Demo item added/i).first().waitFor({ timeout: 15000 });
      record(`${role}: Demo item added`, true);
      record(`${role}: NO manager warning`, (await warning.count()) === 0);
      await page.screenshot({ path: path.join(SHOTS, `${role}-demo-added.png`) });
      await payCash500(page);
      await page.getByText(/Sale complete/i).first().waitFor({ timeout: 60000 });
      record(`${role}: cash sale with a Demo item completes`, true);
      await page.screenshot({ path: path.join(SHOTS, `${role}-sale-complete.png`) });
    } else {
      await warning.waitFor({ timeout: 15000 });
      record(`${role}: early warning shown when adding a Demo item`, true);
      await page.waitForTimeout(6500); // let the first toast expire
      await payCash500(page);
      await warning.waitFor({ timeout: 15000 });
      record(`${role}: checkout is stopped before any sale is attempted`, true);
      const completed = await page.getByText(/Sale complete/i).count();
      record(`${role}: no "Sale complete" shown`, completed === 0);
      await page.screenshot({ path: path.join(SHOTS, `${role}-blocked.png`) });
    }
  } catch (e) {
    record(`${role}: scenario`, false, String(e).slice(0, 240));
    try { await page.screenshot({ path: path.join(SHOTS, `${role}-scenario-FAIL.png`) }); } catch { /* ignore */ }
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    await scenario(browser, 'cashier', false);
    await scenario(browser, 'manager', true);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
