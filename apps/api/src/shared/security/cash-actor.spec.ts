import { RoleType } from '@prisma/client';
import { signPosUnlockToken } from '@/modules/pos/pos-pin.helper';
import {
  isCashManagerRole, resolveCashActor,
  signCashApprovalToken, verifyCashApprovalToken,
} from './cash-actor';

function db(users: Record<string, { tenantId: string; status?: string; roles: string[] }>) {
  return {
    user: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; tenantId: string; status: string } }) => {
        const u = users[where.id];
        if (!u || u.tenantId !== where.tenantId || (u.status ?? 'ACTIVE') !== where.status) return null;
        return { roles: u.roles.map((type) => ({ role: { type } })) };
      }),
    },
  };
}

const T = 't1';
const users = {
  mgr: { tenantId: T, roles: [RoleType.BRANCH_MANAGER] },
  cashier: { tenantId: T, roles: [RoleType.CASHIER] },
  gone: { tenantId: T, status: 'INACTIVE', roles: [RoleType.CASHIER] },
  otherShopMgr: { tenantId: 't2', roles: [RoleType.BRANCH_MANAGER] },
};

describe('cash actor (PIN identity vs terminal login)', () => {
  it('manager roles', () => {
    expect(isCashManagerRole([RoleType.BRANCH_MANAGER])).toBe(true);
    expect(isCashManagerRole([RoleType.TENANT_ADMIN])).toBe(true);
    expect(isCashManagerRole([RoleType.CASHIER])).toBe(false);
  });

  it('a PIN cashier on a manager-logged terminal acts as the cashier, with NO manager authority', async () => {
    const a = await resolveCashActor(db(users) as never, {
      tenantId: T, user: { id: 'mgr', roles: [RoleType.BRANCH_MANAGER] }, unlockToken: signPosUnlockToken(T, 'cashier'),
    });
    expect(a).toEqual({ actorId: 'cashier', actorRoles: [RoleType.CASHIER], actorIsManager: false, authorizerId: null });
  });

  it('a manager acting themselves authorises their own action', async () => {
    const a = await resolveCashActor(db(users) as never, { tenantId: T, user: { id: 'mgr', roles: [RoleType.BRANCH_MANAGER] } });
    expect(a).toMatchObject({ actorId: 'mgr', actorIsManager: true, authorizerId: 'mgr' });
  });

  it('an explicit manager approval token makes that manager the authoriser', async () => {
    const a = await resolveCashActor(db(users) as never, {
      tenantId: T, user: { id: 'cashier', roles: [RoleType.CASHIER] }, approvalToken: signCashApprovalToken(T, 'mgr'),
    });
    expect(a).toMatchObject({ actorId: 'cashier', actorIsManager: false, authorizerId: 'mgr' });
  });

  it('approval tokens of non-managers, other shops, expired or forged tokens give no authority', async () => {
    const d = db(users) as never;
    const cashierUser = { id: 'cashier', roles: [RoleType.CASHIER] };
    expect((await resolveCashActor(d, { tenantId: T, user: cashierUser, approvalToken: signCashApprovalToken(T, 'cashier') })).authorizerId).toBeNull();
    expect((await resolveCashActor(d, { tenantId: T, user: cashierUser, approvalToken: signCashApprovalToken('t2', 'otherShopMgr') })).authorizerId).toBeNull();
    expect((await resolveCashActor(d, { tenantId: T, user: cashierUser, approvalToken: signCashApprovalToken(T, 'mgr', Date.now() - 10 * 60_000) })).authorizerId).toBeNull();
    const forged = signCashApprovalToken(T, 'mgr').replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    expect(verifyCashApprovalToken(forged, T)).toBeNull();
    expect(verifyCashApprovalToken(signPosUnlockToken(T, 'mgr'), T)).toBeNull(); // a PIN unlock token is not an approval
  });

  it('a PIN token for an inactive user is refused', async () => {
    await expect(resolveCashActor(db(users) as never, {
      tenantId: T, user: { id: 'mgr', roles: [RoleType.BRANCH_MANAGER] }, unlockToken: signPosUnlockToken(T, 'gone'),
    })).rejects.toThrow(/not active/);
  });
});
