/**
 * P-F13 (audit): "a manager's PIN unlock token stays valid for 12 hours and is not bound to a user".
 *
 * Current implementation (verified here): the token is HMAC-signed and bound to tenant, branch and the terminal
 * login it was issued on. The 12 h lifetime is UNCHANGED — whether it should be shorter is a business decision
 * (shift length) and is NOT decided by these tests: the lifetime test only pins today's behaviour so a policy
 * change is a visible, deliberate edit. Cash approvals use a separate 5-minute token (cash-actor.ts).
 */
import * as crypto from 'crypto';
import { signPosUnlockToken, verifyPosUnlockToken, resolveActingCashierId } from './pos-pin.helper';

const T = 'tenant-1';
const BR = 'branch-1';
const TERMINAL = 'terminal-user-1';
const CASHIER = 'cashier-1';
const HOUR = 60 * 60 * 1000;

describe('POS unlock token binding (P-F13)', () => {
  afterEach(() => jest.useRealTimers());
  const issue = () => signPosUnlockToken(T, CASHIER, BR, TERMINAL);

  it('identifies the cashier on the terminal and branch it was issued for', () => {
    expect(verifyPosUnlockToken(issue(), T, BR, TERMINAL)).toBe(CASHIER);
  });

  it('is refused for another tenant, another branch or another terminal login', () => {
    const token = issue();
    expect(verifyPosUnlockToken(token, 'tenant-2', BR, TERMINAL)).toBeNull();
    expect(verifyPosUnlockToken(token, T, 'branch-2', TERMINAL)).toBeNull();
    expect(verifyPosUnlockToken(token, T, BR, 'terminal-user-2')).toBeNull();
  });

  it('a refused token never makes the cashier the acting user: the logged-in user acts', () => {
    expect(resolveActingCashierId(T, 'terminal-user-2', issue(), BR)).toBe('terminal-user-2');
    expect(resolveActingCashierId(T, TERMINAL, issue(), BR)).toBe(CASHIER);
    expect(resolveActingCashierId(T, TERMINAL, null, BR)).toBe(TERMINAL);
  });

  it('rejects tampered payloads, forged signatures and malformed tokens', () => {
    const [body, sig] = issue().split('.');
    const forgedBody = Buffer.from(JSON.stringify({ typ: 'pos_unlock', tenantId: T, cashierId: 'manager-9', branchId: BR, terminalUserId: TERMINAL, exp: Date.now() + HOUR })).toString('base64url');
    expect(verifyPosUnlockToken(`${forgedBody}.${sig}`, T, BR, TERMINAL)).toBeNull();                      // payload swapped, old signature
    expect(verifyPosUnlockToken(`${body}.${crypto.randomBytes(32).toString('base64url')}`, T, BR, TERMINAL)).toBeNull();
    expect(verifyPosUnlockToken(`${body}.`, T, BR, TERMINAL)).toBeNull();
    expect(verifyPosUnlockToken('garbage', T, BR, TERMINAL)).toBeNull();
    expect(verifyPosUnlockToken('', T, BR, TERMINAL)).toBeNull();
    expect(verifyPosUnlockToken(undefined, T, BR, TERMINAL)).toBeNull();
  });

  it('a token of another purpose (cash approval) is not accepted as an unlock token', () => {
    const body = Buffer.from(JSON.stringify({ typ: 'cash_approval', tenantId: T, managerId: 'm1', exp: Date.now() + HOUR })).toString('base64url');
    const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'fashionerp-dev-secret').update(body).digest('base64url');
    expect(verifyPosUnlockToken(`${body}.${sig}`, T, BR, TERMINAL)).toBeNull();
  });

  it('CHARACTERISATION (policy open): valid for 12 hours, refused after — shortening it needs an owner decision', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-14T08:00:00Z'));
    const token = issue();
    jest.setSystemTime(new Date('2026-11-14T08:00:00Z').getTime() + 12 * HOUR - 1000);
    expect(verifyPosUnlockToken(token, T, BR, TERMINAL)).toBe(CASHIER);
    jest.setSystemTime(new Date('2026-11-14T08:00:00Z').getTime() + 12 * HOUR + 1000);
    expect(verifyPosUnlockToken(token, T, BR, TERMINAL)).toBeNull();
  });
});
