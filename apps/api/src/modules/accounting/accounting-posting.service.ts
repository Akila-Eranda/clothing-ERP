/** Idempotent GL posting for commerce events (sales, GRN, AR/AP, expenses, returns). */

import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod, RoleType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { JournalEntriesService } from './journal-entries.service';
import { AccountingBootstrapService } from './accounting-bootstrap.service';
import { normalizeAccountCode } from './coa.helper';

const SYSTEM_ROLES = [RoleType.TENANT_ADMIN];

type GlSide = 'DEBIT' | 'CREDIT';
type GlLine = { accountId: string; side: GlSide; amount: number; description?: string };

export type ResolvedAccounts = {
  cash: string;
  bank: string;
  card: string;
  chequeRecv: string;
  chequePay: string;
  ar: string;
  ap: string;
  inventory: string;
  sales: string;
  salesReturns: string;
  vatPayable: string;
  vatInput: string;
  wallet: string;
  gift: string;
  cogs: string;
  expense: string;
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class AccountingPostingService {
  private readonly logger = new Logger(AccountingPostingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalEntriesService,
    private readonly bootstrap: AccountingBootstrapService,
  ) {}

  // ── Account resolution ───────────────────────────────────────────────

  async resolveAccounts(tenantId: string): Promise<ResolvedAccounts | null> {
    let accounts = await this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true },
    });
    if (accounts.length < 5) {
      await this.bootstrap.bootstrapTenant(tenantId);
      accounts = await this.prisma.account.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, code: true },
      });
    }

    const byCode = new Map(accounts.map((a) => [normalizeAccountCode(a.code), a.id]));
    const prefs = await this.prisma.accountingPreference.findUnique({ where: { tenantId } });

    const pick = (...codes: string[]) => {
      for (const c of codes) {
        const id = byCode.get(c);
        if (id) return id;
      }
      return null;
    };

    const cash = prefs?.defaultCashAccountId ?? pick('1100', '1110');
    const bank = pick('1200', '1100');
    const card = pick('1210', '1200', '1100');
    const chequeRecv = pick('1220', '1300');
    const chequePay = pick('2420', '2100');
    const ar = prefs?.defaultArAccountId ?? pick('1300');
    const ap = prefs?.defaultApAccountId ?? pick('2100');
    const inventory = prefs?.defaultPurchaseAccountId ?? pick('1400');
    const sales = prefs?.defaultSalesAccountId ?? pick('4100', '4000');
    const salesReturns = pick('4200', '4100');
    const vatPayable = pick('2200');
    const vatInput = pick('2210');
    const wallet = pick('2400');
    const gift = pick('2410', '2400');
    const cogs = pick('5100');
    const expense = pick('5600', '5200', '5000');

    if (!cash || !ar || !ap || !inventory || !sales || !cogs || !expense) {
      this.logger.warn(`Incomplete COA for tenant ${tenantId} — skipping auto-post`);
      return null;
    }

    return {
      cash,
      bank: bank ?? cash,
      card: card ?? cash,
      chequeRecv: chequeRecv ?? ar,
      chequePay: chequePay ?? ap,
      ar,
      ap,
      inventory,
      sales,
      salesReturns: salesReturns ?? sales,
      vatPayable: vatPayable ?? sales,
      vatInput: vatInput ?? inventory,
      wallet: wallet ?? ar,
      gift: gift ?? sales,
      cogs,
      expense,
    };
  }

  private async alreadyPosted(tenantId: string, referenceType: string, referenceId: string) {
    const existing = await this.prisma.journalEntry.findFirst({
      where: {
        tenantId,
        referenceType,
        referenceId,
        status: { not: 'VOID' },
      },
      select: { id: true, entryNumber: true },
    });
    return existing;
  }

  private async post(
    tenantId: string,
    branchId: string | null | undefined,
    userId: string,
    opts: {
      description: string;
      date: Date | string;
      referenceType: string;
      referenceId: string;
      lines: GlLine[];
    },
  ) {
    const existing = await this.alreadyPosted(tenantId, opts.referenceType, opts.referenceId);
    if (existing) return { skipped: true as const, journalId: existing.id, entryNumber: existing.entryNumber };

    const cleaned = opts.lines
      .map((l) => ({ ...l, amount: round2(l.amount) }))
      .filter((l) => l.amount > 0.009 && l.accountId);

    if (cleaned.length < 2) {
      this.logger.warn(`Not enough GL lines for ${opts.referenceType}/${opts.referenceId}`);
      return { skipped: true as const, journalId: null, entryNumber: null };
    }

    const debit = round2(cleaned.filter((l) => l.side === 'DEBIT').reduce((s, l) => s + l.amount, 0));
    const credit = round2(cleaned.filter((l) => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0));
    if (Math.abs(debit - credit) > 0.05) {
      // Absorb tiny imbalance into cash/sales side
      const diff = round2(debit - credit);
      if (Math.abs(diff) <= 1) {
        if (diff > 0) {
          const firstCredit = cleaned.find((l) => l.side === 'CREDIT');
          if (firstCredit) firstCredit.amount = round2(firstCredit.amount + diff);
        } else {
          const firstDebit = cleaned.find((l) => l.side === 'DEBIT');
          if (firstDebit) firstDebit.amount = round2(firstDebit.amount - diff);
        }
      } else {
        this.logger.error(
          `Unbalanced ${opts.referenceType}/${opts.referenceId}: Dr ${debit} Cr ${credit}`,
        );
        return { skipped: true as const, journalId: null, entryNumber: null };
      }
    }

    const dateStr = typeof opts.date === 'string'
      ? opts.date.slice(0, 10)
      : opts.date.toISOString().slice(0, 10);

    try {
      const je = await this.journals.create(tenantId, branchId ?? '', userId || 'system', SYSTEM_ROLES, {
        description: opts.description,
        date: dateStr,
        referenceType: opts.referenceType,
        referenceId: opts.referenceId,
        action: 'POST',
        glLines: cleaned,
      });
      return { skipped: false as const, journalId: je.id, entryNumber: je.entryNumber };
    } catch (err) {
      this.logger.error(
        `Auto-post failed ${opts.referenceType}/${opts.referenceId}: ${(err as Error).message}`,
      );
      return { skipped: true as const, journalId: null, entryNumber: null };
    }
  }

  private tenderAccount(accounts: ResolvedAccounts, method: PaymentMethod | string): string {
    switch (String(method).toUpperCase()) {
      case 'CASH':
        return accounts.cash;
      case 'CARD':
      case 'UPI':
        return accounts.card;
      case 'BANK_TRANSFER':
        return accounts.bank;
      case 'CHEQUE':
        return accounts.chequeRecv;
      case 'WALLET':
        return accounts.wallet;
      case 'GIFT_VOUCHER':
        return accounts.gift;
      case 'CUSTOMER_CREDIT':
      case 'LOYALTY_POINTS':
        return accounts.ar;
      default:
        return accounts.cash;
    }
  }

  // ── Sale ─────────────────────────────────────────────────────────────

  async postSale(saleId: string, tenantId: string, userId = 'system') {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId },
      include: { items: true, payments: true },
    });
    if (!sale) return null;

    const accounts = await this.resolveAccounts(tenantId);
    if (!accounts) return null;

    const lines: GlLine[] = [];
    const tenderTotals = new Map<string, number>();

    for (const p of sale.payments) {
      if (p.amount <= 0.009) continue;
      const key = this.tenderAccount(accounts, p.method);
      tenderTotals.set(key, round2((tenderTotals.get(key) ?? 0) + p.amount));
    }

    // Unpaid balance charged to AR (partial / credit)
    const paid = round2(sale.payments.reduce((s, p) => s + p.amount, 0));
    const arCharge = round2(Math.max(0, sale.total - paid));
    if (arCharge > 0.009) {
      tenderTotals.set(accounts.ar, round2((tenderTotals.get(accounts.ar) ?? 0) + arCharge));
    }

    // Change given in cash reduces cash debit
    if (sale.changeDue > 0.009) {
      const cashAmt = tenderTotals.get(accounts.cash) ?? 0;
      tenderTotals.set(accounts.cash, round2(Math.max(0, cashAmt - sale.changeDue)));
    }

    for (const [accountId, amount] of tenderTotals) {
      if (amount > 0.009) {
        lines.push({ accountId, side: 'DEBIT', amount, description: 'Tender' });
      }
    }

    const tax = round2(sale.taxAmount ?? 0);
    const netSales = round2(Math.max(0, sale.total - tax));
    if (netSales > 0.009) {
      lines.push({ accountId: accounts.sales, side: 'CREDIT', amount: netSales, description: 'Sales' });
    }
    if (tax > 0.009) {
      lines.push({ accountId: accounts.vatPayable, side: 'CREDIT', amount: tax, description: 'Output VAT' });
    }

    // COGS
    const cogsAmt = round2(
      sale.items.reduce((s, i) => s + (i.costPrice ?? 0) * i.quantity, 0),
    );
    if (cogsAmt > 0.009) {
      lines.push({ accountId: accounts.cogs, side: 'DEBIT', amount: cogsAmt, description: 'COGS' });
      lines.push({ accountId: accounts.inventory, side: 'CREDIT', amount: cogsAmt, description: 'Inventory' });
    }

    return this.post(tenantId, sale.branchId, userId, {
      description: `POS sale ${sale.invoiceNumber}`,
      date: sale.createdAt,
      referenceType: 'SALE',
      referenceId: sale.id,
      lines,
    });
  }

  // ── Sale return ──────────────────────────────────────────────────────

  async postReturn(returnId: string, tenantId: string, userId = 'system') {
    const ret = await this.prisma.return.findFirst({
      where: { id: returnId, tenantId },
      include: { items: true },
    });
    if (!ret) return null;

    const accounts = await this.resolveAccounts(tenantId);
    if (!accounts) return null;

    const total = round2(ret.refundAmount > 0 ? ret.refundAmount : ret.totalAmount);
    if (total <= 0.009) return null;

    const lines: GlLine[] = [
      { accountId: accounts.salesReturns, side: 'DEBIT', amount: total, description: 'Sales return' },
      { accountId: accounts.cash, side: 'CREDIT', amount: total, description: 'Refund / credit' },
    ];

    return this.post(tenantId, ret.branchId, userId, {
      description: `Sale return ${ret.returnNumber}`,
      date: ret.createdAt,
      referenceType: 'SALE_RETURN',
      referenceId: ret.id,
      lines,
    });
  }

  // ── GRN / purchase ───────────────────────────────────────────────────

  async postGoodsReceipt(grnId: string, tenantId: string, userId = 'system') {
    const grn = await this.prisma.goodsReceipt.findFirst({
      where: { id: grnId, tenantId },
      include: { items: true },
    });
    if (!grn) return null;

    const accounts = await this.resolveAccounts(tenantId);
    if (!accounts) return null;

    const value = round2(
      grn.items.reduce((s, i) => s + Math.max(0, i.receivedQty) * (i.unitCost ?? 0), 0),
    );
    if (value <= 0.009) return null;

    return this.post(tenantId, grn.branchId, userId, {
      description: `GRN ${grn.grnNumber}`,
      date: grn.createdAt,
      referenceType: 'GRN',
      referenceId: grn.id,
      lines: [
        { accountId: accounts.inventory, side: 'DEBIT', amount: value, description: 'Inventory received' },
        { accountId: accounts.ap, side: 'CREDIT', amount: value, description: 'Accounts payable' },
      ],
    });
  }

  // ── Supplier payment ─────────────────────────────────────────────────

  async postSupplierPayment(paymentId: string, tenantId: string, userId = 'system') {
    const payment = await this.prisma.supplierPayment.findFirst({
      where: { id: paymentId, tenantId },
    });
    if (!payment) return null;

    const accounts = await this.resolveAccounts(tenantId);
    if (!accounts) return null;

    const amount = round2(payment.amount);
    if (amount <= 0.009) return null;

    const creditAcct =
      payment.method === PaymentMethod.CHEQUE
        ? accounts.chequePay
        : payment.method === PaymentMethod.BANK_TRANSFER || payment.method === PaymentMethod.CARD
          ? accounts.bank
          : accounts.cash;

    return this.post(tenantId, null, userId, {
      description: `Supplier payment ${payment.reference ?? payment.id.slice(0, 8)}`,
      date: payment.paidAt ?? payment.createdAt,
      referenceType: 'SUPPLIER_PAYMENT',
      referenceId: payment.id,
      lines: [
        { accountId: accounts.ap, side: 'DEBIT', amount, description: 'Clear AP' },
        { accountId: creditAcct, side: 'CREDIT', amount, description: 'Payment' },
      ],
    });
  }

  // ── Customer credit collection ───────────────────────────────────────

  async postCustomerCreditPayment(opts: {
    tenantId: string;
    branchId?: string;
    userId?: string;
    customerId: string;
    paymentTxnId: string;
    amount: number;
    applied: number;
    advance: number;
    method: PaymentMethod | string;
    applyFromWallet?: boolean;
    description: string;
    date?: Date;
  }) {
    const accounts = await this.resolveAccounts(opts.tenantId);
    if (!accounts) return null;

    const lines: GlLine[] = [];
    const applied = round2(opts.applied);
    const advance = round2(opts.advance);
    const amount = round2(opts.amount);

    if (opts.applyFromWallet) {
      if (applied > 0.009) {
        lines.push({ accountId: accounts.wallet, side: 'DEBIT', amount: applied, description: 'Wallet settle' });
        lines.push({ accountId: accounts.ar, side: 'CREDIT', amount: applied, description: 'Clear AR' });
      }
    } else {
      const debitAcct = this.tenderAccount(accounts, opts.method);
      if (amount > 0.009) {
        lines.push({ accountId: debitAcct, side: 'DEBIT', amount, description: 'Collection' });
      }
      if (applied > 0.009) {
        lines.push({ accountId: accounts.ar, side: 'CREDIT', amount: applied, description: 'Clear AR' });
      }
      if (advance > 0.009) {
        lines.push({ accountId: accounts.wallet, side: 'CREDIT', amount: advance, description: 'Customer advance' });
      }
    }

    if (lines.length < 2) return null;

    return this.post(opts.tenantId, opts.branchId, opts.userId ?? 'system', {
      description: opts.description,
      date: opts.date ?? new Date(),
      referenceType: 'CUSTOMER_CREDIT_PAYMENT',
      referenceId: opts.paymentTxnId,
      lines,
    });
  }

  // ── Expense ──────────────────────────────────────────────────────────

  async postExpense(expenseId: string, tenantId: string, userId = 'system') {
    const expense = await this.prisma.expense.findFirst({ where: { id: expenseId, tenantId } });
    if (!expense) return null;

    const accounts = await this.resolveAccounts(tenantId);
    if (!accounts) return null;

    const amount = round2(expense.amount);
    if (amount <= 0.009) return null;

    // Prefer linked GL category if categoryId is actually an account id
    let expenseAcct = accounts.expense;
    if (expense.categoryId) {
      const linked = await this.prisma.account.findFirst({
        where: { id: expense.categoryId, tenantId, isActive: true },
        select: { id: true },
      });
      if (linked) expenseAcct = linked.id;
    }

    const creditAcct =
      expense.paymentMethod === PaymentMethod.CHEQUE
        ? accounts.chequePay
        : expense.paymentMethod === PaymentMethod.BANK_TRANSFER || expense.paymentMethod === PaymentMethod.CARD
          ? accounts.bank
          : accounts.cash;

    return this.post(tenantId, expense.branchId, userId, {
      description: `Expense: ${expense.description}`,
      date: expense.date,
      referenceType: 'EXPENSE',
      referenceId: expense.id,
      lines: [
        { accountId: expenseAcct, side: 'DEBIT', amount, description: expense.description },
        { accountId: creditAcct, side: 'CREDIT', amount, description: 'Paid' },
      ],
    });
  }

  // ── Backfill helpers ─────────────────────────────────────────────────

  async backfillTenant(tenantId: string, limit = 200) {
    await this.bootstrap.bootstrapTenant(tenantId);

    const sales = await this.prisma.sale.findMany({
      where: { tenantId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true },
    });
    const grns = await this.prisma.goodsReceipt.findMany({
      where: { tenantId, status: 'POSTED' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true },
    });
    const expenses = await this.prisma.expense.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true },
    });
    const apPays = await this.prisma.supplierPayment.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true },
    });

    let posted = 0;
    let skipped = 0;
    for (const s of sales) {
      const r = await this.postSale(s.id, tenantId);
      if (r?.skipped) skipped++;
      else if (r?.journalId) posted++;
    }
    for (const g of grns) {
      const r = await this.postGoodsReceipt(g.id, tenantId);
      if (r?.skipped) skipped++;
      else if (r?.journalId) posted++;
    }
    for (const e of expenses) {
      const r = await this.postExpense(e.id, tenantId);
      if (r?.skipped) skipped++;
      else if (r?.journalId) posted++;
    }
    for (const p of apPays) {
      const r = await this.postSupplierPayment(p.id, tenantId);
      if (r?.skipped) skipped++;
      else if (r?.journalId) posted++;
    }

    return {
      sales: sales.length,
      grns: grns.length,
      expenses: expenses.length,
      supplierPayments: apPays.length,
      journalsPosted: posted,
      alreadyPostedOrSkipped: skipped,
    };
  }
}
