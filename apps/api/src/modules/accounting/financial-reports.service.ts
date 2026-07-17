import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { AccountType, JournalEntryStatus, JournalEntryType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { TaxService } from './tax.service';
import { FinanceService } from './finance.service';
import { CustomerCreditService } from '@/modules/customers/customer-credit.service';
import { SupplierApService } from '@/modules/suppliers/supplier-ap.service';
import {
  buildBalanceSheet,
  buildProfitLoss,
  buildTrialBalance,
  classifyCashFlowMovement,
  isReportType,
  periodNet,
  ReportType,
  roundMoney,
  summarizeCashFlowBuckets,
} from './financial-reports.helper';
import * as dayjs from 'dayjs';
import { PassThrough } from 'stream';
// CommonJS-friendly imports (no esModuleInterop)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJS = require('exceljs') as typeof import('exceljs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

@Injectable()
export class FinancialReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxService: TaxService,
    private readonly financeService: FinanceService,
    private readonly customerCredit: CustomerCreditService,
    private readonly supplierAp: SupplierApService,
  ) {}

  async generate(
    tenantId: string,
    type: string,
    opts: {
      startDate?: string;
      endDate?: string;
      accountId?: string;
      customerId?: string;
      supplierId?: string;
      branchId?: string;
    } = {},
  ) {
    if (!isReportType(type)) throw new BadRequestException(`Unknown report type: ${type}`);
    const start = opts.startDate ?? dayjs().startOf('month').format('YYYY-MM-DD');
    const end = opts.endDate ?? dayjs().format('YYYY-MM-DD');

    switch (type as ReportType) {
      case 'trial-balance':
        return this.trialBalance(tenantId);
      case 'profit-loss':
        return this.profitLoss(tenantId, start, end);
      case 'balance-sheet':
        return this.balanceSheet(tenantId);
      case 'cash-flow':
        return this.cashFlow(tenantId, start, end);
      case 'general-ledger':
        return this.generalLedger(tenantId, start, end, opts.accountId);
      case 'customer-statement':
        if (!opts.customerId) throw new BadRequestException('customerId required');
        return this.customerStatement(tenantId, opts.customerId, start, end);
      case 'supplier-statement':
        if (!opts.supplierId) throw new BadRequestException('supplierId required');
        return this.supplierStatement(tenantId, opts.supplierId, start, end);
      case 'vat':
        return {
          reportType: 'vat',
          generatedAt: new Date().toISOString(),
          ...(await this.taxService.getVatReport(tenantId, start, end, opts.branchId)),
        };
      default:
        throw new BadRequestException('Unsupported report');
    }
  }

  async export(
    tenantId: string,
    type: string,
    format: 'xlsx' | 'pdf',
    opts: {
      startDate?: string;
      endDate?: string;
      accountId?: string;
      customerId?: string;
      supplierId?: string;
      branchId?: string;
    } = {},
  ): Promise<{ file: StreamableFile; filename: string; contentType: string }> {
    const data = await this.generate(tenantId, type, opts);
    const title = this.reportTitle(type);
    const stamp = dayjs().format('YYYYMMDD');
    if (format === 'xlsx') {
      const buf = await this.toExcel(title, type, data);
      return {
        file: new StreamableFile(buf),
        filename: `${type}-${stamp}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    const buf = await this.toPdf(title, type, data);
    return {
      file: new StreamableFile(buf),
      filename: `${type}-${stamp}.pdf`,
      contentType: 'application/pdf',
    };
  }

  // ── Reports ────────────────────────────────────────────────────────

  async trialBalance(tenantId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      select: { code: true, name: true, type: true, balance: true },
      orderBy: { code: 'asc' },
    });
    const tb = buildTrialBalance(accounts);
    return {
      reportType: 'trial-balance',
      generatedAt: new Date().toISOString(),
      ...tb,
    };
  }

  async profitLoss(tenantId: string, startDate: string, endDate: string) {
    const movements = await this.periodMovements(tenantId, startDate, endDate);
    const byAccount = new Map<string, { code: string; name: string; type: AccountType; debit: number; credit: number }>();
    for (const m of movements) {
      const cur = byAccount.get(m.accountId) ?? {
        code: m.code,
        name: m.name,
        type: m.type,
        debit: 0,
        credit: 0,
      };
      cur.debit = roundMoney(cur.debit + m.debit);
      cur.credit = roundMoney(cur.credit + m.credit);
      byAccount.set(m.accountId, cur);
    }

    const revenueLines = [...byAccount.values()]
      .filter((a) => a.type === AccountType.REVENUE)
      .map((a) => ({
        code: a.code,
        name: a.name,
        amount: periodNet(a.type, a.debit, a.credit),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const expenseLines = [...byAccount.values()]
      .filter((a) => a.type === AccountType.EXPENSE)
      .map((a) => ({
        code: a.code,
        name: a.name,
        amount: periodNet(a.type, a.debit, a.credit),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const gl = buildProfitLoss(revenueLines, expenseLines);

    // Operational fallback/supplement when GL has no activity
    let operational: Awaited<ReturnType<FinanceService['getEnhancedProfitLoss']>> | null = null;
    try {
      operational = await this.financeService.getEnhancedProfitLoss(tenantId, startDate, endDate);
    } catch {
      operational = null;
    }

    return {
      reportType: 'profit-loss',
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      source: gl.revenue.total || gl.expenses.total ? 'general-ledger' : 'operational',
      ...gl,
      operational,
    };
  }

  async balanceSheet(tenantId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      select: { code: true, name: true, type: true, balance: true },
      orderBy: { code: 'asc' },
    });
    const bs = buildBalanceSheet(accounts);
    return {
      reportType: 'balance-sheet',
      asOf: dayjs().format('YYYY-MM-DD'),
      generatedAt: new Date().toISOString(),
      ...bs,
    };
  }

  async cashFlow(tenantId: string, startDate: string, endDate: string) {
    const from = dayjs(startDate).startOf('day').toDate();
    const to = dayjs(endDate).endOf('day').toDate();

    const cashAccounts = await this.prisma.account.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { code: { in: ['1100', '1110', '1200', '1001'] } },
          { name: { contains: 'Cash', mode: 'insensitive' } },
          { name: { contains: 'Bank', mode: 'insensitive' } },
        ],
      },
      select: { id: true, code: true, name: true },
    });
    const cashIds = new Set(cashAccounts.map((a) => a.id));

    const lines = await this.prisma.journalLine.findMany({
      where: {
        journalEntry: {
          tenantId,
          status: JournalEntryStatus.POSTED,
          date: { gte: from, lte: to },
        },
        OR: [
          { debitAccountId: { in: [...cashIds] } },
          { creditAccountId: { in: [...cashIds] } },
        ],
      },
      include: {
        journalEntry: { select: { date: true, referenceType: true, entryNumber: true, description: true } },
        debitAccount: { select: { id: true, code: true } },
        creditAccount: { select: { id: true, code: true } },
      },
      orderBy: { journalEntry: { date: 'asc' } },
    });

    const bucketItems: Array<{ bucket: 'operating' | 'investing' | 'financing'; amount: number }> = [];
    const daily: Record<string, { date: string; inflow: number; outflow: number }> = {};

    for (const line of lines) {
      const isCashDebit = line.debitAccountId && cashIds.has(line.debitAccountId);
      const isCashCredit = line.creditAccountId && cashIds.has(line.creditAccountId);
      if (!isCashDebit && !isCashCredit) continue;

      // Debit cash = inflow; credit cash = outflow
      const signed = isCashDebit ? line.amount : -line.amount;
      const contraCode = isCashDebit
        ? line.creditAccount?.code
        : line.debitAccount?.code;
      const bucket = classifyCashFlowMovement({
        referenceType: line.journalEntry.referenceType,
        accountCode: contraCode,
        signedAmount: signed,
      });
      bucketItems.push({ bucket, amount: signed });

      const key = dayjs(line.journalEntry.date).format('YYYY-MM-DD');
      if (!daily[key]) daily[key] = { date: key, inflow: 0, outflow: 0 };
      if (signed >= 0) daily[key].inflow = roundMoney(daily[key].inflow + signed);
      else daily[key].outflow = roundMoney(daily[key].outflow + Math.abs(signed));
    }

    const buckets = summarizeCashFlowBuckets(bucketItems);
    const opsDaily = await this.operationalCashFlow(tenantId, startDate, endDate);

    const glDaily = Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));
    const useGl = glDaily.length > 0;

    return {
      reportType: 'cash-flow',
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      source: useGl ? 'general-ledger' : 'operational',
      buckets,
      data: useGl ? glDaily : opsDaily.data,
      totalInflow: useGl
        ? roundMoney(glDaily.reduce((s, d) => s + d.inflow, 0))
        : opsDaily.totalInflow,
      totalOutflow: useGl
        ? roundMoney(glDaily.reduce((s, d) => s + d.outflow, 0))
        : opsDaily.totalOutflow,
      operational: opsDaily,
      cashAccounts: cashAccounts.map((a) => ({ code: a.code, name: a.name })),
    };
  }

  async generalLedger(
    tenantId: string,
    startDate: string,
    endDate: string,
    accountId?: string,
  ) {
    const from = dayjs(startDate).startOf('day').toDate();
    const to = dayjs(endDate).endOf('day').toDate();

    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(accountId ? { id: accountId } : {}),
      },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, type: true, balance: true },
    });
    if (accountId && !accounts.length) throw new NotFoundException('Account not found');

    const accountIds = accounts.map((a) => a.id);
    const lines = await this.prisma.journalLine.findMany({
      where: {
        journalEntry: {
          tenantId,
          status: JournalEntryStatus.POSTED,
          date: { gte: from, lte: to },
        },
        OR: [
          { debitAccountId: { in: accountIds } },
          { creditAccountId: { in: accountIds } },
        ],
      },
      include: {
        journalEntry: {
          select: { id: true, entryNumber: true, date: true, description: true, referenceType: true },
        },
      },
      orderBy: [{ journalEntry: { date: 'asc' } }, { journalEntry: { entryNumber: 'asc' } }],
    });

    // Opening = current balance − period net (approximate)
    const periodDebit = new Map<string, number>();
    const periodCredit = new Map<string, number>();
    type GlEntry = {
      date: string;
      entryNumber: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    };
    const byAccount = new Map<string, GlEntry[]>();

    for (const line of lines) {
      const acctId = line.type === JournalEntryType.DEBIT ? line.debitAccountId : line.creditAccountId;
      if (!acctId || !accountIds.includes(acctId)) continue;
      const debit = line.type === JournalEntryType.DEBIT ? line.amount : 0;
      const credit = line.type === JournalEntryType.CREDIT ? line.amount : 0;
      periodDebit.set(acctId, roundMoney((periodDebit.get(acctId) ?? 0) + debit));
      periodCredit.set(acctId, roundMoney((periodCredit.get(acctId) ?? 0) + credit));
      if (!byAccount.has(acctId)) byAccount.set(acctId, []);
      byAccount.get(acctId)!.push({
        date: dayjs(line.journalEntry.date).format('YYYY-MM-DD'),
        entryNumber: line.journalEntry.entryNumber,
        description: line.description || line.journalEntry.description,
        debit,
        credit,
        balance: 0, // filled below
      });
    }

    const ledgers = accounts.map((acct) => {
      const d = periodDebit.get(acct.id) ?? 0;
      const c = periodCredit.get(acct.id) ?? 0;
      const net = periodNet(acct.type, d, c);
      const opening = roundMoney(acct.balance - net);
      let running = opening;
      const entries = (byAccount.get(acct.id) ?? []).map((e) => {
        if (acct.type === AccountType.ASSET || acct.type === AccountType.EXPENSE) {
          running = roundMoney(running + e.debit - e.credit);
        } else {
          running = roundMoney(running + e.credit - e.debit);
        }
        return { ...e, balance: running };
      });
      return {
        accountId: acct.id,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        openingBalance: opening,
        periodDebit: d,
        periodCredit: c,
        closingBalance: roundMoney(acct.balance),
        entries,
      };
    });

    return {
      reportType: 'general-ledger',
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      ledgers: accountId ? ledgers : ledgers.filter((l) => l.entries.length > 0 || Math.abs(l.closingBalance) > 0.004),
    };
  }

  async customerStatement(
    tenantId: string,
    customerId: string,
    startDate: string,
    endDate: string,
  ) {
    const data = await this.customerCredit.getCustomerStatement(
      customerId,
      tenantId,
      startDate,
      endDate,
    );
    return { reportType: 'customer-statement', ...data };
  }

  async supplierStatement(
    tenantId: string,
    supplierId: string,
    startDate: string,
    endDate: string,
  ) {
    const data = await this.supplierAp.getSupplierStatement(
      supplierId,
      tenantId,
      startDate,
      endDate,
    );
    return { reportType: 'supplier-statement', ...data };
  }

  // ── Internals ──────────────────────────────────────────────────────

  private async periodMovements(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{
    accountId: string;
    code: string;
    name: string;
    type: AccountType;
    debit: number;
    credit: number;
  }>> {
    const from = dayjs(startDate).startOf('day').toDate();
    const to = dayjs(endDate).endOf('day').toDate();
    const lines = await this.prisma.journalLine.findMany({
      where: {
        journalEntry: {
          tenantId,
          status: JournalEntryStatus.POSTED,
          date: { gte: from, lte: to },
        },
      },
      include: {
        debitAccount: { select: { id: true, code: true, name: true, type: true } },
        creditAccount: { select: { id: true, code: true, name: true, type: true } },
      },
    });

    const map = new Map<string, {
      accountId: string;
      code: string;
      name: string;
      type: AccountType;
      debit: number;
      credit: number;
    }>();

    const bump = (
      acct: { id: string; code: string; name: string; type: AccountType } | null,
      debit: number,
      credit: number,
    ) => {
      if (!acct) return;
      const cur = map.get(acct.id) ?? {
        accountId: acct.id,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        debit: 0,
        credit: 0,
      };
      cur.debit = roundMoney(cur.debit + debit);
      cur.credit = roundMoney(cur.credit + credit);
      map.set(acct.id, cur);
    };

    for (const line of lines) {
      if (line.type === JournalEntryType.DEBIT) {
        bump(line.debitAccount, line.amount, 0);
      } else {
        bump(line.creditAccount, 0, line.amount);
      }
    }
    return [...map.values()];
  }

  private async operationalCashFlow(tenantId: string, startDate: string, endDate: string) {
    // Mirror AccountingService.getCashFlow without circular dependency
    const { PaymentMethod } = await import('@prisma/client');
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const settled = ['APPROVED', 'COMPLETED', 'REFUND_PROCESSED'] as const;
    const [payments, creditPayments, expenses, refunds] = await Promise.all([
      this.prisma.salePayment.findMany({
        where: {
          sale: { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' } },
          method: { not: PaymentMethod.CUSTOMER_CREDIT },
        },
        select: { amount: true, sale: { select: { invoiceDate: true } } },
      }),
      this.prisma.customerCreditTransaction.findMany({
        where: { tenantId, type: 'PAYMENT', createdAt: dateRange },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.expense.findMany({
        where: { tenantId, date: dateRange },
        select: { amount: true, date: true },
      }),
      this.prisma.return.findMany({
        where: { tenantId, createdAt: dateRange, status: { in: [...settled] } },
        select: { refundAmount: true, createdAt: true },
      }),
    ]);
    const map: Record<string, { date: string; inflow: number; outflow: number }> = {};
    const bump = (key: string, field: 'inflow' | 'outflow', amt: number) => {
      if (!map[key]) map[key] = { date: key, inflow: 0, outflow: 0 };
      map[key][field] += amt;
    };
    for (const p of payments) bump(dayjs(p.sale.invoiceDate).format('YYYY-MM-DD'), 'inflow', p.amount);
    for (const cp of creditPayments) bump(dayjs(cp.createdAt).format('YYYY-MM-DD'), 'inflow', cp.amount);
    for (const e of expenses) bump(dayjs(e.date).format('YYYY-MM-DD'), 'outflow', e.amount);
    for (const r of refunds) bump(dayjs(r.createdAt).format('YYYY-MM-DD'), 'outflow', r.refundAmount);
    const data = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    return {
      data,
      totalInflow: roundMoney(
        payments.reduce((s, p) => s + p.amount, 0) + creditPayments.reduce((s, c) => s + c.amount, 0),
      ),
      totalOutflow: roundMoney(
        expenses.reduce((s, e) => s + e.amount, 0) + refunds.reduce((s, r) => s + r.refundAmount, 0),
      ),
    };
  }

  private reportTitle(type: string): string {
    const map: Record<string, string> = {
      'trial-balance': 'Trial Balance',
      'profit-loss': 'Profit & Loss',
      'balance-sheet': 'Balance Sheet',
      'cash-flow': 'Cash Flow Statement',
      'general-ledger': 'General Ledger',
      'customer-statement': 'Customer Statement',
      'supplier-statement': 'Supplier Statement',
      vat: 'VAT Report',
    };
    return map[type] ?? type;
  }

  private flattenForExport(type: string, data: Record<string, unknown>): Array<Record<string, unknown>> {
    if (type === 'trial-balance' && Array.isArray(data.rows)) {
      return data.rows as Array<Record<string, unknown>>;
    }
    if (type === 'profit-loss') {
      const rev = ((data.revenue as { lines?: Array<Record<string, unknown>> })?.lines ?? []).map((l) => ({
        section: 'Revenue',
        ...l,
      }));
      const exp = ((data.expenses as { lines?: Array<Record<string, unknown>> })?.lines ?? []).map((l) => ({
        section: 'Expense',
        ...l,
      }));
      return [...rev, ...exp, { section: 'Net', name: 'Net Profit', amount: data.netProfit }];
    }
    if (type === 'balance-sheet') {
      const rows: Array<Record<string, unknown>> = [];
      for (const [section, key] of [
        ['Assets', 'assets'],
        ['Liabilities', 'liabilities'],
        ['Equity', 'equity'],
      ] as const) {
        const sec = data[key] as { lines?: Array<Record<string, unknown>>; total?: number };
        for (const l of sec?.lines ?? []) rows.push({ section, ...l });
        rows.push({ section, code: '', name: `Total ${section}`, balance: sec?.total ?? 0 });
      }
      return rows;
    }
    if (type === 'cash-flow' && Array.isArray(data.data)) {
      return data.data as Array<Record<string, unknown>>;
    }
    if (type === 'general-ledger' && Array.isArray(data.ledgers)) {
      const rows: Array<Record<string, unknown>> = [];
      for (const led of data.ledgers as Array<{
        code: string;
        name: string;
        entries: Array<Record<string, unknown>>;
      }>) {
        for (const e of led.entries) {
          rows.push({ accountCode: led.code, accountName: led.name, ...e });
        }
      }
      return rows;
    }
    if (type === 'vat' && Array.isArray(data.outputByRate)) {
      return data.outputByRate as Array<Record<string, unknown>>;
    }
    if (Array.isArray((data as { entries?: unknown[] }).entries)) {
      return (data as { entries: Array<Record<string, unknown>> }).entries;
    }
    if (Array.isArray((data as { lines?: unknown[] }).lines)) {
      return (data as { lines: Array<Record<string, unknown>> }).lines;
    }
    return [{ summary: JSON.stringify(data) }];
  }

  private async toExcel(title: string, type: string, data: Record<string, unknown>): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Clothing Shop ERP';
    const ws = wb.addWorksheet(title.slice(0, 31));
    ws.addRow([title]);
    ws.addRow([`Generated: ${dayjs().format('YYYY-MM-DD HH:mm')}`]);
    ws.addRow([]);
    const rows = this.flattenForExport(type, data);
    if (rows.length) {
      const keys = Object.keys(rows[0]);
      ws.addRow(keys);
      for (const r of rows) {
        ws.addRow(keys.map((k) => r[k] ?? ''));
      }
    } else {
      ws.addRow(['No data']);
    }
    // Summary sheet for TB totals etc.
    if (type === 'trial-balance') {
      ws.addRow([]);
      ws.addRow(['Total Debit', data.totalDebit]);
      ws.addRow(['Total Credit', data.totalCredit]);
      ws.addRow(['Balanced', data.balanced ? 'Yes' : 'No']);
    }
    if (type === 'profit-loss') {
      ws.addRow([]);
      ws.addRow(['Net Profit', data.netProfit]);
    }
    if (type === 'cash-flow' && data.buckets) {
      const b = data.buckets as Record<string, number>;
      ws.addRow([]);
      ws.addRow(['Operating', b.operating]);
      ws.addRow(['Investing', b.investing]);
      ws.addRow(['Financing', b.financing]);
      ws.addRow(['Net Change', b.netChange]);
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  private async toPdf(title: string, type: string, data: Record<string, unknown>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
      doc.pipe(stream);

      doc.fontSize(16).text(title, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666').text(`Generated ${dayjs().format('YYYY-MM-DD HH:mm')}`, {
        align: 'center',
      });
      doc.fillColor('#000').moveDown();

      if (type === 'profit-loss') {
        doc.fontSize(11).text(`Net Profit: LKR ${roundMoney(Number(data.netProfit) || 0)}`);
        doc.moveDown(0.5);
      }
      if (type === 'trial-balance') {
        doc.fontSize(10).text(
          `Debits: ${data.totalDebit}   Credits: ${data.totalCredit}   Balanced: ${data.balanced ? 'Yes' : 'No'}`,
        );
        doc.moveDown(0.5);
      }
      if (type === 'vat') {
        doc.fontSize(10).text(
          `Output VAT: ${data.outputVat}  |  Input VAT: ${data.inputVat}  |  Net: ${data.netVat}`,
        );
        doc.moveDown(0.5);
      }

      const rows = this.flattenForExport(type, data).slice(0, 80);
      if (rows.length) {
        const keys = Object.keys(rows[0]).slice(0, 6);
        doc.fontSize(8).text(keys.join(' | '));
        doc.moveDown(0.3);
        for (const r of rows) {
          const line = keys.map((k) => String(r[k] ?? '')).join(' | ');
          doc.text(line.slice(0, 110));
        }
        if (this.flattenForExport(type, data).length > 80) {
          doc.moveDown().text('… truncated — use Excel for full export');
        }
      } else {
        doc.text('No detail rows');
      }

      doc.end();
    });
  }
}
