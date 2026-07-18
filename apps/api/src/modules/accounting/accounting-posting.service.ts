/** Idempotent GL posting for commerce events (sales, GRN, AR/AP, expenses, returns, repairs). */

import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod, RoleType, SupplierInvoiceStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { JournalEntriesService } from './journal-entries.service';
import { AccountingBootstrapService } from './accounting-bootstrap.service';
import { normalizeAccountCode } from './coa.helper';
import {
  ACCOUNT_MAPPING_CODE_FALLBACKS,
  AccountMappingKey,
  classifyInventoryKind,
  InventoryKind,
} from './account-mapping.helper';

const SYSTEM_ROLES = [RoleType.TENANT_ADMIN];

type GlSide = 'DEBIT' | 'CREDIT';
type GlLine = { accountId: string; side: GlSide; amount: number; description?: string };

export type ResolvedAccounts = {
  cash: string;
  petty: string;
  bank: string;
  card: string;
  upi: string;
  chequeRecv: string;
  chequePay: string;
  ar: string;
  ap: string;
  inventory: string;
  invAccessory: string;
  invSpare: string;
  sales: string;
  salesAccessory: string;
  serviceIncome: string;
  repairIncome: string;
  reloadCommission: string;
  salesReturns: string;
  vatPayable: string;
  vatInput: string;
  wallet: string;
  gift: string;
  cogs: string;
  cogsAccessory: string;
  cogsRepair: string;
  expense: string;
  cashOverShort: string;
  retained: string;
  repairVatEnabled: boolean;
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

  async resolveAccounts(tenantId: string): Promise<ResolvedAccounts | null> {
    await this.bootstrap.upsertDefaultCoa(tenantId);
    await this.bootstrap.ensureMappings(tenantId);

    const accounts = await this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true },
    });
    if (!accounts.length) {
      this.logger.warn(`No COA for tenant ${tenantId} after bootstrap — skipping auto-post`);
      return null;
    }

    const byCode = new Map(accounts.map((a) => [normalizeAccountCode(a.code), a.id]));
    const byId = new Set(accounts.map((a) => a.id));
    const prefs = await this.prisma.accountingPreference.findUnique({ where: { tenantId } });
    const mappings = await this.prisma.accountMapping.findMany({
      where: { tenantId },
      select: { key: true, accountId: true },
    });
    const byKey = new Map(mappings.map((m) => [m.key, m.accountId]));

    const pickCodes = (...codes: string[]) => {
      for (const c of codes) {
        const id = byCode.get(normalizeAccountCode(c));
        if (id) return id;
      }
      return null;
    };
    const mapOr = (key: AccountMappingKey, prefId?: string | null) => {
      const mapped = byKey.get(key);
      if (mapped && byId.has(mapped)) return mapped;
      if (prefId && byId.has(prefId)) return prefId;
      return pickCodes(...ACCOUNT_MAPPING_CODE_FALLBACKS[key]);
    };

    const cash = mapOr('CASH', prefs?.defaultCashAccountId);
    const bank = mapOr('BANK') ?? cash;
    const card = mapOr('CARD_CLEARING') ?? bank;
    const upi = mapOr('UPI_CLEARING') ?? card;
    const ar = mapOr('AR', prefs?.defaultArAccountId);
    const ap = mapOr('AP', prefs?.defaultApAccountId);
    const inventory = mapOr('INV_MOBILE', prefs?.defaultPurchaseAccountId);
    const sales = mapOr('SALES_MOBILE', prefs?.defaultSalesAccountId);
    const cogs = mapOr('COGS_MOBILE');
    const expense = mapOr('OPERATING_EXPENSE');

    if (!cash || !ar || !ap || !inventory || !sales || !cogs || !expense) {
      this.logger.warn(
        `Incomplete COA for tenant ${tenantId} (cash=${!!cash} ar=${!!ar} ap=${!!ap} inv=${!!inventory} sales=${!!sales} cogs=${!!cogs} exp=${!!expense})`,
      );
      return null;
    }

    return {
      cash,
      petty: mapOr('PETTY_CASH') ?? cash,
      bank: bank!,
      card: card!,
      upi: upi!,
      chequeRecv: pickCodes('1220', '1300') ?? ar,
      chequePay: pickCodes('2420', '2100') ?? ap,
      ar,
      ap,
      inventory,
      invAccessory: mapOr('INV_ACCESSORY') ?? inventory,
      invSpare: mapOr('INV_SPARE') ?? inventory,
      sales,
      salesAccessory: mapOr('SALES_ACCESSORY') ?? sales,
      serviceIncome: mapOr('SERVICE_INCOME') ?? sales,
      repairIncome: mapOr('REPAIR_INCOME') ?? sales,
      reloadCommission: mapOr('RELOAD_COMMISSION') ?? sales,
      salesReturns: mapOr('SALES_RETURNS') ?? sales,
      vatPayable: mapOr('VAT_OUTPUT') ?? sales,
      vatInput: mapOr('VAT_INPUT') ?? inventory,
      wallet: pickCodes('2400') ?? ar,
      gift: pickCodes('2410', '2400') ?? sales,
      cogs,
      cogsAccessory: mapOr('COGS_ACCESSORY') ?? cogs,
      cogsRepair: mapOr('COGS_REPAIR') ?? cogs,
      expense,
      cashOverShort: mapOr('CASH_OVER_SHORT') ?? expense,
      retained: mapOr('RETAINED_EARNINGS', prefs?.defaultRetainedEarningsId) ?? sales,
      repairVatEnabled: prefs?.repairVatEnabled === true,
    };
  }

  private inventoryAccount(accounts: ResolvedAccounts, kind: InventoryKind): string {
    if (kind === 'accessory') return accounts.invAccessory;
    if (kind === 'spare') return accounts.invSpare;
    return accounts.inventory;
  }

  private salesAccount(accounts: ResolvedAccounts, kind: InventoryKind): string {
    if (kind === 'accessory') return accounts.salesAccessory;
    if (kind === 'service') return accounts.serviceIncome;
    if (kind === 'reload') return accounts.reloadCommission;
    if (kind === 'spare') return accounts.repairIncome;
    return accounts.sales;
  }

  private cogsAccount(accounts: ResolvedAccounts, kind: InventoryKind): string {
    if (kind === 'accessory') return accounts.cogsAccessory;
    if (kind === 'spare') return accounts.cogsRepair;
    return accounts.cogs;
  }

  private async alreadyPosted(tenantId: string, referenceType: string, referenceId: string) {
    return this.prisma.journalEntry.findFirst({
      where: {
        tenantId,
        referenceType,
        referenceId,
        status: { not: 'VOID' },
      },
      select: { id: true, entryNumber: true },
    });
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

    let debit = round2(cleaned.filter((l) => l.side === 'DEBIT').reduce((s, l) => s + l.amount, 0));
    let credit = round2(cleaned.filter((l) => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0));
    if (Math.abs(debit - credit) > 0.05) {
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

    const dateStr =
      typeof opts.date === 'string' ? opts.date.slice(0, 10) : opts.date.toISOString().slice(0, 10);

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
      throw err;
    }
  }

  private tenderAccount(accounts: ResolvedAccounts, method: PaymentMethod | string): string {
    switch (String(method).toUpperCase()) {
      case 'CASH':
        return accounts.cash;
      case 'CARD':
        return accounts.card;
      case 'UPI':
      case 'WALLET':
        return accounts.upi;
      case 'BANK_TRANSFER':
        return accounts.bank;
      case 'CHEQUE':
        return accounts.chequeRecv;
      case 'GIFT_VOUCHER':
        return accounts.gift;
      case 'CUSTOMER_CREDIT':
      case 'LOYALTY_POINTS':
        return accounts.ar;
      default:
        return accounts.cash;
    }
  }

  private paymentCreditAccount(accounts: ResolvedAccounts, method: PaymentMethod | string): string {
    switch (String(method).toUpperCase()) {
      case 'CASH':
        return accounts.cash;
      case 'CARD':
        return accounts.card;
      case 'UPI':
      case 'WALLET':
        return accounts.upi;
      case 'BANK_TRANSFER':
        return accounts.bank;
      case 'CHEQUE':
        return accounts.chequePay;
      default:
        return accounts.cash;
    }
  }

  // ── Sale ─────────────────────────────────────────────────────────────

  async postSale(saleId: string, tenantId: string, userId = 'system') {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: { include: { category: { select: { name: true } } } },
              },
            },
          },
        },
        payments: true,
      },
    });
    if (!sale) return null;

    const accounts = await this.resolveAccounts(tenantId);
    if (!accounts) return null;

    const lines: GlLine[] = [];
    const tenderTotals = new Map<string, number>();

    for (const p of sale.payments) {
      if (p.amount <= 0.009) continue;
      if (String(p.method).toUpperCase() === 'LOYALTY_POINTS') continue;
      const key = this.tenderAccount(accounts, p.method);
      tenderTotals.set(key, round2((tenderTotals.get(key) ?? 0) + p.amount));
    }

    let changeLeft = round2(sale.changeDue ?? 0);
    if (changeLeft > 0.009) {
      const order = [accounts.cash, accounts.card, accounts.upi, accounts.bank, accounts.chequeRecv, accounts.wallet, accounts.gift];
      for (const acct of order) {
        if (changeLeft <= 0.009) break;
        const have = tenderTotals.get(acct) ?? 0;
        if (have <= 0.009) continue;
        const take = Math.min(have, changeLeft);
        tenderTotals.set(acct, round2(have - take));
        changeLeft = round2(changeLeft - take);
      }
    }

    const collected = round2([...tenderTotals.values()].reduce((s, n) => s + n, 0));
    const arCharge = round2(Math.max(0, sale.total - collected));
    if (arCharge > 0.009) {
      tenderTotals.set(accounts.ar, round2((tenderTotals.get(accounts.ar) ?? 0) + arCharge));
    }

    let debitTotal = round2([...tenderTotals.values()].reduce((s, n) => s + n, 0));
    const target = round2(sale.total);
    if (debitTotal > target + 0.05) {
      const excess = round2(debitTotal - target);
      let biggestKey = accounts.cash;
      let biggestAmt = 0;
      for (const [k, v] of tenderTotals) {
        if (v > biggestAmt) {
          biggestAmt = v;
          biggestKey = k;
        }
      }
      tenderTotals.set(biggestKey, round2(Math.max(0, biggestAmt - excess)));
      debitTotal = target;
    }

    for (const [accountId, amount] of tenderTotals) {
      if (amount > 0.009) {
        lines.push({ accountId, side: 'DEBIT', amount, description: 'Tender' });
      }
    }

    debitTotal = round2(lines.filter((l) => l.side === 'DEBIT').reduce((s, l) => s + l.amount, 0));
    if (target > 0.009 && debitTotal <= 0.009) {
      lines.push({ accountId: accounts.cash, side: 'DEBIT', amount: target, description: 'Sale total' });
      debitTotal = target;
    }

    // Revenue by line kind (proportional tax split)
    const revenueByAcct = new Map<string, number>();
    let goodsNet = 0;
    for (const item of sale.items) {
      const kind = classifyInventoryKind({
        categoryName: item.variant?.product?.category?.name,
        productName: item.variant?.product?.name ?? item.productName,
        tags: item.variant?.product?.tags,
      });
      const lineNet = round2(item.total - (item.taxAmount ?? 0));
      const acct = this.salesAccount(accounts, kind);
      revenueByAcct.set(acct, round2((revenueByAcct.get(acct) ?? 0) + Math.max(0, lineNet)));
      goodsNet = round2(goodsNet + Math.max(0, lineNet));
    }

    const tax = round2(Math.min(sale.taxAmount ?? 0, debitTotal));
    const netSales = round2(Math.max(0, debitTotal - tax));
    if (goodsNet > 0.009 && Math.abs(goodsNet - netSales) > 0.05) {
      // Scale revenue lines to match tender net
      const scale = netSales / goodsNet;
      for (const [acct, amt] of [...revenueByAcct.entries()]) {
        revenueByAcct.set(acct, round2(amt * scale));
      }
    } else if (goodsNet <= 0.009 && netSales > 0.009) {
      revenueByAcct.set(accounts.sales, netSales);
    }

    for (const [accountId, amount] of revenueByAcct) {
      if (amount > 0.009) {
        lines.push({ accountId, side: 'CREDIT', amount, description: 'Sales' });
      }
    }
    if (tax > 0.009) {
      lines.push({ accountId: accounts.vatPayable, side: 'CREDIT', amount: tax, description: 'Output VAT' });
    }

    // Separate COGS journal lines (same entry for idempotency; still balanced)
    const cogsByPair = new Map<string, { cogs: string; inv: string; amount: number }>();
    for (const item of sale.items) {
      const kind = classifyInventoryKind({
        categoryName: item.variant?.product?.category?.name,
        productName: item.variant?.product?.name ?? item.productName,
        tags: item.variant?.product?.tags,
      });
      if (kind === 'service' || kind === 'reload') continue;
      const amt = round2((item.costPrice ?? 0) * item.quantity);
      if (amt <= 0.009) continue;
      const cogsAcct = this.cogsAccount(accounts, kind);
      const invAcct = this.inventoryAccount(accounts, kind);
      const key = `${cogsAcct}:${invAcct}`;
      const prev = cogsByPair.get(key);
      cogsByPair.set(key, {
        cogs: cogsAcct,
        inv: invAcct,
        amount: round2((prev?.amount ?? 0) + amt),
      });
    }
    for (const row of cogsByPair.values()) {
      lines.push({ accountId: row.cogs, side: 'DEBIT', amount: row.amount, description: 'COGS' });
      lines.push({ accountId: row.inv, side: 'CREDIT', amount: row.amount, description: 'Inventory' });
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
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: { include: { category: { select: { name: true } } } },
              },
            },
          },
        },
        originalSale: { include: { payments: true } },
      },
    });
    if (!ret) return null;

    const accounts = await this.resolveAccounts(tenantId);
    if (!accounts) return null;

    const total = round2(ret.refundAmount > 0 ? ret.refundAmount : ret.totalAmount);
    if (total <= 0.009) return null;

    // Estimate tax portion ~18% inclusive if original sale had tax
    const saleTax = ret.originalSale?.taxAmount ?? 0;
    const saleTotal = ret.originalSale?.total ?? total;
    const taxRatio = saleTotal > 0 ? Math.min(1, saleTax / saleTotal) : 0;
    const tax = round2(total * taxRatio);
    const net = round2(total - tax);

    const refundMethod = ret.originalSale?.payments?.[0]?.method ?? PaymentMethod.CASH;
    const refundAcct = this.tenderAccount(accounts, refundMethod);

    const lines: GlLine[] = [
      { accountId: accounts.salesReturns, side: 'DEBIT', amount: net > 0.009 ? net : total, description: 'Sales return' },
    ];
    if (tax > 0.009) {
      lines.push({ accountId: accounts.vatPayable, side: 'DEBIT', amount: tax, description: 'VAT reverse' });
    }
    lines.push({ accountId: refundAcct, side: 'CREDIT', amount: total, description: 'Refund' });

    // Restore inventory / reverse COGS when restocking
    if (ret.restockItems) {
      for (const item of ret.items) {
        const kind = classifyInventoryKind({
          categoryName: item.variant?.product?.category?.name,
          productName: item.variant?.product?.name,
          tags: item.variant?.product?.tags,
        });
        if (kind === 'service' || kind === 'reload') continue;
        const unitCost = item.variant?.costPrice ?? item.variant?.product?.costPrice ?? item.unitPrice * 0.7;
        const amt = round2(unitCost * item.quantity);
        if (amt <= 0.009) continue;
        lines.push({
          accountId: this.inventoryAccount(accounts, kind),
          side: 'DEBIT',
          amount: amt,
          description: 'Restock inventory',
        });
        lines.push({
          accountId: this.cogsAccount(accounts, kind),
          side: 'CREDIT',
          amount: amt,
          description: 'COGS reverse',
        });
      }
    }

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
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: { include: { category: { select: { name: true } } } },
              },
            },
          },
        },
        purchase: true,
      },
    });
    if (!grn) return null;

    const accounts = await this.resolveAccounts(tenantId);
    if (!accounts) return null;

    const invByAcct = new Map<string, number>();
    let goods = 0;
    for (const i of grn.items) {
      const kind = classifyInventoryKind({
        categoryName: i.variant?.product?.category?.name,
        productName: i.variant?.product?.name ?? i.productName,
        tags: i.variant?.product?.tags,
      });
      const amt = round2(Math.max(0, i.receivedQty) * (i.unitCost ?? 0));
      if (amt <= 0.009) continue;
      const acct = this.inventoryAccount(accounts, kind === 'service' || kind === 'reload' ? 'mobile' : kind);
      invByAcct.set(acct, round2((invByAcct.get(acct) ?? 0) + amt));
      goods = round2(goods + amt);
    }
    if (goods <= 0.009) return null;

    // Prefer supplier invoice tax if linked
    const inv = await this.prisma.supplierInvoice.findFirst({
      where: { tenantId, goodsReceiptId: grn.id, status: { not: SupplierInvoiceStatus.CANCELLED } },
    });
    const tax = round2(inv?.taxAmount ?? 0);
    const apTotal = round2(goods + tax);

    const lines: GlLine[] = [];
    for (const [accountId, amount] of invByAcct) {
      lines.push({ accountId, side: 'DEBIT', amount, description: 'Inventory received' });
    }
    if (tax > 0.009) {
      lines.push({ accountId: accounts.vatInput, side: 'DEBIT', amount: tax, description: 'VAT Input' });
    }
    lines.push({ accountId: accounts.ap, side: 'CREDIT', amount: apTotal, description: 'Accounts payable' });

    return this.post(tenantId, grn.branchId, userId, {
      description: `GRN ${grn.grnNumber}`,
      date: grn.createdAt,
      referenceType: 'GRN',
      referenceId: grn.id,
      lines,
    });
  }

  // ── Supplier invoice (no GRN / standalone) ────────────────────────────

  async postSupplierInvoice(invoiceId: string, tenantId: string, userId = 'system') {
    const inv = await this.prisma.supplierInvoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!inv) return null;
    if (inv.status === SupplierInvoiceStatus.DRAFT || inv.status === SupplierInvoiceStatus.CANCELLED) {
      return null;
    }

    // If GRN already posted GL for this receipt, skip duplicate AP
    if (inv.goodsReceiptId) {
      const grnJe = await this.alreadyPosted(tenantId, 'GRN', inv.goodsReceiptId);
      if (grnJe) {
        return { skipped: true as const, journalId: grnJe.id, entryNumber: grnJe.entryNumber };
      }
    }

    const accounts = await this.resolveAccounts(tenantId);
    if (!accounts) return null;

    const net = round2(inv.subtotal || inv.total - (inv.taxAmount ?? 0));
    const tax = round2(inv.taxAmount ?? 0);
    const total = round2(inv.total || net + tax);
    if (total <= 0.009) return null;

    const lines: GlLine[] = [
      { accountId: accounts.inventory, side: 'DEBIT', amount: net > 0.009 ? net : total, description: 'Purchases / inventory' },
    ];
    if (tax > 0.009) {
      lines.push({ accountId: accounts.vatInput, side: 'DEBIT', amount: tax, description: 'VAT Input' });
    }
    lines.push({ accountId: accounts.ap, side: 'CREDIT', amount: total, description: 'Accounts payable' });

    return this.post(tenantId, null, userId, {
      description: `Supplier invoice ${inv.invoiceNumber}`,
      date: inv.invoiceDate,
      referenceType: 'SUPPLIER_INVOICE',
      referenceId: inv.id,
      lines,
    });
  }

  // ── Supplier return ──────────────────────────────────────────────────

  async postSupplierReturn(returnId: string, tenantId: string, userId = 'system') {
    const ret = await this.prisma.supplierReturn.findFirst({
      where: { id: returnId, tenantId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: { include: { category: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!ret || ret.status !== 'POSTED') return null;

    const accounts = await this.resolveAccounts(tenantId);
    if (!accounts) return null;

    const invByAcct = new Map<string, number>();
    let goods = 0;
    for (const i of ret.items) {
      const kind = classifyInventoryKind({
        categoryName: i.variant?.product?.category?.name,
        productName: i.productName,
        tags: i.variant?.product?.tags,
      });
      const amt = round2(i.quantity * (i.unitCost ?? 0));
      if (amt <= 0.009) continue;
      const acct = this.inventoryAccount(accounts, kind === 'service' || kind === 'reload' ? 'mobile' : kind);
      invByAcct.set(acct, round2((invByAcct.get(acct) ?? 0) + amt));
      goods = round2(goods + amt);
    }
    if (goods <= 0.009) return null;

    const lines: GlLine[] = [
      { accountId: accounts.ap, side: 'DEBIT', amount: goods, description: 'AP credit note' },
    ];
    for (const [accountId, amount] of invByAcct) {
      lines.push({ accountId, side: 'CREDIT', amount, description: 'Inventory returned' });
    }

    return this.post(tenantId, ret.branchId, userId, {
      description: `Supplier return ${ret.returnNumber}`,
      date: ret.postedAt ?? ret.createdAt,
      referenceType: 'SUPPLIER_RETURN',
      referenceId: ret.id,
      lines,
    });
  }

  // ── Repair / job card ────────────────────────────────────────────────

  async postRepair(jobCardId: string, tenantId: string, userId = 'system') {
    const job = await this.prisma.jobCard.findFirst({
      where: { id: jobCardId, tenantId },
      include: {
        lines: {
          include: {
            variant: {
              include: {
                product: { include: { category: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!job) return null;
    if (job.status !== 'COMPLETED' && job.status !== 'INVOICED') return null;

    // If converted to a POS sale, sale journal covers it
    if (job.saleId) {
      const saleJe = await this.alreadyPosted(tenantId, 'SALE', job.saleId);
      if (saleJe) {
        return { skipped: true as const, journalId: saleJe.id, entryNumber: saleJe.entryNumber };
      }
    }

    const accounts = await this.resolveAccounts(tenantId);
    if (!accounts) return null;

    const total = round2(job.total);
    if (total <= 0.009) return null;

    let income = total;
    let vat = 0;
    if (accounts.repairVatEnabled) {
      // 18% inclusive split
      vat = round2(total - total / 1.18);
      income = round2(total - vat);
    }

    // Assume unpaid → AR; if linked sale exists with payments, use tender
    let debitAcct = accounts.ar;
    let received = 0;
    if (job.saleId) {
      const sale = await this.prisma.sale.findFirst({
        where: { id: job.saleId, tenantId },
        include: { payments: true },
      });
      if (sale) {
        received = round2(sale.payments.reduce((s, p) => s + p.amount, 0) - (sale.changeDue ?? 0));
        if (received >= total - 0.05) {
          debitAcct = this.tenderAccount(accounts, sale.payments[0]?.method ?? PaymentMethod.CASH);
        }
      }
    }

    const lines: GlLine[] = [];
    if (received > 0.009 && received < total - 0.05) {
      lines.push({
        accountId: this.tenderAccount(accounts, PaymentMethod.CASH),
        side: 'DEBIT',
        amount: received,
        description: 'Repair receipt',
      });
      lines.push({
        accountId: accounts.ar,
        side: 'DEBIT',
        amount: round2(total - received),
        description: 'Repair due',
      });
    } else {
      lines.push({
        accountId: debitAcct,
        side: 'DEBIT',
        amount: total,
        description: received > 0 ? 'Repair paid' : 'Repair receivable',
      });
    }

    lines.push({
      accountId: accounts.repairIncome,
      side: 'CREDIT',
      amount: income,
      description: 'Repair income',
    });
    if (vat > 0.009) {
      lines.push({
        accountId: accounts.vatPayable,
        side: 'CREDIT',
        amount: vat,
        description: 'VAT on repair',
      });
    }

    // Parts COGS
    for (const line of job.lines) {
      if (line.lineType !== 'PART') continue;
      const cost = round2((line.variant?.costPrice ?? line.variant?.product?.costPrice ?? 0) * line.quantity);
      if (cost <= 0.009) continue;
      lines.push({
        accountId: accounts.cogsRepair,
        side: 'DEBIT',
        amount: cost,
        description: 'Repair parts COGS',
      });
      lines.push({
        accountId: accounts.invSpare,
        side: 'CREDIT',
        amount: cost,
        description: 'Spare parts inventory',
      });
    }

    return this.post(tenantId, job.branchId, userId, {
      description: `Repair ${job.jobNumber}`,
      date: job.completedAt ?? job.updatedAt,
      referenceType: 'REPAIR',
      referenceId: job.id,
      lines,
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

    const creditAcct = this.paymentCreditAccount(accounts, payment.method);

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

    let expenseAcct = accounts.expense;
    if (expense.categoryId) {
      const linked = await this.prisma.account.findFirst({
        where: { id: expense.categoryId, tenantId, isActive: true },
        select: { id: true },
      });
      if (linked) expenseAcct = linked.id;
    }

    const creditAcct = this.paymentCreditAccount(accounts, expense.paymentMethod);

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
    await this.prisma.accountingPreference.upsert({
      where: { tenantId },
      create: {
        tenantId,
        requireJournalApproval: false,
        allowPostDraft: true,
        autoPostEnabled: true,
      },
      update: {
        requireJournalApproval: false,
        allowPostDraft: true,
      },
    });

    const take = Math.min(500, limit);
    const [sales, grns, expenses, apPays, invoices, supReturns, repairs, saleReturns] =
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
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true },
        }),
      ]);

    let posted = 0;
    let skipped = 0;
    const run = async (fn: () => Promise<{ skipped?: boolean; journalId?: string | null } | null>) => {
      try {
        const r = await fn();
        if (r?.skipped) skipped++;
        else if (r?.journalId) posted++;
      } catch {
        skipped++;
      }
    };

    for (const s of sales) await run(() => this.postSale(s.id, tenantId));
    for (const g of grns) await run(() => this.postGoodsReceipt(g.id, tenantId));
    for (const e of expenses) await run(() => this.postExpense(e.id, tenantId));
    for (const p of apPays) await run(() => this.postSupplierPayment(p.id, tenantId));
    for (const i of invoices) await run(() => this.postSupplierInvoice(i.id, tenantId));
    for (const r of supReturns) await run(() => this.postSupplierReturn(r.id, tenantId));
    for (const j of repairs) await run(() => this.postRepair(j.id, tenantId));
    for (const r of saleReturns) await run(() => this.postReturn(r.id, tenantId));

    return {
      sales: sales.length,
      grns: grns.length,
      expenses: expenses.length,
      supplierPayments: apPays.length,
      supplierInvoices: invoices.length,
      supplierReturns: supReturns.length,
      repairs: repairs.length,
      saleReturns: saleReturns.length,
      journalsPosted: posted,
      alreadyPostedOrSkipped: skipped,
    };
  }
}
