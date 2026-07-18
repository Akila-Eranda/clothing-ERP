/**
 * Tenant accounting readiness check.
 *
 * Usage (from apps/api):
 *   npx ts-node -r tsconfig-paths/register scripts/verify-accounting-tenant.ts <tenantId|subdomain>
 *
 * Requires DATABASE_URL. Bootstraps mappings if missing, prints checklist JSON.
 */

import { PrismaClient } from '@prisma/client';
import { defaultCoaSeed, normalizeAccountCode } from '../src/modules/accounting/coa.helper';
import {
  ACCOUNT_MAPPING_CODE_FALLBACKS,
  ACCOUNT_MAPPING_KEYS,
  ACCOUNT_MAPPING_LABELS,
} from '../src/modules/accounting/account-mapping.helper';

const prisma = new PrismaClient();

async function resolveTenant(idOrSlug: string) {
  const byId = await prisma.tenant.findUnique({ where: { id: idOrSlug } });
  if (byId) return byId;
  return prisma.tenant.findFirst({
    where: {
      OR: [
        { subdomain: idOrSlug },
        { name: { equals: idOrSlug, mode: 'insensitive' } },
      ],
    },
  });
}

async function ensureCoa(tenantId: string) {
  const existing = await prisma.account.findMany({
    where: { tenantId },
    select: { id: true, code: true },
  });
  const codeToId = new Map(existing.map((a) => [normalizeAccountCode(a.code), a.id]));
  let created = 0;
  for (const row of defaultCoaSeed()) {
    const code = normalizeAccountCode(row.code);
    if (codeToId.has(code)) continue;
    const parentId = row.parentCode
      ? codeToId.get(normalizeAccountCode(row.parentCode)) ?? null
      : null;
    if (row.parentCode && !parentId) continue;
    try {
      const acc = await prisma.account.create({
        data: {
          tenantId,
          code,
          name: row.name,
          type: row.type,
          description: row.description ?? null,
          parentId,
          isSystem: true,
        },
      });
      codeToId.set(code, acc.id);
      created++;
    } catch {
      /* ignore */
    }
  }
  return { created, codeToId };
}

async function ensureMappings(tenantId: string, codeToId: Map<string, string>) {
  let created = 0;
  for (const key of ACCOUNT_MAPPING_KEYS) {
    const exists = await prisma.accountMapping.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    if (exists) continue;
    let accountId: string | null = null;
    for (const code of ACCOUNT_MAPPING_CODE_FALLBACKS[key]) {
      accountId = codeToId.get(normalizeAccountCode(code)) ?? null;
      if (accountId) break;
    }
    if (!accountId) continue;
    await prisma.accountMapping.create({
      data: { tenantId, key, accountId, label: ACCOUNT_MAPPING_LABELS[key] },
    });
    created++;
  }
  return created;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: verify-accounting-tenant.ts <tenantId|subdomain|name>');
    process.exit(1);
  }

  const tenant = await resolveTenant(arg);
  if (!tenant) {
    console.error(`Tenant not found: ${arg}`);
    process.exit(1);
  }

  const coa = await ensureCoa(tenant.id);
  const mappingsCreated = await ensureMappings(tenant.id, coa.codeToId);

  await prisma.accountingPreference.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      requireJournalApproval: false,
      allowPostDraft: true,
      autoPostEnabled: true,
      repairVatEnabled: false,
    },
    update: {},
  });

  const prefs = await prisma.accountingPreference.findUnique({ where: { tenantId: tenant.id } });
  const mappings = await prisma.accountMapping.findMany({
    where: { tenantId: tenant.id },
    include: { account: { select: { code: true, name: true } } },
  });
  const byKey = Object.fromEntries(mappings.map((m) => [m.key, m.account]));

  const [accountCount, journalCount, pending, failed] = await Promise.all([
    prisma.account.count({ where: { tenantId: tenant.id, isActive: true } }),
    prisma.journalEntry.count({ where: { tenantId: tenant.id, status: { not: 'VOID' } } }),
    prisma.accountingOutboxEvent.count({ where: { tenantId: tenant.id, status: 'PENDING' } }),
    prisma.accountingOutboxEvent.count({ where: { tenantId: tenant.id, status: 'FAILED' } }),
  ]);

  const report = {
    tenant: { id: tenant.id, name: tenant.name, subdomain: tenant.subdomain },
    accountsCreatedThisRun: coa.created,
    mappingsCreatedThisRun: mappingsCreated,
    checklist: {
      initialized: accountCount > 0 && !!prefs,
      autoPostEnabled: prefs?.autoPostEnabled !== false,
      repairVatEnabled: prefs?.repairVatEnabled === true,
      accountCount,
      mappingCount: mappings.length,
      journalCount,
      pendingEvents: pending,
      failedEvents: failed,
      mappings: {
        cash: byKey.CASH ?? null,
        bank: byKey.BANK ?? null,
        ar: byKey.AR ?? null,
        ap: byKey.AP ?? null,
      },
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
