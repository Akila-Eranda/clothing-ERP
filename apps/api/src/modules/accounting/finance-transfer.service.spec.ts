import { BadRequestException, ConflictException } from '@nestjs/common';
import { BankTxnType, JournalEntryStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditLogService } from '@/modules/audit-log/audit-log.service';
import { FinanceService } from './finance.service';
import { bankTransferRequestFingerprint } from './finance.helper';
import { FinancialPeriodsService } from './financial-periods.service';
import { JournalEntriesService } from './journal-entries.service';

const request = {
  fromAccountId: 'bank-a',
  toAccountId: 'bank-b',
  amount: 125,
  clientRequestId: 'transfer-request-1',
};

function setup(options: {
  existingRows?: object[];
  lockedRows?: object[];
  debitCount?: number;
  sourceBalance?: number;
} = {}) {
  const from = {
    id: 'bank-a',
    tenantId: 'tenant-a',
    isActive: true,
    code: 'A',
    currentBalance: options.sourceBalance ?? 500,
    glAccountId: 'gl-a',
  };
  const to = {
    id: 'bank-b',
    tenantId: 'tenant-a',
    isActive: true,
    code: 'B',
    currentBalance: 200,
    glAccountId: 'gl-b',
  };
  let committed = false;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: from.id }, { id: to.id }]),
    bankAccount: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === from.id ? from : to),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: options.debitCount ?? 1 }),
    },
    bankTransaction: {
      findMany: jest.fn().mockResolvedValue(options.lockedRows ?? []),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, id: `txn-${String(data.type).toLowerCase()}` }),
      ),
    },
    journalEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'journal-locked-replay' }) },
  };
  const prisma = {
    bankAccount: { findFirst: jest.fn().mockResolvedValue({ id: request.fromAccountId }) },
    bankTransaction: {
      findMany: jest.fn().mockResolvedValue(options.existingRows ?? []),
    },
    journalEntry: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      const result = await callback(tx);
      committed = true;
      return result;
    }),
  };
  const journalEntry = {
    id: 'journal-1',
    entryNumber: 'JE-1',
    status: JournalEntryStatus.POSTED,
    description: 'Transfer A to B',
  };
  const journals = {
    create: jest.fn().mockResolvedValue(journalEntry),
    auditCreatedEntry: jest.fn(async () => {
      expect(committed).toBe(true);
    }),
  };
  const periods = { assertDateInOpenPeriod: jest.fn().mockResolvedValue(undefined) };
  const audit = {};
  const service = new FinanceService(
    prisma as unknown as PrismaService,
    journals as unknown as JournalEntriesService,
    periods as unknown as FinancialPeriodsService,
    audit as AuditLogService,
  );
  return { service, prisma, tx, journals, committed: () => committed };
}

function fingerprint() {
  return bankTransferRequestFingerprint({
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    userId: 'user-a',
    ...request,
  });
}

describe('FinanceService.transferBetweenAccounts', () => {
  it('updates both balances, transfer legs, and the GL journal in one transaction', async () => {
    const state = setup();
    const result = await state.service.transferBetweenAccounts(
      'tenant-a',
      'user-a',
      'branch-a',
      request,
    );

    expect(state.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(state.tx.bankAccount.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'bank-a',
        tenantId: 'tenant-a',
        isActive: true,
        currentBalance: { gte: 125 },
      },
      data: { currentBalance: { decrement: 125 } },
    });
    expect(state.tx.bankAccount.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'bank-b', tenantId: 'tenant-a', isActive: true },
      data: { currentBalance: { increment: 125 } },
    });
    expect(state.tx.bankTransaction.create).toHaveBeenCalledTimes(2);
    expect(state.tx.bankTransaction.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          type: BankTxnType.TRANSFER_OUT,
          clientRequestId: request.clientRequestId,
          requestFingerprint: fingerprint(),
        }),
      }),
    );
    expect(state.journals.create).toHaveBeenCalledWith(
      'tenant-a',
      'branch-a',
      'user-a',
      ['TENANT_ADMIN'],
      expect.objectContaining({ referenceType: 'BANK_TRANSFER', referenceId: request.clientRequestId }),
      state.tx,
    );
    expect(result).toMatchObject({ transferKey: request.clientRequestId, journalEntryId: 'journal-1' });
    expect(state.committed()).toBe(true);
  });

  it('returns the original transfer on an identical retry without writing again', async () => {
    const fp = fingerprint();
    const state = setup({
      existingRows: [
        { id: 'out', type: BankTxnType.TRANSFER_OUT, requestFingerprint: fp },
        { id: 'in', type: BankTxnType.TRANSFER_IN, requestFingerprint: fp },
      ],
    });
    (state.prisma.journalEntry.findFirst as jest.Mock).mockResolvedValue({ id: 'journal-replay' });

    const result = await state.service.transferBetweenAccounts(
      'tenant-a',
      'user-a',
      'branch-a',
      request,
    );

    expect(result).toMatchObject({
      outTxn: { id: 'out' },
      inTxn: { id: 'in' },
      transferKey: request.clientRequestId,
      journalEntryId: 'journal-replay',
    });
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
    expect(state.journals.create).not.toHaveBeenCalled();
  });

  it('rechecks the idempotency key after locking accounts before rejecting an exhausted source', async () => {
    const fp = fingerprint();
    const state = setup({
      sourceBalance: 0,
      lockedRows: [
        { id: 'out', type: BankTxnType.TRANSFER_OUT, requestFingerprint: fp },
        { id: 'in', type: BankTxnType.TRANSFER_IN, requestFingerprint: fp },
      ],
    });

    const result = await state.service.transferBetweenAccounts(
      'tenant-a',
      'user-a',
      'branch-a',
      request,
    );

    expect(result).toMatchObject({
      outTxn: { id: 'out' },
      inTxn: { id: 'in' },
      journalEntryId: 'journal-locked-replay',
    });
    expect(state.tx.bankAccount.updateMany).not.toHaveBeenCalled();
    expect(state.tx.bankTransaction.create).not.toHaveBeenCalled();
    expect(state.journals.create).not.toHaveBeenCalled();
  });

  it('rejects reusing a request key for a different payload', async () => {
    const state = setup({
      existingRows: [
        { id: 'out', type: BankTxnType.TRANSFER_OUT, requestFingerprint: 'different' },
        { id: 'in', type: BankTxnType.TRANSFER_IN, requestFingerprint: 'different' },
      ],
    });

    await expect(
      state.service.transferBetweenAccounts('tenant-a', 'user-a', 'branch-a', request),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails a conditional source debit without creating transfer rows or a journal', async () => {
    const state = setup({ debitCount: 0 });

    await expect(
      state.service.transferBetweenAccounts('tenant-a', 'user-a', 'branch-a', request),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.tx.bankTransaction.create).not.toHaveBeenCalled();
    expect(state.journals.create).not.toHaveBeenCalled();
    expect(state.committed()).toBe(false);
  });
});
