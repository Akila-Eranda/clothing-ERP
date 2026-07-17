import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BankAccountType,
  ExpenseClaimStatus,
  PettyCashTxnType,
  ReimbursementStatus,
  RoleType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { JournalEntriesService } from './journal-entries.service';
import {
  applyPettyCashBalance,
  pettyCashDelta,
  replenishAmount,
  roundMoney,
  summarizePettyCashBook,
} from './petty-cash.helper';
import * as dayjs from 'dayjs';

const SYSTEM_ROLES = [RoleType.TENANT_ADMIN];

@Injectable()
export class PettyCashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalEntriesService,
  ) {}

  // ── Funds ──────────────────────────────────────────────────────────

  async listFunds(tenantId: string, includeInactive = false) {
    return this.prisma.pettyCashFund.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { code: 'asc' },
    });
  }

  async getFund(id: string, tenantId: string) {
    const fund = await this.prisma.pettyCashFund.findFirst({ where: { id, tenantId } });
    if (!fund) throw new NotFoundException('Petty cash fund not found');
    return fund;
  }

  async createFund(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    dto: {
      code: string;
      name: string;
      floatAmount?: number;
      openingBalance?: number;
      glAccountId?: string;
      notes?: string;
      linkBankAccount?: boolean;
      postToGl?: boolean;
    },
  ) {
    const code = dto.code.trim().toUpperCase();
    if (!code || !dto.name?.trim()) throw new BadRequestException('Code and name required');

    const floatAmount = roundMoney(Math.max(0, dto.floatAmount ?? dto.openingBalance ?? 0));
    const opening = roundMoney(Math.max(0, dto.openingBalance ?? floatAmount));

    const glAccountId = dto.glAccountId ?? (await this.resolvePettyGlAccountId(tenantId));

    let bankAccountId: string | undefined;
    if (dto.linkBankAccount !== false) {
      const bank = await this.prisma.bankAccount.create({
        data: {
          tenantId,
          branchId: branchId || undefined,
          code: `PC-${code}`.slice(0, 32),
          name: dto.name.trim(),
          type: BankAccountType.PETTY_CASH,
          openingBalance: opening,
          // Balance is applied by the OPENING txn sync below (avoid double-count)
          currentBalance: 0,
          glAccountId: glAccountId ?? undefined,
          notes: 'Linked petty cash fund',
        },
      });
      bankAccountId = bank.id;
    }

    const fund = await this.prisma.pettyCashFund.create({
      data: {
        tenantId,
        branchId: branchId || undefined,
        code,
        name: dto.name.trim(),
        floatAmount,
        currentBalance: 0,
        glAccountId: glAccountId ?? undefined,
        bankAccountId,
        notes: dto.notes,
      },
    });

    if (opening > 0) {
      await this.recordTransaction(tenantId, branchId, userId, {
        fundId: fund.id,
        type: PettyCashTxnType.OPENING,
        amount: opening,
        description: 'Opening float',
        txnDate: dayjs().format('YYYY-MM-DD'),
        postToGl: dto.postToGl === true,
        expenseGlAccountId: undefined,
        skipBalanceSync: false,
      });
    }

    return this.getFund(fund.id, tenantId);
  }

  async updateFund(
    id: string,
    tenantId: string,
    dto: {
      name?: string;
      floatAmount?: number;
      glAccountId?: string | null;
      notes?: string | null;
      isActive?: boolean;
    },
  ) {
    await this.getFund(id, tenantId);
    return this.prisma.pettyCashFund.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.floatAmount != null ? { floatAmount: roundMoney(dto.floatAmount) } : {}),
        ...(dto.glAccountId !== undefined ? { glAccountId: dto.glAccountId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
      },
    });
  }

  // ── Transactions / Book ────────────────────────────────────────────

  async listTransactions(
    tenantId: string,
    opts: { fundId?: string; startDate?: string; endDate?: string },
  ) {
    const start = opts.startDate
      ? dayjs(opts.startDate).startOf('day').toDate()
      : dayjs().startOf('month').toDate();
    const end = opts.endDate
      ? dayjs(opts.endDate).endOf('day').toDate()
      : dayjs().endOf('day').toDate();

    return this.prisma.pettyCashTransaction.findMany({
      where: {
        tenantId,
        ...(opts.fundId ? { fundId: opts.fundId } : {}),
        txnDate: { gte: start, lte: end },
      },
      orderBy: [{ txnDate: 'asc' }, { createdAt: 'asc' }],
      include: { fund: { select: { id: true, code: true, name: true } } },
    });
  }

  async getBook(
    tenantId: string,
    fundId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const fund = await this.getFund(fundId, tenantId);
    const txns = await this.listTransactions(tenantId, { fundId, startDate, endDate });
    const lines = txns.map((t) => ({
      id: t.id,
      type: t.type,
      txnDate: t.txnDate,
      description: t.description,
      category: t.category,
      amount: t.amount,
      signedAmount: pettyCashDelta(t.type, t.type === PettyCashTxnType.ADJUSTMENT ? t.amount : Math.abs(t.amount)),
      balanceAfter: t.balanceAfter,
      receiptRef: t.receiptRef,
      journalEntryId: t.journalEntryId,
      claimId: t.claimId,
    }));
    const summary = summarizePettyCashBook(txns);
    return { fund, lines, summary };
  }

  async recordDisbursement(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    dto: {
      fundId: string;
      amount: number;
      description: string;
      txnDate?: string;
      category?: string;
      expenseGlAccountId?: string;
      receiptRef?: string;
      postToGl?: boolean;
    },
  ) {
    return this.recordTransaction(tenantId, branchId, userId, {
      fundId: dto.fundId,
      type: PettyCashTxnType.DISBURSEMENT,
      amount: dto.amount,
      description: dto.description,
      txnDate: dto.txnDate,
      category: dto.category,
      expenseGlAccountId: dto.expenseGlAccountId,
      receiptRef: dto.receiptRef,
      postToGl: dto.postToGl !== false,
    });
  }

  async replenish(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    dto: {
      fundId: string;
      amount?: number;
      description?: string;
      txnDate?: string;
      fromBankAccountId?: string;
      postToGl?: boolean;
    },
  ) {
    const fund = await this.getFund(dto.fundId, tenantId);
    const amount = replenishAmount(fund.floatAmount, fund.currentBalance, dto.amount);
    if (amount <= 0) throw new BadRequestException('Fund is already at float — nothing to replenish');

    return this.recordTransaction(tenantId, branchId, userId, {
      fundId: dto.fundId,
      type: PettyCashTxnType.REPLENISHMENT,
      amount,
      description: dto.description ?? 'Petty cash replenishment',
      txnDate: dto.txnDate,
      fromBankAccountId: dto.fromBankAccountId,
      postToGl: dto.postToGl !== false,
    });
  }

  private async recordTransaction(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    dto: {
      fundId: string;
      type: PettyCashTxnType;
      amount: number;
      description: string;
      txnDate?: string;
      category?: string;
      expenseGlAccountId?: string;
      receiptRef?: string;
      claimId?: string;
      reimbursementId?: string;
      fromBankAccountId?: string;
      postToGl?: boolean;
      skipBalanceSync?: boolean;
    },
  ) {
    const fund = await this.getFund(dto.fundId, tenantId);
    if (!fund.isActive) throw new BadRequestException('Fund is inactive');

    const amount = roundMoney(Math.abs(dto.amount));
    if (amount <= 0 && dto.type !== PettyCashTxnType.ADJUSTMENT) {
      throw new BadRequestException('Amount must be positive');
    }
    if (!dto.description?.trim()) throw new BadRequestException('Description required');

    const signedForAdj =
      dto.type === PettyCashTxnType.ADJUSTMENT ? roundMoney(dto.amount) : amount;

    if (dto.type === PettyCashTxnType.DISBURSEMENT) {
      if (roundMoney(fund.currentBalance - amount) < -0.001) {
        throw new BadRequestException(
          `Insufficient petty cash (balance ${fund.currentBalance}, need ${amount})`,
        );
      }
    }

    const balanceAfter = applyPettyCashBalance(
      fund.currentBalance,
      dto.type,
      dto.type === PettyCashTxnType.ADJUSTMENT ? signedForAdj : amount,
    );

    const txnDate = dto.txnDate ? dayjs(dto.txnDate).toDate() : new Date();

    const txn = await this.prisma.pettyCashTransaction.create({
      data: {
        tenantId,
        fundId: fund.id,
        type: dto.type,
        txnDate,
        amount: dto.type === PettyCashTxnType.ADJUSTMENT ? signedForAdj : amount,
        description: dto.description.trim(),
        category: dto.category,
        expenseGlAccountId: dto.expenseGlAccountId,
        receiptRef: dto.receiptRef,
        claimId: dto.claimId,
        reimbursementId: dto.reimbursementId,
        balanceAfter,
        createdBy: userId,
      },
    });

    await this.prisma.pettyCashFund.update({
      where: { id: fund.id },
      data: { currentBalance: balanceAfter },
    });

    if (fund.bankAccountId && !dto.skipBalanceSync) {
      const delta = pettyCashDelta(
        dto.type,
        dto.type === PettyCashTxnType.ADJUSTMENT ? signedForAdj : amount,
      );
      await this.prisma.bankAccount.update({
        where: { id: fund.bankAccountId },
        data: { currentBalance: { increment: delta } },
      });
    }

    let journalEntryId: string | undefined;
    if (dto.postToGl) {
      journalEntryId = await this.postTxnJournal(
        tenantId,
        branchId,
        userId,
        fund,
        txn.id,
        dto.type,
        dto.type === PettyCashTxnType.ADJUSTMENT ? Math.abs(signedForAdj) : amount,
        dto.description,
        dayjs(txnDate).format('YYYY-MM-DD'),
        dto.expenseGlAccountId,
        dto.fromBankAccountId,
        signedForAdj,
      );
      if (journalEntryId) {
        await this.prisma.pettyCashTransaction.update({
          where: { id: txn.id },
          data: { journalEntryId },
        });
      }
    }

    return { ...txn, journalEntryId, balanceAfter };
  }

  private async postTxnJournal(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    fund: { id: string; name: string; glAccountId: string | null },
    txnId: string,
    type: PettyCashTxnType,
    amount: number,
    description: string,
    date: string,
    expenseGlAccountId?: string,
    fromBankAccountId?: string,
    signedAdjustment?: number,
  ): Promise<string | undefined> {
    const pettyGl =
      fund.glAccountId ?? (await this.resolvePettyGlAccountId(tenantId));
    if (!pettyGl) return undefined;

    let glLines: Array<{ accountId: string; side: 'DEBIT' | 'CREDIT'; amount: number; description?: string }> | null = null;
    let refType = 'PETTY_CASH';

    if (type === PettyCashTxnType.DISBURSEMENT) {
      const expenseGl =
        expenseGlAccountId ?? (await this.resolveExpenseGlAccountId(tenantId));
      if (!expenseGl) {
        throw new BadRequestException('Expense GL account required for disbursement posting');
      }
      glLines = [
        { accountId: expenseGl, side: 'DEBIT', amount, description },
        { accountId: pettyGl, side: 'CREDIT', amount, description },
      ];
    } else if (type === PettyCashTxnType.REPLENISHMENT || type === PettyCashTxnType.OPENING) {
      let creditGl: string | null = null;
      if (fromBankAccountId) {
        const bank = await this.prisma.bankAccount.findFirst({
          where: { id: fromBankAccountId, tenantId },
        });
        creditGl = bank?.glAccountId ?? null;
        if (bank && type === PettyCashTxnType.REPLENISHMENT) {
          await this.prisma.bankAccount.update({
            where: { id: bank.id },
            data: { currentBalance: { decrement: amount } },
          });
        }
      }
      if (!creditGl) {
        creditGl = await this.resolveBankOrCashGl(tenantId);
      }
      if (!creditGl) return undefined;
      glLines = [
        { accountId: pettyGl, side: 'DEBIT', amount, description },
        { accountId: creditGl, side: 'CREDIT', amount, description },
      ];
      refType = type === PettyCashTxnType.OPENING ? 'PETTY_OPENING' : 'PETTY_REPLENISH';
    } else if (type === PettyCashTxnType.ADJUSTMENT && signedAdjustment != null && signedAdjustment !== 0) {
      const contra = await this.resolveExpenseGlAccountId(tenantId);
      if (!contra) return undefined;
      const abs = Math.abs(signedAdjustment);
      if (signedAdjustment > 0) {
        glLines = [
          { accountId: pettyGl, side: 'DEBIT', amount: abs, description },
          { accountId: contra, side: 'CREDIT', amount: abs, description },
        ];
      } else {
        glLines = [
          { accountId: contra, side: 'DEBIT', amount: abs, description },
          { accountId: pettyGl, side: 'CREDIT', amount: abs, description },
        ];
      }
      refType = 'PETTY_ADJUST';
    }

    if (!glLines) return undefined;

    const je = await this.journals.create(tenantId, branchId ?? '', userId, SYSTEM_ROLES, {
      description: `${fund.name}: ${description}`,
      date,
      referenceType: refType,
      referenceId: txnId,
      action: 'POST',
      glLines,
    });
    return je.id;
  }

  // ── Expense Claims ─────────────────────────────────────────────────

  async listClaims(tenantId: string, status?: ExpenseClaimStatus) {
    return this.prisma.expenseClaim.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      orderBy: [{ claimDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        fund: { select: { id: true, code: true, name: true } },
        reimbursement: true,
      },
    });
  }

  async getClaim(id: string, tenantId: string) {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: { id, tenantId },
      include: { fund: true, reimbursement: true },
    });
    if (!claim) throw new NotFoundException('Expense claim not found');
    return claim;
  }

  async createClaim(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    dto: {
      claimantName: string;
      amount: number;
      description: string;
      claimDate?: string;
      fundId?: string;
      employeeId?: string;
      category?: string;
      expenseGlAccountId?: string;
      receiptRef?: string;
      notes?: string;
      submit?: boolean;
    },
  ) {
    const amount = roundMoney(dto.amount);
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    if (!dto.claimantName?.trim() || !dto.description?.trim()) {
      throw new BadRequestException('Claimant and description required');
    }
    if (dto.fundId) await this.getFund(dto.fundId, tenantId);

    const claim = await this.prisma.expenseClaim.create({
      data: {
        tenantId,
        branchId: branchId || undefined,
        fundId: dto.fundId,
        claimantName: dto.claimantName.trim(),
        employeeId: dto.employeeId,
        claimDate: dto.claimDate ? dayjs(dto.claimDate).toDate() : new Date(),
        description: dto.description.trim(),
        amount,
        category: dto.category,
        expenseGlAccountId: dto.expenseGlAccountId,
        receiptRef: dto.receiptRef,
        notes: dto.notes,
        status: dto.submit ? ExpenseClaimStatus.SUBMITTED : ExpenseClaimStatus.DRAFT,
        createdBy: userId,
      },
    });
    return claim;
  }

  async submitClaim(id: string, tenantId: string) {
    const claim = await this.getClaim(id, tenantId);
    if (claim.status !== ExpenseClaimStatus.DRAFT) {
      throw new BadRequestException('Only draft claims can be submitted');
    }
    return this.prisma.expenseClaim.update({
      where: { id },
      data: { status: ExpenseClaimStatus.SUBMITTED },
    });
  }

  async approveClaim(id: string, tenantId: string, userId: string) {
    const claim = await this.getClaim(id, tenantId);
    if (claim.status !== ExpenseClaimStatus.SUBMITTED && claim.status !== ExpenseClaimStatus.DRAFT) {
      throw new BadRequestException('Only submitted/draft claims can be approved');
    }
    return this.prisma.expenseClaim.update({
      where: { id },
      data: {
        status: ExpenseClaimStatus.APPROVED,
        approvedBy: userId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });
  }

  async rejectClaim(id: string, tenantId: string, reason?: string) {
    const claim = await this.getClaim(id, tenantId);
    if (
      claim.status !== ExpenseClaimStatus.SUBMITTED &&
      claim.status !== ExpenseClaimStatus.DRAFT
    ) {
      throw new BadRequestException('Claim cannot be rejected in current status');
    }
    return this.prisma.expenseClaim.update({
      where: { id },
      data: {
        status: ExpenseClaimStatus.REJECTED,
        rejectionReason: reason?.trim() || 'Rejected',
      },
    });
  }

  async cancelClaim(id: string, tenantId: string) {
    const claim = await this.getClaim(id, tenantId);
    if (
      claim.status === ExpenseClaimStatus.REIMBURSED ||
      claim.status === ExpenseClaimStatus.CANCELLED
    ) {
      throw new BadRequestException('Claim cannot be cancelled');
    }
    return this.prisma.expenseClaim.update({
      where: { id },
      data: { status: ExpenseClaimStatus.CANCELLED },
    });
  }

  // ── Reimbursements ─────────────────────────────────────────────────

  async listReimbursements(tenantId: string) {
    return this.prisma.reimbursement.findMany({
      where: { tenantId },
      orderBy: { payDate: 'desc' },
      include: {
        claim: true,
        fund: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async reimburseClaim(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    dto: {
      claimId: string;
      fundId?: string;
      payFromBankAccountId?: string;
      payDate?: string;
      reference?: string;
      notes?: string;
      postToGl?: boolean;
      payFromPettyCash?: boolean;
    },
  ) {
    const claim = await this.getClaim(dto.claimId, tenantId);
    if (claim.status !== ExpenseClaimStatus.APPROVED) {
      throw new BadRequestException('Only approved claims can be reimbursed');
    }
    if (claim.reimbursement) {
      throw new BadRequestException('Claim already reimbursed');
    }

    const fundId = dto.fundId ?? claim.fundId ?? undefined;
    const payFromPetty = dto.payFromPettyCash !== false && !!fundId;
    const payDate = dto.payDate ? dayjs(dto.payDate).toDate() : new Date();
    const amount = claim.amount;

    const reimbursement = await this.prisma.reimbursement.create({
      data: {
        tenantId,
        claimId: claim.id,
        fundId,
        amount,
        payDate,
        payFromBankAccountId: dto.payFromBankAccountId,
        reference: dto.reference,
        notes: dto.notes,
        status: ReimbursementStatus.PAID,
        createdBy: userId,
      },
    });

    await this.prisma.expenseClaim.update({
      where: { id: claim.id },
      data: { status: ExpenseClaimStatus.REIMBURSED },
    });

    let journalEntryId: string | undefined;
    let pettyTxnId: string | undefined;

    if (payFromPetty && fundId) {
      const txn = await this.recordTransaction(tenantId, branchId, userId, {
        fundId,
        type: PettyCashTxnType.DISBURSEMENT,
        amount,
        description: `Reimburse ${claim.claimantName}: ${claim.description}`,
        txnDate: dayjs(payDate).format('YYYY-MM-DD'),
        category: claim.category ?? undefined,
        expenseGlAccountId: claim.expenseGlAccountId ?? undefined,
        receiptRef: claim.receiptRef ?? undefined,
        claimId: claim.id,
        reimbursementId: reimbursement.id,
        postToGl: dto.postToGl !== false,
      });
      pettyTxnId = txn.id;
      journalEntryId = txn.journalEntryId;
    } else if (dto.postToGl !== false) {
      const expenseGl =
        claim.expenseGlAccountId ?? (await this.resolveExpenseGlAccountId(tenantId));
      let creditGl: string | null = null;
      if (dto.payFromBankAccountId) {
        const bank = await this.prisma.bankAccount.findFirst({
          where: { id: dto.payFromBankAccountId, tenantId },
        });
        creditGl = bank?.glAccountId ?? null;
        if (bank) {
          await this.prisma.bankAccount.update({
            where: { id: bank.id },
            data: { currentBalance: { decrement: amount } },
          });
        }
      }
      if (!creditGl) creditGl = await this.resolveBankOrCashGl(tenantId);
      if (expenseGl && creditGl) {
        const je = await this.journals.create(tenantId, branchId ?? '', userId, SYSTEM_ROLES, {
          description: `Expense reimbursement: ${claim.claimantName}`,
          date: dayjs(payDate).format('YYYY-MM-DD'),
          referenceType: 'REIMBURSEMENT',
          referenceId: reimbursement.id,
          action: 'POST',
          glLines: [
            { accountId: expenseGl, side: 'DEBIT', amount, description: claim.description },
            { accountId: creditGl, side: 'CREDIT', amount, description: claim.description },
          ],
        });
        journalEntryId = je.id;
      }
    }

    if (journalEntryId) {
      await this.prisma.reimbursement.update({
        where: { id: reimbursement.id },
        data: { journalEntryId },
      });
    }

    return {
      ...reimbursement,
      journalEntryId,
      pettyTxnId,
      claim: await this.getClaim(claim.id, tenantId),
    };
  }

  // ── Reports ────────────────────────────────────────────────────────

  async getReport(
    tenantId: string,
    startDate?: string,
    endDate?: string,
    fundId?: string,
  ) {
    const start = startDate ?? dayjs().startOf('month').format('YYYY-MM-DD');
    const end = endDate ?? dayjs().format('YYYY-MM-DD');
    const txns = await this.listTransactions(tenantId, { fundId, startDate: start, endDate: end });
    const bookSummary = summarizePettyCashBook(txns);

    const claims = await this.prisma.expenseClaim.findMany({
      where: {
        tenantId,
        ...(fundId ? { fundId } : {}),
        claimDate: {
          gte: dayjs(start).startOf('day').toDate(),
          lte: dayjs(end).endOf('day').toDate(),
        },
      },
    });

    const claimsByStatus: Record<string, { count: number; amount: number }> = {};
    for (const c of claims) {
      const cur = claimsByStatus[c.status] ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount = roundMoney(cur.amount + c.amount);
      claimsByStatus[c.status] = cur;
    }

    const reimbursements = await this.prisma.reimbursement.findMany({
      where: {
        tenantId,
        ...(fundId ? { fundId } : {}),
        status: ReimbursementStatus.PAID,
        payDate: {
          gte: dayjs(start).startOf('day').toDate(),
          lte: dayjs(end).endOf('day').toDate(),
        },
      },
    });
    const reimbursedTotal = roundMoney(reimbursements.reduce((s, r) => s + r.amount, 0));

    const funds = await this.listFunds(tenantId, true);

    return {
      period: { startDate: start, endDate: end },
      funds: funds.map((f) => ({
        id: f.id,
        code: f.code,
        name: f.name,
        floatAmount: f.floatAmount,
        currentBalance: f.currentBalance,
        shortfall: roundMoney(Math.max(0, f.floatAmount - f.currentBalance)),
        isActive: f.isActive,
      })),
      transactions: bookSummary,
      claims: {
        total: claims.length,
        totalAmount: roundMoney(claims.reduce((s, c) => s + c.amount, 0)),
        byStatus: claimsByStatus,
      },
      reimbursements: {
        count: reimbursements.length,
        total: reimbursedTotal,
      },
    };
  }

  // ── GL helpers ─────────────────────────────────────────────────────

  private async resolvePettyGlAccountId(tenantId: string): Promise<string | null> {
    const byCode = await this.prisma.account.findFirst({
      where: { tenantId, isActive: true, code: { in: ['1110', '1100', '1001'] } },
      orderBy: { code: 'asc' },
    });
    return byCode?.id ?? null;
  }

  private async resolveExpenseGlAccountId(tenantId: string): Promise<string | null> {
    const byCode = await this.prisma.account.findFirst({
      where: { tenantId, isActive: true, code: { in: ['5200', '5000', '5400'] } },
      orderBy: { code: 'asc' },
    });
    return byCode?.id ?? null;
  }

  private async resolveBankOrCashGl(tenantId: string): Promise<string | null> {
    const bank = await this.prisma.bankAccount.findFirst({
      where: {
        tenantId,
        isActive: true,
        type: { in: [BankAccountType.CURRENT, BankAccountType.SAVINGS, BankAccountType.CASH_IN_HAND] },
        glAccountId: { not: null },
      },
      orderBy: { code: 'asc' },
    });
    if (bank?.glAccountId) return bank.glAccountId;

    const byCode = await this.prisma.account.findFirst({
      where: { tenantId, isActive: true, code: { in: ['1200', '1100'] } },
      orderBy: { code: 'asc' },
    });
    return byCode?.id ?? null;
  }
}
