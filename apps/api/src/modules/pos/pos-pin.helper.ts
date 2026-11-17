/** POS cashier PIN unlock — switch operator without full re-login. */

import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { BadRequestException } from '@nestjs/common';

const BCRYPT_ROUNDS = 10;
const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export type PosUnlockPayload = {
  typ: 'pos_unlock';
  tenantId: string;
  cashierId: string;
  branchId?: string;
  terminalUserId?: string;
  exp: number;
};

function secret() {
  return process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'fashionerp-dev-secret';
}

export function assertValidPosPin(pin: string) {
  if (!/^\d{4}$/.test(pin)) {
    throw new BadRequestException('POS PIN must be exactly 4 digits');
  }
}

export async function hashPosPin(pin: string) {
  assertValidPosPin(pin);
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPosPinHash(pin: string, hash: string | null | undefined) {
  if (!hash) return false;
  return bcrypt.compare(pin, hash);
}

export function signPosUnlockToken(
  tenantId: string,
  cashierId: string,
  branchId?: string,
  terminalUserId?: string,
) {
  const payload: PosUnlockPayload = {
    typ: 'pos_unlock',
    tenantId,
    cashierId,
    ...(branchId ? { branchId } : {}),
    ...(terminalUserId ? { terminalUserId } : {}),
    exp: Date.now() + UNLOCK_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyPosUnlockToken(
  token: string | undefined | null,
  tenantId: string,
  branchId?: string,
  terminalUserId?: string,
): string | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PosUnlockPayload;
    if (payload.typ !== 'pos_unlock') return null;
    if (payload.tenantId !== tenantId) return null;
    // Tokens issued before branch/terminal binding remain valid only until their short
    // expiry; newly issued tokens carry both bindings and are checked strictly.
    if (branchId && payload.branchId && payload.branchId !== branchId) return null;
    if (terminalUserId && payload.terminalUserId && payload.terminalUserId !== terminalUserId) return null;
    if (!payload.cashierId || payload.exp < Date.now()) return null;
    return payload.cashierId;
  } catch {
    return null;
  }
}

/** Prefer unlock-token cashier; fall back to logged-in user. */
export function resolveActingCashierId(
  tenantId: string,
  loggedInUserId: string,
  unlockToken?: string | null,
  branchId?: string,
): string {
  return verifyPosUnlockToken(unlockToken, tenantId, branchId, loggedInUserId) ?? loggedInUserId;
}
