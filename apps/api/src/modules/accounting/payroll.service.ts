import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayrollComponentType,
  PayrollEntryStatus,
  PayrollRunStatus,
  RoleType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { JournalEntriesService } from './journal-entries.service';
import {
  calculatePayroll,
  DEFAULT_PAYROLL_COMPONENTS,
  payslipNumber,
  periodLabel,
  roundMoney,
  summarizeRun,
} from './payroll.helper';
import * as dayjs from 'dayjs';

const SYSTEM_ROLES = [RoleType.TENANT_ADMIN];

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalEntriesService,
  ) {}

  // ── Settings ───────────────────────────────────────────────────────

  async getSettings(tenantId: string) {
    let s = await this.prisma.payrollSetting.findUnique({ where: { tenantId } });
    if (!s) {
      s = await this.prisma.payrollSetting.create({ data: { tenantId } });
    }
    return s;
  }

  async updateSettings(
    tenantId: string,
    dto: {
      epfEmployeeRate?: number;
      epfEmployerRate?: number;
      etfEmployerRate?: number;
      epfWageCap?: number | null;
      salaryExpenseGlId?: string | null;
      epfExpenseGlId?: string | null;
      etfExpenseGlId?: string | null;
      epfPayableGlId?: string | null;
      etfPayableGlId?: string | null;
      bankGlId?: string | null;
    },
  ) {
    await this.getSettings(tenantId);
    return this.prisma.payrollSetting.update({
      where: { tenantId },
      data: {
        ...(dto.epfEmployeeRate != null ? { epfEmployeeRate: dto.epfEmployeeRate } : {}),
        ...(dto.epfEmployerRate != null ? { epfEmployerRate: dto.epfEmployerRate } : {}),
        ...(dto.etfEmployerRate != null ? { etfEmployerRate: dto.etfEmployerRate } : {}),
        ...(dto.epfWageCap !== undefined ? { epfWageCap: dto.epfWageCap } : {}),
        ...(dto.salaryExpenseGlId !== undefined ? { salaryExpenseGlId: dto.salaryExpenseGlId } : {}),
        ...(dto.epfExpenseGlId !== undefined ? { epfExpenseGlId: dto.epfExpenseGlId } : {}),
        ...(dto.etfExpenseGlId !== undefined ? { etfExpenseGlId: dto.etfExpenseGlId } : {}),
        ...(dto.epfPayableGlId !== undefined ? { epfPayableGlId: dto.epfPayableGlId } : {}),
        ...(dto.etfPayableGlId !== undefined ? { etfPayableGlId: dto.etfPayableGlId } : {}),
        ...(dto.bankGlId !== undefined ? { bankGlId: dto.bankGlId } : {}),
      },
    });
  }

  // ── Components (allowances / deductions) ───────────────────────────

  async listComponents(tenantId: string, type?: PayrollComponentType) {
    return this.prisma.payrollComponent.findMany({
      where: { tenantId, isActive: true, ...(type ? { type } : {}) },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
  }

  async seedComponents(tenantId: string) {
    let created = 0;
    for (const c of DEFAULT_PAYROLL_COMPONENTS) {
      const exists = await this.prisma.payrollComponent.findFirst({
        where: { tenantId, code: c.code },
      });
      if (exists) continue;
      await this.prisma.payrollComponent.create({
        data: {
          tenantId,
          code: c.code,
          name: c.name,
          type: c.type as PayrollComponentType,
          isEpfApplicable: c.isEpfApplicable,
          defaultAmount: c.defaultAmount,
        },
      });
      created += 1;
    }
    return { created, message: created ? `Created ${created} components` : 'Components already seeded' };
  }

  async createComponent(
    tenantId: string,
    dto: {
      code: string;
      name: string;
      type: PayrollComponentType;
      isEpfApplicable?: boolean;
      isPercent?: boolean;
      defaultAmount?: number;
      percentOfBasic?: number;
    },
  ) {
    const code = dto.code.trim().toUpperCase();
    if (!code || !dto.name?.trim()) throw new BadRequestException('Code and name required');
    return this.prisma.payrollComponent.create({
      data: {
        tenantId,
        code,
        name: dto.name.trim(),
        type: dto.type,
        isEpfApplicable: dto.isEpfApplicable ?? dto.type === PayrollComponentType.ALLOWANCE,
        isPercent: !!dto.isPercent,
        defaultAmount: dto.defaultAmount ?? 0,
        percentOfBasic: dto.percentOfBasic,
      },
    });
  }

  // ── Dashboard ──────────────────────────────────────────────────────

  async getDashboard(tenantId: string, month?: number, year?: number) {
    const now = new Date();
    const m = month ?? now.getMonth() + 1;
    const y = year ?? now.getFullYear();
    const settings = await this.getSettings(tenantId);
    const employees = await this.prisma.employee.count({ where: { tenantId, isActive: true } });
    const run = await this.prisma.payrollRun.findUnique({
      where: { tenantId_month_year: { tenantId, month: m, year: y } },
    });
    const entries = await this.prisma.payroll.findMany({
      where: { tenantId, month: m, year: y },
    });
    const paid = entries.filter((e) => e.isPaid).length;
    const recentPayslips = await this.prisma.payslip.findMany({
      where: { tenantId },
      orderBy: { issuedAt: 'desc' },
      take: 8,
      include: {
        employee: { select: { firstName: true, lastName: true, code: true } },
      },
    });

    return {
      period: { month: m, year: y, label: periodLabel(y, m) },
      settings: {
        epfEmployeeRate: settings.epfEmployeeRate,
        epfEmployerRate: settings.epfEmployerRate,
        etfEmployerRate: settings.etfEmployerRate,
      },
      activeEmployees: employees,
      run,
      entryCount: entries.length,
      paidCount: paid,
      unpaidCount: entries.length - paid,
      totals: summarizeRun(
        entries.map((e) => ({
          grossSalary: e.grossSalary || e.basicSalary + e.allowances + e.bonus + e.commission,
          allowances: e.allowances,
          deductions: e.deductions,
          epfEmployee: e.epfEmployee,
          epfEmployer: e.epfEmployer,
          etfEmployer: e.etfEmployer,
          netSalary: e.netSalary,
        })),
      ),
      recentPayslips,
    };
  }

  // ── Salary processing (runs) ───────────────────────────────────────

  async listRuns(tenantId: string) {
    return this.prisma.payrollRun.findMany({
      where: { tenantId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 24,
    });
  }

  async getRun(id: string, tenantId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, tenantId },
      include: {
        entries: {
          include: {
            employee: {
              select: {
                id: true,
                code: true,
                firstName: true,
                lastName: true,
                designation: true,
                epfNumber: true,
                etfNumber: true,
              },
            },
            lines: true,
            payslip: true,
          },
          orderBy: { employee: { firstName: 'asc' } },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  async processRun(
    tenantId: string,
    userId: string,
    dto: {
      month: number;
      year: number;
      employeeIds?: string[];
      bonus?: number;
      commissionByEmployee?: Record<string, number>;
      linesByEmployee?: Record<
        string,
        Array<{ code: string; name: string; type: 'ALLOWANCE' | 'DEDUCTION'; amount: number; isEpfApplicable?: boolean }>
      >;
      notes?: string;
    },
  ) {
    if (dto.month < 1 || dto.month > 12) throw new BadRequestException('Invalid month');
    const settings = await this.getSettings(tenantId);
    const label = periodLabel(dto.year, dto.month);

    let run = await this.prisma.payrollRun.findUnique({
      where: { tenantId_month_year: { tenantId, month: dto.month, year: dto.year } },
    });
    if (run?.status === PayrollRunStatus.PAID) {
      throw new BadRequestException('Payroll run already paid');
    }
    if (!run) {
      run = await this.prisma.payrollRun.create({
        data: {
          tenantId,
          month: dto.month,
          year: dto.year,
          periodLabel: label,
          status: PayrollRunStatus.DRAFT,
          notes: dto.notes,
          createdBy: userId,
        },
      });
    } else if (run.status === PayrollRunStatus.CANCELLED) {
      run = await this.prisma.payrollRun.update({
        where: { id: run.id },
        data: { status: PayrollRunStatus.DRAFT, notes: dto.notes },
      });
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(dto.employeeIds?.length ? { id: { in: dto.employeeIds } } : {}),
      },
      orderBy: { firstName: 'asc' },
    });
    if (!employees.length) throw new BadRequestException('No active employees to process');

    const components = await this.listComponents(tenantId);
    const results = [];

    for (const emp of employees) {
      const customLines = dto.linesByEmployee?.[emp.id];
      const lines =
        customLines ??
        components.map((c) => ({
          code: c.code,
          name: c.name,
          type: c.type as 'ALLOWANCE' | 'DEDUCTION',
          amount: c.isPercent && c.percentOfBasic
            ? roundMoney(emp.basicSalary * (c.percentOfBasic / 100))
            : c.defaultAmount,
          isEpfApplicable: c.isEpfApplicable,
        }));

      const calc = calculatePayroll({
        basicSalary: emp.basicSalary,
        bonus: dto.bonus ?? 0,
        commission: dto.commissionByEmployee?.[emp.id] ?? 0,
        allowanceLines: lines
          .filter((l) => l.type === 'ALLOWANCE')
          .map((l) => ({ amount: l.amount, isEpfApplicable: l.isEpfApplicable })),
        deductionLines: lines
          .filter((l) => l.type === 'DEDUCTION')
          .map((l) => ({ amount: l.amount })),
        epfEmployeeRate: settings.epfEmployeeRate,
        epfEmployerRate: settings.epfEmployerRate,
        etfEmployerRate: settings.etfEmployerRate,
        epfWageCap: settings.epfWageCap,
      });

      const existing = await this.prisma.payroll.findUnique({
        where: {
          employeeId_month_year: { employeeId: emp.id, month: dto.month, year: dto.year },
        },
      });
      if (existing?.isPaid) {
        results.push(existing);
        continue;
      }

      const entry = await this.prisma.payroll.upsert({
        where: {
          employeeId_month_year: { employeeId: emp.id, month: dto.month, year: dto.year },
        },
        create: {
          tenantId,
          employeeId: emp.id,
          payrollRunId: run.id,
          month: dto.month,
          year: dto.year,
          basicSalary: calc.basicSalary,
          allowances: calc.allowances,
          deductions: calc.deductions,
          bonus: calc.bonus,
          commission: calc.commission,
          grossSalary: calc.grossSalary,
          epfWage: calc.epfWage,
          epfEmployee: calc.epfEmployee,
          epfEmployer: calc.epfEmployer,
          etfEmployer: calc.etfEmployer,
          netSalary: calc.netSalary,
          status: PayrollEntryStatus.CALCULATED,
        },
        update: {
          payrollRunId: run.id,
          basicSalary: calc.basicSalary,
          allowances: calc.allowances,
          deductions: calc.deductions,
          bonus: calc.bonus,
          commission: calc.commission,
          grossSalary: calc.grossSalary,
          epfWage: calc.epfWage,
          epfEmployee: calc.epfEmployee,
          epfEmployer: calc.epfEmployer,
          etfEmployer: calc.etfEmployer,
          netSalary: calc.netSalary,
          status: PayrollEntryStatus.CALCULATED,
        },
      });

      await this.prisma.payrollLine.deleteMany({ where: { payrollId: entry.id } });
      if (lines.length) {
        await this.prisma.payrollLine.createMany({
          data: lines
            .filter((l) => l.amount > 0)
            .map((l) => ({
              payrollId: entry.id,
              type: l.type as PayrollComponentType,
              code: l.code,
              name: l.name,
              amount: roundMoney(l.amount),
            })),
        });
      }

      results.push(entry);
    }

    const totals = summarizeRun(
      results.map((e) => ({
        grossSalary: e.grossSalary,
        allowances: e.allowances,
        deductions: e.deductions,
        epfEmployee: e.epfEmployee,
        epfEmployer: e.epfEmployer,
        etfEmployer: e.etfEmployer,
        netSalary: e.netSalary,
      })),
    );

    const updated = await this.prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: PayrollRunStatus.CALCULATED,
        ...totals,
        notes: dto.notes ?? run.notes,
      },
    });

    return this.getRun(updated.id, tenantId);
  }

  async approveRun(id: string, tenantId: string) {
    const run = await this.getRun(id, tenantId);
    if (run.status !== PayrollRunStatus.CALCULATED && run.status !== PayrollRunStatus.DRAFT) {
      throw new BadRequestException('Only calculated runs can be approved');
    }
    return this.prisma.payrollRun.update({
      where: { id },
      data: { status: PayrollRunStatus.APPROVED, approvedAt: new Date() },
    });
  }

  async payRun(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    runId: string,
    dto?: { postToGl?: boolean; paymentMethod?: string },
  ) {
    const run = await this.getRun(runId, tenantId);
    if (run.status === PayrollRunStatus.PAID) {
      throw new BadRequestException('Run already paid');
    }
    if (run.status !== PayrollRunStatus.APPROVED && run.status !== PayrollRunStatus.CALCULATED) {
      throw new BadRequestException('Run must be calculated or approved before payment');
    }

    const unpaid = run.entries.filter((e) => !e.isPaid);
    if (!unpaid.length) throw new BadRequestException('No unpaid entries in run');

    let journalEntryId: string | undefined;
    if (dto?.postToGl !== false) {
      journalEntryId = await this.postPayrollJournal(
        tenantId,
        branchId,
        userId,
        run,
        unpaid,
      );
    }

    const paidAt = new Date();
    let seq = await this.prisma.payslip.count({
      where: { tenantId, periodLabel: run.periodLabel },
    });

    for (const entry of unpaid) {
      seq += 1;
      const slipNo = payslipNumber(run.year, run.month, seq);
      const emp = entry.employee;

      await this.prisma.payroll.update({
        where: { id: entry.id },
        data: {
          isPaid: true,
          paidAt,
          paymentMethod: dto?.paymentMethod ?? 'BANK_TRANSFER',
          status: PayrollEntryStatus.PAID,
          journalEntryId,
          payslipNumber: slipNo,
        },
      });

      const snapshot = {
        payslipNumber: slipNo,
        periodLabel: run.periodLabel,
        employee: {
          id: emp.id,
          code: emp.code,
          name: `${emp.firstName} ${emp.lastName}`.trim(),
          designation: emp.designation,
          epfNumber: emp.epfNumber,
          etfNumber: emp.etfNumber,
        },
        earnings: {
          basicSalary: entry.basicSalary,
          allowances: entry.allowances,
          bonus: entry.bonus,
          commission: entry.commission,
          grossSalary: entry.grossSalary,
        },
        deductions: {
          other: entry.deductions,
          epfEmployee: entry.epfEmployee,
          total: roundMoney(entry.deductions + entry.epfEmployee),
        },
        employer: {
          epfEmployer: entry.epfEmployer,
          etfEmployer: entry.etfEmployer,
        },
        epfWage: entry.epfWage,
        netSalary: entry.netSalary,
        lines: entry.lines,
        paidAt: paidAt.toISOString(),
      };

      await this.prisma.payslip.upsert({
        where: { payrollId: entry.id },
        create: {
          tenantId,
          payrollId: entry.id,
          employeeId: entry.employeeId,
          payslipNumber: slipNo,
          periodLabel: run.periodLabel,
          snapshot,
        },
        update: {
          payslipNumber: slipNo,
          snapshot,
          issuedAt: paidAt,
        },
      });
    }

    return this.prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: PayrollRunStatus.PAID,
        paidAt,
        journalEntryId,
      },
      include: {
        entries: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, code: true } },
            payslip: true,
          },
        },
      },
    });
  }

  private async postPayrollJournal(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    run: { id: string; periodLabel: string; year: number; month: number },
    entries: Array<{
      grossSalary: number;
      epfEmployee: number;
      epfEmployer: number;
      etfEmployer: number;
      netSalary: number;
    }>,
  ): Promise<string | undefined> {
    const settings = await this.getSettings(tenantId);
    const totals = summarizeRun(
      entries.map((e) => ({
        grossSalary: e.grossSalary,
        allowances: 0,
        deductions: 0,
        epfEmployee: e.epfEmployee,
        epfEmployer: e.epfEmployer,
        etfEmployer: e.etfEmployer,
        netSalary: e.netSalary,
      })),
    );

    const salaryGl =
      settings.salaryExpenseGlId ?? (await this.resolveGl(tenantId, ['5300', '5000']));
    const epfExpGl =
      settings.epfExpenseGlId ?? (await this.resolveGl(tenantId, ['5310', '5300']));
    const etfExpGl =
      settings.etfExpenseGlId ?? (await this.resolveGl(tenantId, ['5320', '5300']));
    const epfPayGl =
      settings.epfPayableGlId ?? (await this.resolveGl(tenantId, ['2310', '2300']));
    const etfPayGl =
      settings.etfPayableGlId ?? (await this.resolveGl(tenantId, ['2320', '2300']));
    const bankGl =
      settings.bankGlId ?? (await this.resolveGl(tenantId, ['1200', '1100']));

    if (!salaryGl || !bankGl || !epfPayGl || !etfPayGl) {
      throw new BadRequestException(
        'Missing payroll GL accounts (need 5300, 2310, 2320, 1200). Seed CoA or set payroll settings.',
      );
    }

    const glLines: Array<{ accountId: string; side: 'DEBIT' | 'CREDIT'; amount: number; description?: string }> = [];
    if (totals.totalGross > 0) {
      glLines.push({
        accountId: salaryGl,
        side: 'DEBIT',
        amount: totals.totalGross,
        description: 'Gross salaries',
      });
    }
    if (totals.totalEpfEmployer > 0 && epfExpGl) {
      glLines.push({
        accountId: epfExpGl,
        side: 'DEBIT',
        amount: totals.totalEpfEmployer,
        description: 'EPF employer',
      });
    }
    if (totals.totalEtf > 0 && etfExpGl) {
      glLines.push({
        accountId: etfExpGl,
        side: 'DEBIT',
        amount: totals.totalEtf,
        description: 'ETF employer',
      });
    }

    const epfPayable = roundMoney(totals.totalEpfEmployee + totals.totalEpfEmployer);
    if (epfPayable > 0) {
      glLines.push({
        accountId: epfPayGl,
        side: 'CREDIT',
        amount: epfPayable,
        description: 'EPF payable',
      });
    }
    if (totals.totalEtf > 0) {
      glLines.push({
        accountId: etfPayGl,
        side: 'CREDIT',
        amount: totals.totalEtf,
        description: 'ETF payable',
      });
    }
    if (totals.totalNet > 0) {
      glLines.push({
        accountId: bankGl,
        side: 'CREDIT',
        amount: totals.totalNet,
        description: 'Net salaries paid',
      });
    }

    if (glLines.length < 2) return undefined;

    const je = await this.journals.create(tenantId, branchId ?? '', userId, SYSTEM_ROLES, {
      description: `Payroll ${run.periodLabel}`,
      date: dayjs(`${run.year}-${String(run.month).padStart(2, '0')}-28`).format('YYYY-MM-DD'),
      referenceType: 'PAYROLL_RUN',
      referenceId: run.id,
      action: 'POST',
      glLines,
    });
    return je.id;
  }

  // ── Payslips ───────────────────────────────────────────────────────

  async listPayslips(tenantId: string, periodLabel?: string, employeeId?: string) {
    return this.prisma.payslip.findMany({
      where: {
        tenantId,
        ...(periodLabel ? { periodLabel } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      orderBy: { issuedAt: 'desc' },
      take: 100,
      include: {
        employee: {
          select: { id: true, code: true, firstName: true, lastName: true, designation: true },
        },
        payroll: true,
      },
    });
  }

  async getPayslip(id: string, tenantId: string) {
    const slip = await this.prisma.payslip.findFirst({
      where: { id, tenantId },
      include: {
        employee: true,
        payroll: { include: { lines: true } },
      },
    });
    if (!slip) throw new NotFoundException('Payslip not found');
    return slip;
  }

  async updateEmployeeStatutory(
    tenantId: string,
    employeeId: string,
    dto: { epfNumber?: string | null; etfNumber?: string | null; nicNumber?: string | null; basicSalary?: number },
  ) {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
    if (!emp) throw new NotFoundException('Employee not found');
    return this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(dto.epfNumber !== undefined ? { epfNumber: dto.epfNumber } : {}),
        ...(dto.etfNumber !== undefined ? { etfNumber: dto.etfNumber } : {}),
        ...(dto.nicNumber !== undefined ? { nicNumber: dto.nicNumber } : {}),
        ...(dto.basicSalary != null ? { basicSalary: dto.basicSalary } : {}),
      },
    });
  }

  private async resolveGl(tenantId: string, codes: string[]): Promise<string | null> {
    const a = await this.prisma.account.findFirst({
      where: { tenantId, isActive: true, code: { in: codes } },
      orderBy: { code: 'asc' },
    });
    return a?.id ?? null;
  }
}
