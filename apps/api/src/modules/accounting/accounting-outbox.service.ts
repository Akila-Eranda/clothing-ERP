/** Durable accounting outbox — enqueue, process, retry commerce GL posts. */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountingOutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AccountingPostingService } from './accounting-posting.service';

export type OutboxSourceType =
  | 'SALE'
  | 'SALE_RETURN'
  | 'GRN'
  | 'SUPPLIER_PAYMENT'
  | 'SUPPLIER_INVOICE'
  | 'SUPPLIER_RETURN'
  | 'CUSTOMER_CREDIT_PAYMENT'
  | 'EXPENSE'
  | 'REPAIR';

@Injectable()
export class AccountingOutboxService {
  private readonly logger = new Logger(AccountingOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: AccountingPostingService,
  ) {}

  async isAutoPostEnabled(tenantId: string): Promise<boolean> {
    const prefs = await this.prisma.accountingPreference.findUnique({
      where: { tenantId },
      select: { autoPostEnabled: true },
    });
    return prefs?.autoPostEnabled !== false;
  }

  /** Enqueue (idempotent). If auto-post ON (and not queueOnly), process immediately. */
  async enqueue(
    tenantId: string,
    sourceType: OutboxSourceType,
    sourceId: string,
    payload: Record<string, unknown> = {},
    opts?: { forceProcess?: boolean; queueOnly?: boolean },
  ) {
    const shouldReset = await this.shouldResetOnEnqueue(tenantId, sourceType, sourceId);
    const row = await this.prisma.accountingOutboxEvent.upsert({
      where: {
        tenantId_sourceType_sourceId: { tenantId, sourceType, sourceId },
      },
      create: {
        tenantId,
        sourceType,
        sourceId,
        payload: payload as Prisma.InputJsonValue,
        status: AccountingOutboxStatus.PENDING,
      },
      update: shouldReset
        ? {
            status: AccountingOutboxStatus.PENDING,
            lastError: null,
            payload: payload as Prisma.InputJsonValue,
          }
        : {},
    });

    if (row.status === AccountingOutboxStatus.POSTED && !shouldReset) {
      return { event: row, processed: false, reason: 'already_posted' as const };
    }

    if (opts?.queueOnly) {
      return { event: row, processed: false, reason: 'queued' as const };
    }

    const auto = opts?.forceProcess || (await this.isAutoPostEnabled(tenantId));
    if (!auto) {
      return { event: row, processed: false, reason: 'queued' as const };
    }

    const processed = await this.processOne(row.id, tenantId);
    return { event: processed, processed: true, reason: 'processed' as const };
  }

  private async shouldResetOnEnqueue(tenantId: string, sourceType: string, sourceId: string) {
    const existing = await this.prisma.accountingOutboxEvent.findUnique({
      where: { tenantId_sourceType_sourceId: { tenantId, sourceType, sourceId } },
      select: { status: true },
    });
    if (!existing) return false;
    return (
      existing.status === AccountingOutboxStatus.FAILED ||
      existing.status === AccountingOutboxStatus.SKIPPED ||
      existing.status === AccountingOutboxStatus.PENDING
    );
  }

  async list(
    tenantId: string,
    query?: { status?: AccountingOutboxStatus; limit?: number },
  ) {
    return this.prisma.accountingOutboxEvent.findMany({
      where: {
        tenantId,
        ...(query?.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, query?.limit ?? 50),
    });
  }

  async processPending(tenantId: string, limit = 50) {
    const pending = await this.prisma.accountingOutboxEvent.findMany({
      where: {
        tenantId,
        status: { in: [AccountingOutboxStatus.PENDING, AccountingOutboxStatus.FAILED] },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(200, limit),
    });

    let posted = 0;
    let failed = 0;
    let skipped = 0;
    for (const ev of pending) {
      const r = await this.processOne(ev.id, tenantId);
      if (r.status === AccountingOutboxStatus.POSTED) posted++;
      else if (r.status === AccountingOutboxStatus.FAILED) failed++;
      else skipped++;
    }
    return { processed: pending.length, posted, failed, skipped };
  }

  async retry(tenantId: string, eventId: string) {
    const ev = await this.prisma.accountingOutboxEvent.findFirst({
      where: { id: eventId, tenantId },
    });
    if (!ev) throw new NotFoundException('Outbox event not found');
    await this.prisma.accountingOutboxEvent.update({
      where: { id: eventId },
      data: { status: AccountingOutboxStatus.PENDING, lastError: null },
    });
    return this.processOne(eventId, tenantId);
  }

  async processOne(eventId: string, tenantId: string) {
    const ev = await this.prisma.accountingOutboxEvent.findFirst({
      where: { id: eventId, tenantId },
    });
    if (!ev) throw new NotFoundException('Outbox event not found');
    if (ev.status === AccountingOutboxStatus.POSTED) return ev;

    await this.prisma.accountingOutboxEvent.update({
      where: { id: eventId },
      data: {
        status: AccountingOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });

    try {
      const result = await this.dispatch(ev.sourceType as OutboxSourceType, ev.sourceId, tenantId, ev.payload);
      const journalId =
        result && typeof result === 'object' && 'journalId' in result
          ? (result.journalId as string | null)
          : null;
      const skipped =
        result && typeof result === 'object' && 'skipped' in result
          ? Boolean((result as { skipped?: boolean }).skipped)
          : !journalId;

      return this.prisma.accountingOutboxEvent.update({
        where: { id: eventId },
        data: {
          status: journalId
            ? AccountingOutboxStatus.POSTED
            : skipped
              ? AccountingOutboxStatus.SKIPPED
              : AccountingOutboxStatus.FAILED,
          journalEntryId: journalId,
          lastError: journalId ? null : skipped ? 'skipped_or_no_journal' : 'no_journal',
          processedAt: new Date(),
        },
      });
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Outbox ${ev.sourceType}/${ev.sourceId}: ${msg}`);
      return this.prisma.accountingOutboxEvent.update({
        where: { id: eventId },
        data: {
          status: AccountingOutboxStatus.FAILED,
          lastError: msg.slice(0, 1000),
          processedAt: new Date(),
        },
      });
    }
  }

  private async dispatch(
    sourceType: OutboxSourceType,
    sourceId: string,
    tenantId: string,
    payload: Prisma.JsonValue,
  ) {
    const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    switch (sourceType) {
      case 'SALE':
        return this.posting.postSale(sourceId, tenantId, String(p.userId ?? 'system'));
      case 'SALE_RETURN':
        return this.posting.postReturn(sourceId, tenantId, String(p.userId ?? 'system'));
      case 'GRN':
        return this.posting.postGoodsReceipt(sourceId, tenantId, String(p.userId ?? 'system'));
      case 'SUPPLIER_PAYMENT':
        return this.posting.postSupplierPayment(sourceId, tenantId, String(p.userId ?? 'system'));
      case 'SUPPLIER_INVOICE':
        return this.posting.postSupplierInvoice(sourceId, tenantId, String(p.userId ?? 'system'));
      case 'SUPPLIER_RETURN':
        return this.posting.postSupplierReturn(sourceId, tenantId, String(p.userId ?? 'system'));
      case 'EXPENSE':
        return this.posting.postExpense(sourceId, tenantId, String(p.userId ?? 'system'));
      case 'REPAIR':
        return this.posting.postRepair(sourceId, tenantId, String(p.userId ?? 'system'));
      case 'CUSTOMER_CREDIT_PAYMENT':
        return this.posting.postCustomerCreditPayment({
          tenantId,
          paymentTxnId: sourceId,
          customerId: String(p.customerId ?? ''),
          amount: Number(p.amount ?? 0),
          applied: Number(p.applied ?? 0),
          advance: Number(p.advance ?? 0),
          method: String(p.method ?? 'CASH'),
          applyFromWallet: Boolean(p.applyFromWallet),
          description: String(p.description ?? `AR collection ${sourceId}`),
          branchId: p.branchId ? String(p.branchId) : undefined,
          userId: p.userId ? String(p.userId) : 'system',
          date: p.date ? new Date(String(p.date)) : undefined,
        });
      default:
        throw new Error(`Unknown sourceType ${sourceType}`);
    }
  }

  /** Scan operational docs missing journals and enqueue them. */
  async scanMissing(tenantId: string, limit = 100) {
    const take = Math.min(300, limit);
    const postedRefs = await this.prisma.journalEntry.findMany({
      where: {
        tenantId,
        status: { not: 'VOID' },
        referenceType: { not: null },
        referenceId: { not: null },
      },
      select: { referenceType: true, referenceId: true },
    });
    const have = new Set(
      postedRefs.map((r) => `${r.referenceType}:${r.referenceId}`),
    );

    const [sales, grns, expenses, apPays, invoices, returns, jobCards, saleReturns] =
      await Promise.all([
        this.prisma.sale.findMany({
          where: { tenantId, status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true },
        }),
        this.prisma.goodsReceipt.findMany({
          where: { tenantId, status: 'POSTED' },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true },
        }),
        this.prisma.expense.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true },
        }),
        this.prisma.supplierPayment.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true },
        }),
        this.prisma.supplierInvoice.findMany({
          where: { tenantId, status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] } },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true },
        }),
        this.prisma.supplierReturn.findMany({
          where: { tenantId, status: 'POSTED' },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true },
        }),
        this.prisma.jobCard.findMany({
          where: { tenantId, status: { in: ['COMPLETED', 'INVOICED'] } },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true },
        }),
        this.prisma.return.findMany({
          where: { tenantId, status: { in: ['COMPLETED', 'APPROVED', 'REFUND_PROCESSED'] } },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true },
        }),
      ]);

    const missing: { sourceType: OutboxSourceType; sourceId: string }[] = [];
    const push = (sourceType: OutboxSourceType, id: string, refType: string) => {
      if (!have.has(`${refType}:${id}`)) missing.push({ sourceType, sourceId: id });
    };

    for (const s of sales) push('SALE', s.id, 'SALE');
    for (const g of grns) push('GRN', g.id, 'GRN');
    for (const e of expenses) push('EXPENSE', e.id, 'EXPENSE');
    for (const p of apPays) push('SUPPLIER_PAYMENT', p.id, 'SUPPLIER_PAYMENT');
    for (const i of invoices) push('SUPPLIER_INVOICE', i.id, 'SUPPLIER_INVOICE');
    for (const r of returns) push('SUPPLIER_RETURN', r.id, 'SUPPLIER_RETURN');
    for (const j of jobCards) push('REPAIR', j.id, 'REPAIR');
    for (const r of saleReturns) push('SALE_RETURN', r.id, 'SALE_RETURN');

    let enqueued = 0;
    for (const m of missing) {
      await this.enqueue(tenantId, m.sourceType, m.sourceId, {}, { queueOnly: true });
      enqueued++;
    }

    return {
      missing: missing.length,
      enqueued,
      byType: missing.reduce(
        (acc, m) => {
          acc[m.sourceType] = (acc[m.sourceType] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  async verifyChecklist(tenantId: string) {
    const [prefs, accountCount, mappingCount, pending, failed, journalCount] = await Promise.all([
      this.prisma.accountingPreference.findUnique({ where: { tenantId } }),
      this.prisma.account.count({ where: { tenantId, isActive: true } }),
      this.prisma.accountMapping.count({ where: { tenantId } }),
      this.prisma.accountingOutboxEvent.count({
        where: { tenantId, status: AccountingOutboxStatus.PENDING },
      }),
      this.prisma.accountingOutboxEvent.count({
        where: { tenantId, status: AccountingOutboxStatus.FAILED },
      }),
      this.prisma.journalEntry.count({ where: { tenantId, status: { not: 'VOID' } } }),
    ]);

    const mappings = await this.prisma.accountMapping.findMany({
      where: { tenantId },
      select: { key: true, account: { select: { code: true, name: true } } },
    });
    const byKey = Object.fromEntries(mappings.map((m) => [m.key, m.account]));

    return {
      initialized: accountCount > 0 && !!prefs,
      autoPostEnabled: prefs?.autoPostEnabled !== false,
      repairVatEnabled: prefs?.repairVatEnabled === true,
      accountCount,
      mappingCount,
      journalCount,
      pendingEvents: pending,
      failedEvents: failed,
      mappings: {
        cash: byKey.CASH ?? null,
        bank: byKey.BANK ?? null,
        ar: byKey.AR ?? null,
        ap: byKey.AP ?? null,
      },
    };
  }
}
