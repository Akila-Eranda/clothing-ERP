#!/usr/bin/env node
/**
 * Staging smoke test for the seven functional issues (API level, Node >= 18). Uses ONLY staging test accounts.
 * It creates test data (customer, bank account, QR, sales) in the staging database - never run it against production.
 * It NEVER calls POST /whatsapp/connect and sends no WhatsApp message.
 *
 *   STAGING_API=http://127.0.0.1:58001/api/v1 STAGING_TENANT=<subdomain> STAGING_PASSWORD=... \
 *   STAGING_ADMIN=admin@.. STAGING_MANAGER=manager@.. STAGING_CASHIER=cashier@..  node ops/staging/staging-smoke.cjs
 *
 * Prerequisite fixtures (see ops/staging/README.md): a shop with those three users, products Milk (stock >= 20) and
 * LastUnit (stock exactly 1), and an OPEN shift for the admin and the cashier.
 */
const API = process.env.STAGING_API;
const SUB = process.env.STAGING_TENANT;
const PW = process.env.STAGING_PASSWORD;
const USERS = { admin: process.env.STAGING_ADMIN, manager: process.env.STAGING_MANAGER, cashier: process.env.STAGING_CASHIER };
if (!API || !SUB || !PW || !USERS.admin || !USERS.manager || !USERS.cashier) {
  console.error('Set STAGING_API, STAGING_TENANT, STAGING_PASSWORD, STAGING_ADMIN, STAGING_MANAGER, STAGING_CASHIER');
  process.exit(2);
}
if (/hexalyte\.com|\.shop\.|fashionerp/i.test(API)) { console.error('Refusing: this looks like a production URL'); process.exit(2); }

const tokens = {};
const results = [];
let n = 0;
const key = () => `smoke-${Date.now().toString(36)}-${++n}-${Math.random().toString(36).slice(2, 8)}`;
const rec = (id, name, ok, detail = '') => { results.push({ id, name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? '  - ' + detail : ''}`); };
const unwrap = (b) => (b && typeof b === 'object' && 'data' in b ? b.data : b);

// The API rate-limits per client IP (10 req/s). Real tills have different IPs; the smoke test runs from one machine, so
// each call claims its own client address via X-Forwarded-For. This only works when the stack trusts one proxy hop
// (TRUST_PROXY_HOPS=1, set in docker-compose.staging.yml); otherwise a burst from one IP is correctly refused with 429.
let ipSeq = 0;
async function call(role, method, path, body, extraHeaders = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-tenant-id': SUB, 'x-forwarded-for': `198.51.100.${(ipSeq++ % 250) + 1}`, ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* not json */ }
  return { status: r.status, body: json, data: unwrap(json), message: json?.message };
}

const saleBody = (items, total, extra = {}) => ({
  items, payments: [{ method: 'CASH', amount: total }], applyTierDiscount: false, clientRequestId: key(), ...extra,
});
const stockLine = (v, qty, price) => ({ variantId: v.id, productName: v.name, variantName: 'Default', sku: v.sku || 'SKU', quantity: qty, unitPrice: price, costPrice: 1 });

async function findVariant(name) {
  const r = await call('admin', 'GET', `/products?search=${encodeURIComponent(name)}&limit=20`);
  const list = r.data?.items ?? r.data?.data ?? r.data ?? [];
  const p = (Array.isArray(list) ? list : []).find((x) => x.name === name);
  if (!p) throw new Error(`fixture product "${name}" not found`);
  const v = p.variants?.[0];
  return { id: v?.id, name: p.name, sku: v?.sku, price: v?.sellingPrice ?? p.sellingPrice };
}

(async () => {
  for (const [role, email] of Object.entries(USERS)) {
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant-id': SUB }, body: JSON.stringify({ email, password: PW }) });
    const b = await r.json();
    tokens[role] = unwrap(b)?.accessToken;
    rec('SETUP', `login ${role}`, r.status === 200 && !!tokens[role], `status ${r.status}`);
  }
  if (!tokens.admin || !tokens.manager || !tokens.cashier) process.exit(1);
  const milk = await findVariant('Milk');
  const last = await findVariant('LastUnit');

  // ── QA-001 customer receivables ──────────────────────────────────────────────────────────────────────
  const cust = await call('admin', 'POST', '/customers', { firstName: 'Smoke', lastName: 'Customer', phone: `07${Math.floor(Math.random() * 1e8)}`, creditLimit: 100000, creditDays: 30 });
  const customerId = cust.data?.id;
  rec('QA-001', 'customer created', !!customerId, `status ${cust.status} ${cust.message ?? ''}`);
  const credit = await call('admin', 'POST', '/pos/sale', saleBody([stockLine(milk, 3, 100)], 300, { customerId, payments: [{ method: 'CUSTOMER_CREDIT', amount: 300 }] }));
  rec('QA-001', 'credit sale of 300 accepted', credit.status === 201 || credit.status === 200, `status ${credit.status} ${credit.message ?? ''}`);
  const k = key();
  const p1 = await call('admin', 'POST', `/customers/${customerId}/credit/payment`, { amount: 100, clientRequestId: k, paymentMethod: 'CASH' });
  rec('QA-001', 'partial payment 100: outstanding becomes 200', p1.data?.creditBalance === 200, `balance=${p1.data?.creditBalance}`);
  const p1b = await call('admin', 'POST', `/customers/${customerId}/credit/payment`, { amount: 100, clientRequestId: k, paymentMethod: 'CASH' });
  rec('QA-001', 'replay of the same payment key changes nothing (idempotent)', p1b.data?.idempotentReplay === true && p1b.data?.creditBalance === 200);
  const par = await Promise.all(Array.from({ length: 4 }, () => call('admin', 'POST', `/customers/${customerId}/credit/payment`, { amount: 25, clientRequestId: key(), paymentMethod: 'CARD', cardLast4: '4242' })));
  rec('QA-001', '4 concurrent card payments of 25 all recorded exactly once', par.every((r) => r.status === 201 || r.status === 200));
  const led = await call('admin', 'GET', `/customers/${customerId}/credit/ledger`);
  rec('QA-001', 'ledger closing balance = stored outstanding (100)', Math.abs((led.data?.closing ?? led.data?.currentBalance ?? NaN) - 100) < 0.01, `closing=${led.data?.closing ?? led.data?.currentBalance}`);

  // ── QA-002 / QA-006 bank accounts + QR ───────────────────────────────────────────────────────────────
  const acct = await call('admin', 'POST', '/accounting/bank-accounts', { code: `SMK-${Date.now().toString(36)}`, name: 'Smoke Bank', type: 'CURRENT', bankName: 'Bank of Ceylon', accountNumber: `0081${Math.floor(Math.random() * 1e8)}`, accountHolderName: 'Smoke Ltd', branchName: 'Fort', branchCode: '001' });
  const bankId = acct.data?.id;
  rec('QA-006', 'bank account created', !!bankId, `status ${acct.status} ${acct.message ?? ''}`);
  const qr = await call('admin', 'POST', '/payment-qr', { label: 'Smoke QR', bankAccountId: bankId, mode: 'STATIC', isDefault: false });
  rec('QA-002', 'admin creates a QR code (the originally failing call)', qr.status === 201, `status ${qr.status} ${qr.message ?? ''}`);
  const pos1 = await call('cashier', 'GET', '/payment-qr/pos');
  rec('QA-002', 'cashier sees the QR in the POS list immediately', (pos1.data ?? []).some((c) => c.id === qr.data?.id));
  const stale = acct.data?.updatedAt;
  const ren = await call('admin', 'PUT', `/accounting/bank-accounts/${bankId}`, { name: 'Smoke Bank (renamed)', expectedUpdatedAt: stale });
  rec('QA-006', 'rename without re-entering any bank detail succeeds', ren.status === 200, `status ${ren.status} ${ren.message ?? ''}`);
  const ren2 = await call('admin', 'PUT', `/accounting/bank-accounts/${bankId}`, { name: 'Smoke Bank (stale)', expectedUpdatedAt: stale });
  rec('QA-006', 'a stale editor is refused (409)', ren2.status === 409, `status ${ren2.status}`);
  const off = await call('admin', 'PUT', `/accounting/bank-accounts/${bankId}`, { isActive: false });
  rec('QA-006', 'disable succeeds', off.status === 200);
  const pos2 = await call('cashier', 'GET', '/payment-qr/pos');
  rec('QA-002', 'disabled bank account removes its QR from the POS list', !(pos2.data ?? []).some((c) => c.id === qr.data?.id));
  const caQr = await call('cashier', 'POST', '/payment-qr', { label: 'Nope', bankAccountId: bankId, mode: 'STATIC' });
  rec('QA-002', 'cashier cannot create a QR (403 with a readable reason)', caQr.status === 403 && /permission/i.test(String(caQr.message)), String(caQr.message));

  // ── QA-005 checkout reliability + QA-007 custom items ────────────────────────────────────────────────
  const race = await Promise.allSettled([
    call('cashier', 'POST', '/pos/sale', saleBody([stockLine(last, 1, 100)], 100)),
    call('manager', 'POST', '/pos/sale', saleBody([stockLine(last, 1, 100)], 100)),
  ]);
  const oks = race.filter((x) => x.status === 'fulfilled' && [200, 201].includes(x.value.status)).length;
  rec('QA-005', 'two cashiers, one last unit: exactly one sale succeeds', oks === 1, `successes=${oks}`);
  const idem = key();
  const dup = await Promise.all(Array.from({ length: 6 }, () => call('admin', 'POST', '/pos/sale', saleBody([stockLine(milk, 1, 100)], 100, { clientRequestId: idem }))));
  const ids = new Set(dup.map((r) => r.data?.id).filter(Boolean));
  rec('QA-005', '6 parallel requests with one idempotency key create exactly one sale', ids.size === 1 && dup.every((r) => [200, 201].includes(r.status)), `distinct sales=${ids.size}`);
  const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => call(['admin', 'manager', 'cashier'][i % 3], 'POST', '/pos/sale', saleBody([stockLine(milk, 1, 100)], 100))));
  rec('QA-005', '20 simultaneous checkouts (more than the DB pool of default size) all complete without pool errors', burst.every((r) => [200, 201].includes(r.status)), `failed=${burst.filter((r) => ![200, 201].includes(r.status)).length}`);
  const custom = { isCustom: true, productName: 'Smoke custom', variantName: '', sku: 'CUSTOM', quantity: 1, unitPrice: 250, costPrice: 0 };
  const cs = await call('cashier', 'POST', '/pos/sale', saleBody([custom], 250));
  rec('QA-007', 'cashier is refused a custom/demo line (403 manager authorization)', cs.status === 403 && /manager/i.test(String(cs.message)), `status ${cs.status}`);
  const ms = await call('manager', 'POST', '/pos/sale', saleBody([custom, stockLine(milk, 1, 100)], 350));
  rec('QA-007', 'manager sells a mixed custom + stock cart', [200, 201].includes(ms.status), `status ${ms.status} ${ms.message ?? ''}`);

  // ── QA-004 WhatsApp (read-only: status only; never connect, never send) ──────────────────────────────
  const wa = await call('admin', 'GET', '/whatsapp/status');
  rec('QA-004', 'WhatsApp status endpoint answers (no connection attempted)', wa.status === 200 && typeof wa.data?.status === 'string', `status=${wa.data?.status}`);

  // ── QA-003 cash flow + day end ───────────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const flow = await call('admin', 'GET', `/cash/physical-flow?from=${today}&to=${today}`);
  const t = flow.data?.totals;
  rec('QA-003', 'physical cash-flow report answers with a reconciling total', flow.status === 200 && flow.data?.reconciles === true && !!t, `status ${flow.status}`);
  if (t) rec('QA-003', 'Opening + inflows - outflows = Expected closing', Math.abs(t.opening + t.inflowTotal - t.outflowTotal - t.expectedClosing) < 0.01);
  const csv = await fetch(`${API}/cash/physical-flow/csv?from=${today}&to=${today}`, { headers: { authorization: `Bearer ${tokens.admin}`, 'x-tenant-id': SUB } });
  rec('QA-003', 'CSV export downloads', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type') || ''));
  const act = await call('admin', 'GET', '/cash/active');
  const regId = act.data?.id;
  if (regId) {
    const c1 = await Promise.all([1, 2, 3].map(() => call('admin', 'POST', `/cash/${regId}/close`, { actualCash: act.data?.expectedCash ?? 0 })));
    const closedOk = c1.filter((r) => [200, 201].includes(r.status)).length;
    rec('QA-003', 'three simultaneous day-end close requests close the shift exactly once', closedOk === 1, `successes=${closedOk}`);
  } else rec('QA-003', 'active shift found for the close test', false, 'no open shift for admin (fixture missing)');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  console.log(`SMOKE_CUSTOMER_ID=${customerId ?? ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('smoke aborted:', e.message); process.exit(1); });
