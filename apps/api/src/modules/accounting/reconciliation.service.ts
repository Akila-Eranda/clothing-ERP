/**
 * Full accounting reconciliation - READ-ONLY service.
 * Runs SELECT / groupBy / count queries only. It never writes, posts, voids or corrects anything.
 * Each check compares two independent sources (see reconciliation.helper.ts); a check that cannot run is reported
 * as NOT_CHECKED with the reason, never skipped silently.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ACCOUNT_MAPPING_CODE_FALLBACKS } from './account-mapping.helper';
import {
  ReconCheck, accountBalanceDrift, compareSources, glBalance, inventoryValuation, notChecked, summarizeChecks,
  totalsByAccount, trialBalanceTotals, roundCents, type ReconSide, type ReconStatus,
} from './reconciliation.helper';

const side = (label: string, source: string, value: number | null): ReconSide => ({ label, source, value });

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async run(tenantId: string, filters: {
    branchId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
  } = {}) {
    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
    const dateTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999Z`) : undefined;
    const createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
    const hasDateScope = Boolean(dateFrom || dateTo);
    const accounts = await this.prisma.account.findMany({
      where: { tenantId },
      select: { id: true, code: true, type: true, balance: true, openingBalance: true, isActive: true },
    });
    // Same inclusion rule as docs/ops-sql/wallet-2400-reconciliation.sql: every journal that is not VOID.
    const grouped = async (field: 'debitAccountId' | 'creditAccountId') =>
      this.prisma.journalLine.groupBy({
        by: [field],
        where: {
          [field]: { not: null },
          journalEntry: {
            tenantId,
            status: { not: 'VOID' },
            ...(filters.branchId ? { branchId: filters.branchId } : {}),
            ...(Object.keys(createdAt).length ? { date: createdAt } : {}),
          },
        },
        _sum: { amount: true },
      });
    const [debits, credits] = await Promise.all([grouped('debitAccountId'), grouped('creditAccountId')]);
    const totalsMap = new Map<string, { accountId: string; debit: number; credit: number }>();
    for (const d of debits) totalsMap.set(d.debitAccountId!, { accountId: d.debitAccountId!, debit: d._sum.amount ?? 0, credit: 0 });
    for (const c of credits) {
      const r = totalsMap.get(c.creditAccountId!) ?? { accountId: c.creditAccountId!, debit: 0, credit: 0 };
      r.credit = c._sum.amount ?? 0;
      totalsMap.set(c.creditAccountId!, r);
    }
    const totals = [...totalsMap.values()];
    const idsFor = (codes: string[]) => accounts.filter((a) => codes.includes(a.code)).map((a) => a.id);
    const codes = ACCOUNT_MAPPING_CODE_FALLBACKS;
    // Only the first code that exists for the tenant is the mapped account (same "preferred first" idea as posting).
    const firstExisting = (list: string[]) => {
      const code = list.find((c) => accounts.some((a) => a.code === c));
      return code ? idsFor([code]) : [];
    };

    const checks: ReconCheck[] = [];
    const safe = async (key: string, title: string, fn: () => Promise<ReconCheck>) => {
      try {
        checks.push(await fn());
      } catch (e) {
        checks.push(notChecked(key, title, side('-', '-', null), side('-', '-', null), `Check could not run: ${(e as Error).message}`));
      }
    };

    await safe('trial_balance', 'Trial balance: total debits = total credits', async () => {
      const tb = trialBalanceTotals(accounts.filter((a) => a.isActive));
      return compareSources('trial_balance', 'Trial balance: total debits = total credits',
        side('Debit-side balances', 'accounts.balance (active accounts)', tb.debit),
        side('Credit-side balances', 'accounts.balance (active accounts)', tb.credit));
    });

    await safe('unbalanced_entries', 'Every journal entry is balanced', async () => {
      const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM (
          SELECT jl."journalEntryId"
          FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalEntryId"
          WHERE je."tenantId" = ${tenantId} AND je.status::text <> 'VOID'
          GROUP BY jl."journalEntryId"
          HAVING ABS(SUM(CASE WHEN jl."debitAccountId" IS NOT NULL THEN jl.amount ELSE 0 END)
                   - SUM(CASE WHEN jl."creditAccountId" IS NOT NULL THEN jl.amount ELSE 0 END)) > 0.01
        ) x`;
      return compareSources('unbalanced_entries', 'Every journal entry is balanced',
        side('Unbalanced entries', 'journal_lines grouped by entry', Number(rows[0]?.n ?? 0)),
        side('Expected', 'rule', 0));
    });

    await safe('account_drift', 'Stored account balance = opening + journal movements', async () => {
      const drift = accountBalanceDrift(accounts, totals);
      return compareSources('account_drift', 'Stored account balance = opening + journal movements',
        side('Accounts with drift', 'accounts.balance vs journal_lines', drift.length),
        side('Expected', 'rule', 0),
        { note: drift.length ? `Codes: ${drift.slice(0, 20).map((d) => `${d.code} (${d.difference})`).join(', ')}` : undefined });
    });

    await safe('wallet_2400', 'Customer wallet = GL 2400', async () => {
      const w = await this.prisma.customer.aggregate({ where: { tenantId }, _sum: { walletBalance: true } });
      return compareSources('wallet_2400', 'Customer wallet = GL 2400',
        side('Sum of customer wallet balances', 'customers.walletBalance', roundCents(w._sum.walletBalance ?? 0)),
        side('GL 2400 (credit - debit)', 'journal_lines, account 2400', glBalance(totals, idsFor(['2400']), 'CREDIT')),
        { note: 'Legacy manual top-ups were never posted; see docs/ops-sql/wallet-2400-reconciliation.sql for the breakdown.' });
    });

    await safe('wallet_history', 'Customer wallet balances = wallet transaction history', async () => {
      const [balances, transactions, unposted] = await Promise.all([
        this.prisma.customer.aggregate({ where: { tenantId }, _sum: { walletBalance: true } }),
        this.prisma.walletTransaction.aggregate({ where: { tenantId, ...(Object.keys(createdAt).length ? { createdAt } : {}) }, _sum: { amount: true } }),
        this.prisma.walletTransaction.count({
          where: {
            tenantId,
            type: 'TOPUP',
            paymentMethod: null,
            ...(Object.keys(createdAt).length ? { createdAt } : {}),
          },
        }),
      ]);
      return compareSources('wallet_history', 'Customer wallet balances = wallet transaction history',
        side('Customer wallet balances', 'customers.walletBalance', roundCents(balances._sum.walletBalance ?? 0)),
        side('Wallet transaction net movement', 'wallet_transactions.amount', roundCents(transactions._sum.amount ?? 0)),
        {
          note: unposted
            ? `${unposted} historical top-up(s) have no payment method and require review; no adjustment journal was created.`
            : undefined,
        });
    });

    await safe('cash_tender', 'Cash tender = cash register sale movements', async () => {
      const [tenders, movements] = await Promise.all([
        this.prisma.salePayment.aggregate({
          where: {
            method: 'CASH',
            status: 'COMPLETED',
            sale: {
              tenantId,
              status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
              ...(filters.branchId ? { branchId: filters.branchId } : {}),
              ...(Object.keys(createdAt).length ? { createdAt } : {}),
            },
          },
          _sum: { amount: true },
        }),
        this.prisma.cashMovement.aggregate({
          where: {
            tenantId,
            type: 'SALE',
            register: {
              ...(filters.branchId ? { branchId: filters.branchId } : {}),
            },
            ...(Object.keys(createdAt).length ? { createdAt } : {}),
          },
          _sum: { amount: true },
        }),
      ]);
      return compareSources('cash_tender', 'Cash tender = cash register sale movements',
        side('Cash sale payments', 'sale_payments.amount', roundCents(tenders._sum.amount ?? 0)),
        side('Cash register sale movements', 'cash_movements.amount', roundCents(movements._sum.amount ?? 0)),
        { note: 'Refunds, opening floats and manual till movements are separate checks; investigate any difference before posting an adjustment.' });
    });

    await safe('cash_gl', 'Cash register expected movement = cash GL', async () => {
      const cashIds = [...new Set([...firstExisting(codes.CASH), ...firstExisting(codes.CASHIER_WALLET)])];
      const movements = await this.prisma.cashMovement.aggregate({
        where: {
          tenantId,
          register: { ...(filters.branchId ? { branchId: filters.branchId } : {}) },
          ...(Object.keys(createdAt).length ? { createdAt } : {}),
        },
        _sum: { amount: true },
      });
      return compareSources('cash_gl', 'Cash register expected movement = cash GL',
        side('Cash register movement total', 'cash_movements.amount', roundCents(movements._sum.amount ?? 0)),
        side('Cash and cashier-wallet GL', 'journal_lines, mapped cash accounts', cashIds.length ? glBalance(totals, cashIds, 'DEBIT') : null),
        { decisionNote: 'Opening floats, deposits, withdrawals and cash over/short treatment must be approved before this can be treated as an adjustment.' });
    });

    await safe('supplier_advance_1250', 'Supplier advance balances = GL 1250', async () => {
      const s = await this.prisma.supplier.aggregate({ where: { tenantId }, _sum: { advanceBalance: true } });
      const adv = idsFor(['1250']);
      return compareSources('supplier_advance_1250', 'Supplier advance balances = GL 1250',
        side('Sum of suppliers.advanceBalance', 'suppliers.advanceBalance', roundCents(s._sum.advanceBalance ?? 0)),
        side('GL 1250 (debit - credit)', 'journal_lines, account 1250', adv.length ? glBalance(totals, adv, 'DEBIT') : null),
        { note: adv.length ? undefined : 'Account 1250 does not exist for this tenant: posting falls back to Accounts Payable (advance is netted there).' });
    });

    await safe('supplier_ap', 'Supplier payables = GL Accounts Payable', async () => {
      const s = await this.prisma.supplier.aggregate({ where: { tenantId }, _sum: { balance: true } });
      const ap = firstExisting(codes.AP);
      const hasAdvanceAccount = idsFor(['1250']).length > 0;
      return compareSources('supplier_ap', 'Supplier payables = GL Accounts Payable',
        side('Sum of suppliers.balance (subledger)', 'suppliers.balance', roundCents(s._sum.balance ?? 0)),
        side('GL Accounts Payable (credit - debit)', 'journal_lines, mapped AP account', ap.length ? glBalance(totals, ap, 'CREDIT') : null),
        { note: hasAdvanceAccount ? undefined : 'No 1250 account: advance is netted inside AP, so a difference equal to the advance total is expected.' });
    });

    await safe('supplier_payment_allocations', 'Supplier payments = allocations + advances', async () => {
      const [payments, allocations] = await Promise.all([
        this.prisma.supplierPayment.aggregate({
          where: { tenantId, ...(Object.keys(createdAt).length ? { paidAt: createdAt } : {}) },
          _sum: { amount: true, advanceAmount: true },
        }),
        this.prisma.supplierPaymentAllocation.aggregate({
          where: { tenantId, payment: { tenantId, ...(Object.keys(createdAt).length ? { paidAt: createdAt } : {}) } },
          _sum: { amount: true },
        }),
      ]);
      const expected = roundCents((payments._sum.amount ?? 0) - (payments._sum.advanceAmount ?? 0));
      const allocated = roundCents(allocations._sum.amount ?? 0);
      return compareSources('supplier_payment_allocations', 'Supplier payments = allocations + advances',
        side('Payments excluding advances', 'supplier_payments.amount - advanceAmount', expected),
        side('Payment allocations', 'supplier_payment_allocations.amount', allocated),
        { note: 'Unallocated non-advance payment amounts require supplier review; reconciliation does not alter allocations.' });
    });

    await safe('supplier_advance_history', 'Supplier advance balance = advance history', async () => {
      const [suppliers, entries] = await Promise.all([
        this.prisma.supplier.aggregate({ where: { tenantId }, _sum: { advanceBalance: true } }),
        this.prisma.supplierAdvanceEntry.aggregate({ where: { tenantId }, _sum: { amount: true } }),
      ]);
      return compareSources('supplier_advance_history', 'Supplier advance balance = advance history',
        side('Supplier advance balances', 'suppliers.advanceBalance', roundCents(suppliers._sum.advanceBalance ?? 0)),
        side('Advance history net', 'supplier_advance_entries.amount', roundCents(entries._sum.amount ?? 0)),
        { note: 'Advance rows are tenant- and supplier-scoped; cross-supplier application is rejected by the supplier service.' });
    });

    await safe('customer_credit_ar', 'Customer credit balances = GL Accounts Receivable', async () => {
      const c = await this.prisma.customer.aggregate({ where: { tenantId }, _sum: { creditBalance: true } });
      const ar = firstExisting(codes.AR);
      return compareSources('customer_credit_ar', 'Customer credit balances = GL Accounts Receivable',
        side('Sum of customers.creditBalance', 'customers.creditBalance', roundCents(c._sum.creditBalance ?? 0)),
        side('GL Accounts Receivable (debit - credit)', 'journal_lines, mapped AR account', ar.length ? glBalance(totals, ar, 'DEBIT') : null),
        { note: 'Assumes AR holds only customer credit sales; other AR postings would show as a difference.' });
    });

    await safe('inventory_valuation', 'Stock valuation = GL Inventory', async () => {
      const rows = await this.prisma.inventory.findMany({ where: { tenantId }, select: { quantity: true, avgCost: true } });
      const invIds = idsFor(['1400', '1310', '1320']);
      return compareSources('inventory_valuation', 'Stock valuation = GL Inventory',
        side('Quantity x average cost', 'inventory.quantity * inventory.avgCost', inventoryValuation(rows)),
        side('GL Inventory (1400/1310/1320)', 'journal_lines, inventory accounts', invIds.length ? glBalance(totals, invIds, 'DEBIT') : null),
        { decisionNote: 'DECISION FOR THE USER: free-quantity valuation is undecided. Free units raise stock quantity but the GRN posting values only the paid amount, so a difference here may be the free-qty effect (or opening stock without a GL entry). Not adjusted automatically.' });
    });

    await safe('stock_ledger', 'Inventory quantity = stock movement ledger', async () => {
      const [onHand, ledger] = await Promise.all([
        this.prisma.inventory.groupBy({ by: ['variantId'], where: { tenantId }, _sum: { quantity: true } }),
        this.prisma.inventoryLog.groupBy({ by: ['variantId'], where: { tenantId, NOT: { notes: 'LOT_ALLOCATION' } }, _sum: { quantityChange: true } }),
      ]);
      const l = new Map(ledger.map((r) => [r.variantId, r._sum.quantityChange ?? 0]));
      let drift = 0;
      for (const o of onHand) if (Math.abs((o._sum.quantity ?? 0) - (l.get(o.variantId) ?? 0)) > 0.0005) drift++;
      return compareSources('stock_ledger', 'Inventory quantity = stock movement ledger',
        side('Variants where on-hand differs from ledger sum', 'inventory vs inventory_logs', drift),
        side('Expected', 'rule', 0),
        { note: 'Stock created by direct opening-balance writes has no ledger rows and shows here; use the product/variant stock report to list the variants.' });
    });

    await safe('qr_fee', 'QR/bank payment fees = GL payment charges', async () => {
      const fee = await this.prisma.$queryRaw<{ s: number | null }[]>`
        SELECT SUM(sp."feeAmount")::float8 AS s FROM sale_payments sp JOIN sales s ON s.id = sp."saleId"
        WHERE s."tenantId" = ${tenantId} AND s.status::text IN ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED') AND sp."feeAmount" IS NOT NULL`;
      const pc = firstExisting(codes.PAYMENT_CHARGES);
      return compareSources('qr_fee', 'QR/bank payment fees = GL payment charges',
        side('Sum of sale_payments.feeAmount', 'sale_payments.feeAmount', roundCents(fee[0]?.s ?? 0)),
        side('GL payment charges (debit - credit)', 'journal_lines, mapped PAYMENT_CHARGES account', pc.length ? glBalance(totals, pc, 'DEBIT') : null),
        { note: 'Payment charges account may also hold other bank charges (expenses), which would show as a difference.' });
    });

    await safe('qr_gross_net', 'QR gross less fee = net bank amount', async () => {
      const qr = await this.prisma.salePayment.aggregate({
        where: {
          method: 'QR',
          status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
          sale: { tenantId, ...(filters.branchId ? { branchId: filters.branchId } : {}), ...(Object.keys(createdAt).length ? { createdAt } : {}) },
        },
        _sum: { amount: true, feeAmount: true, netAmount: true },
      });
      return compareSources('qr_gross_net', 'QR gross less fee = net bank amount',
        side('Gross QR payments less fees', 'sale_payments.amount - feeAmount', roundCents((qr._sum.amount ?? 0) - (qr._sum.feeAmount ?? 0))),
        side('Recorded net QR amount', 'sale_payments.netAmount', qr._sum.netAmount == null ? null : roundCents(qr._sum.netAmount)),
        { note: 'Settlement status is not stored; this check validates recorded gross/fee/net only and does not assume bank settlement.' });
    });

    await safe('cashless_attribution', 'Cashless payments have bank attribution', async () => {
      const missing = await this.prisma.salePayment.count({
        where: {
          method: { in: ['CARD', 'BANK_TRANSFER', 'QR'] },
          status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
          bankAccountId: null,
          sale: { tenantId, ...(filters.branchId ? { branchId: filters.branchId } : {}), ...(Object.keys(createdAt).length ? { createdAt } : {}) },
        },
      });
      return compareSources('cashless_attribution', 'Cashless payments have bank attribution',
        side('Cashless payments without bank account', 'sale_payments.bankAccountId', missing),
        side('Expected', 'rule', 0),
        { note: 'Card processors and bank settlement feeds are not modeled; missing attribution is reported, not inferred.' });
    });

    await safe('refund_postings', 'Completed returns have return journals', async () => {
      const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM returns r
        WHERE r."tenantId" = ${tenantId}
          AND r.status::text IN ('APPROVED','REFUND_PROCESSED')
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries j
            WHERE j."tenantId" = r."tenantId" AND j."referenceType" = 'SALE_RETURN'
              AND j."referenceId" = r.id AND j.status::text <> 'VOID'
          )`;
      return compareSources('refund_postings', 'Completed returns have return journals',
        side('Returns without a non-void journal', 'returns vs journal_entries', Number(rows[0]?.n ?? 0)),
        side('Expected', 'rule', 0),
        { note: 'Return schema does not retain the original refund tender, so cash/card/bank/wallet attribution cannot be independently verified.' });
    });

    await safe('internal_transfers', 'Internal bank transfers are not treated as sales', async () => {
      const [inbound, outbound] = await Promise.all([
        this.prisma.bankTransaction.aggregate({ where: { tenantId, type: 'TRANSFER_IN', status: { not: 'VOID' }, ...(Object.keys(createdAt).length ? { txnDate: createdAt } : {}) }, _sum: { amount: true } }),
        this.prisma.bankTransaction.aggregate({ where: { tenantId, type: 'TRANSFER_OUT', status: { not: 'VOID' }, ...(Object.keys(createdAt).length ? { txnDate: createdAt } : {}) }, _sum: { amount: true } }),
      ]);
      return compareSources('internal_transfers', 'Internal bank transfers are not treated as sales',
        side('Transfer-in amount', 'bank_transactions TRANSFER_IN', roundCents(inbound._sum.amount ?? 0)),
        side('Transfer-out amount', 'bank_transactions TRANSFER_OUT', roundCents(outbound._sum.amount ?? 0)),
        { note: 'Transfer pairing metadata is not stored, so this reports both sides without netting or classifying them as revenue/expense.' });
    });

    await safe('invalid_account_references', 'Journal lines reference accounts in this tenant', async () => {
      const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl."journalEntryId"
        LEFT JOIN accounts da ON da.id = jl."debitAccountId" AND da."tenantId" = je."tenantId"
        LEFT JOIN accounts ca ON ca.id = jl."creditAccountId" AND ca."tenantId" = je."tenantId"
        WHERE je."tenantId" = ${tenantId} AND je.status::text <> 'VOID'
          AND ((jl."debitAccountId" IS NOT NULL AND da.id IS NULL)
            OR (jl."creditAccountId" IS NOT NULL AND ca.id IS NULL))`;
      return compareSources('invalid_account_references', 'Journal lines reference accounts in this tenant',
        side('Lines with invalid or cross-tenant account references', 'journal_lines/accounts', Number(rows[0]?.n ?? 0)),
        side('Expected', 'rule', 0));
    });

    await safe('locked_period_postings', 'No journals posted in locked accounting periods', async () => {
      const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM journal_entries j
        JOIN accounting_periods p ON p."tenantId" = j."tenantId"
          AND j.date >= p."startDate" AND j.date <= p."endDate"
        WHERE j."tenantId" = ${tenantId} AND j.status::text <> 'VOID' AND p.status::text = 'LOCKED'`;
      return compareSources('locked_period_postings', 'No journals posted in locked accounting periods',
        side('Journals in locked periods', 'journal_entries/accounting_periods', Number(rows[0]?.n ?? 0)),
        side('Expected', 'rule', 0),
        { note: 'This is a historical integrity report; reconciliation does not reopen periods or move entries.' });
    });


    await safe('bank_accounts', 'Bank account balances = linked GL accounts', async () => {
      const banks = await this.prisma.bankAccount.findMany({ where: { tenantId, isActive: true }, select: { currentBalance: true, glAccountId: true } });
      const linked = banks.filter((b) => b.glAccountId);
      const unlinked = banks.length - linked.length;
      return compareSources('bank_accounts', 'Bank account balances = linked GL accounts',
        side('Sum of bank_accounts.currentBalance (linked)', 'bank_accounts.currentBalance', roundCents(linked.reduce((s, b) => s + b.currentBalance, 0))),
        side('GL balance of linked accounts (debit - credit)', 'journal_lines, bank_accounts.glAccountId', linked.length ? glBalance(totals, [...new Set(linked.map((b) => b.glAccountId!))], 'DEBIT') : null),
        { note: unlinked ? `${unlinked} active bank account(s) have no glAccountId and are not compared. Opening balances may not be in the journal.` : 'Opening balances may not be in the journal.' });
    });

    await safe('outbox', 'No failed or stuck accounting outbox events', async () => {
      const staleBefore = new Date(Date.now() - 60 * 60 * 1000);
      const [failed, stuck] = await Promise.all([
        this.prisma.accountingOutboxEvent.count({ where: { tenantId, status: 'FAILED' } }),
        this.prisma.accountingOutboxEvent.count({ where: { tenantId, status: { in: ['PENDING', 'PROCESSING'] }, createdAt: { lt: staleBefore } } }),
      ]);
      return compareSources('outbox', 'No failed or stuck accounting outbox events',
        side('FAILED + PENDING/PROCESSING older than 1h', 'accounting_outbox_events', failed + stuck),
        side('Expected', 'rule', 0), { note: `failed=${failed}, stuck=${stuck}. Retry from the accounting UI; nothing is changed here.` });
    });

    await safe('sales_unposted', 'Every completed sale has a journal entry', async () => {
      const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM sales s
        WHERE s."tenantId" = ${tenantId} AND s.status::text IN ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED')
          ${filters.branchId ? Prisma.sql`AND s."branchId" = ${filters.branchId}` : Prisma.empty}
          ${dateFrom ? Prisma.sql`AND s."createdAt" >= ${dateFrom}` : Prisma.empty}
          ${dateTo ? Prisma.sql`AND s."createdAt" <= ${dateTo}` : Prisma.empty}
          AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je."tenantId" = s."tenantId" AND je."referenceType" = 'SALE'
                          AND je."referenceId" = s.id AND je.status::text <> 'VOID')`;
      return compareSources('sales_unposted', 'Every completed sale has a journal entry',
        side('Sales without a SALE journal', 'sales vs journal_entries', Number(rows[0]?.n ?? 0)),
        side('Expected', 'rule', 0), { note: 'Includes sales still queued in the outbox or posted before auto-post was enabled.' });
    });

    await safe('duplicate_journals', 'No duplicate non-void journals per source document', async () => {
      const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM (
          SELECT "referenceType", "referenceId"
          FROM journal_entries
          WHERE "tenantId" = ${tenantId}
            AND status::text <> 'VOID'
            AND "referenceType" IS NOT NULL AND "referenceId" IS NOT NULL
          GROUP BY "referenceType", "referenceId"
          HAVING COUNT(*) > 1
        ) duplicates`;
      return compareSources('duplicate_journals', 'No duplicate non-void journals per source document',
        side('Duplicate source references', 'journal_entries grouped by reference', Number(rows[0]?.n ?? 0)),
        side('Expected', 'rule', 0),
        { note: 'Duplicates are reported only; posted journals are never deleted or voided automatically.' });
    });

    await safe('missing_postings', 'Tracked operational documents have journal postings', async () => {
      const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT SUM(missing)::bigint AS n FROM (
          SELECT COUNT(*)::bigint AS missing FROM sales s
            WHERE s."tenantId" = ${tenantId} AND s.status::text IN ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED')
              AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."tenantId" = s."tenantId" AND j."referenceType" = 'SALE' AND j."referenceId" = s.id AND j.status::text <> 'VOID')
          UNION ALL
          SELECT COUNT(*)::bigint FROM goods_receipts g
            WHERE g."tenantId" = ${tenantId} AND g.status::text = 'POSTED'
              AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."tenantId" = g."tenantId" AND j."referenceType" = 'GRN' AND j."referenceId" = g.id AND j.status::text <> 'VOID')
          UNION ALL
          SELECT COUNT(*)::bigint FROM expenses e
            WHERE e."tenantId" = ${tenantId}
              AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."tenantId" = e."tenantId" AND j."referenceType" = 'EXPENSE' AND j."referenceId" = e.id AND j.status::text <> 'VOID')
        ) missing_counts`;
      return compareSources('missing_postings', 'Tracked operational documents have journal postings',
        side('Documents without a non-void journal', 'sales, goods_receipts, expenses vs journal_entries', Number(rows[0]?.n ?? 0)),
        side('Expected', 'rule', 0),
        { note: 'Missing postings remain queued for review; this report does not enqueue or post anything.' });
    });

    checks.push(
      notChecked('sales_tenders', 'Sales per tender (cash/bank/card/QR/wallet/credit), change, tax, discount = journal',
        side('Sales by tender, tax, discount', 'sales, sale_payments', null), side('Tender / VAT / revenue lines of SALE journals', 'journal_lines', null),
        'DECISION FOR THE USER: how change given, discounts and the QR fee are represented in the SALE journal decides the comparison rule. Per-tender totals are not compared until that is confirmed.'),
      notChecked('cash_register', 'Cash register expected cash = cash GL',
        side('Expected cash of open/closed shifts', 'cash register / shifts', null), side('GL cash (1100) and cashier wallet (1105)', 'journal_lines', null),
        'DECISION FOR THE USER: cash is split between the till, the cashier wallet (1105) and the safe; which of them the register total must equal is not defined.'),
    );

    const filteredChecks = filters.status ? checks.filter((check) => check.status === filters.status as ReconStatus) : checks;
    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      readOnly: true,
      tolerance: 0.01,
      filters: { branchId: filters.branchId ?? null, dateFrom: filters.dateFrom ?? null, dateTo: filters.dateTo ?? null, status: filters.status ?? null },
      summary: summarizeChecks(filteredChecks),
      checks: filteredChecks.map((check) => hasDateScope && ['trial_balance', 'account_drift'].includes(check.key)
        ? { ...check, note: `${check.note ? `${check.note} ` : ''}These checks use current account balances and are not period-scoped.` }
        : check),
    };
  }
}
