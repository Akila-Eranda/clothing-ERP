/** Sprint 10 — Payroll helpers (pure). Sri Lanka EPF/ETF defaults. */

export const DEFAULT_EPF_EMPLOYEE_RATE = 8;
export const DEFAULT_EPF_EMPLOYER_RATE = 12;
export const DEFAULT_ETF_EMPLOYER_RATE = 3;

export type PayrollCalcInput = {
  basicSalary: number;
  allowanceLines?: Array<{ amount: number; isEpfApplicable?: boolean }>;
  deductionLines?: Array<{ amount: number }>;
  bonus?: number;
  commission?: number;
  epfEmployeeRate?: number;
  epfEmployerRate?: number;
  etfEmployerRate?: number;
  epfWageCap?: number | null;
};

export type PayrollCalcResult = {
  basicSalary: number;
  allowances: number;
  deductions: number;
  bonus: number;
  commission: number;
  grossSalary: number;
  epfWage: number;
  epfEmployee: number;
  epfEmployer: number;
  etfEmployer: number;
  netSalary: number;
  employerCost: number;
};

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function periodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function payslipNumber(year: number, month: number, seq: number): string {
  return `PS-${year}${String(month).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
}

export function calculatePayroll(input: PayrollCalcInput): PayrollCalcResult {
  const basic = roundMoney(Math.max(0, input.basicSalary));
  const bonus = roundMoney(Math.max(0, input.bonus ?? 0));
  const commission = roundMoney(Math.max(0, input.commission ?? 0));
  const allowanceLines = input.allowanceLines ?? [];
  const deductionLines = input.deductionLines ?? [];

  const allowances = roundMoney(allowanceLines.reduce((s, l) => s + Math.max(0, l.amount), 0));
  const deductions = roundMoney(deductionLines.reduce((s, l) => s + Math.max(0, l.amount), 0));

  const grossSalary = roundMoney(basic + allowances + bonus + commission);

  const epfBaseAllowances = roundMoney(
    allowanceLines
      .filter((l) => l.isEpfApplicable !== false)
      .reduce((s, l) => s + Math.max(0, l.amount), 0),
  );
  let epfWage = roundMoney(basic + epfBaseAllowances);
  if (input.epfWageCap != null && input.epfWageCap > 0) {
    epfWage = roundMoney(Math.min(epfWage, input.epfWageCap));
  }

  const epfEmpRate = (input.epfEmployeeRate ?? DEFAULT_EPF_EMPLOYEE_RATE) / 100;
  const epfErRate = (input.epfEmployerRate ?? DEFAULT_EPF_EMPLOYER_RATE) / 100;
  const etfRate = (input.etfEmployerRate ?? DEFAULT_ETF_EMPLOYER_RATE) / 100;

  const epfEmployee = roundMoney(epfWage * epfEmpRate);
  const epfEmployer = roundMoney(epfWage * epfErRate);
  const etfEmployer = roundMoney(epfWage * etfRate);
  const netSalary = roundMoney(Math.max(0, grossSalary - deductions - epfEmployee));
  const employerCost = roundMoney(grossSalary + epfEmployer + etfEmployer);

  return {
    basicSalary: basic,
    allowances,
    deductions,
    bonus,
    commission,
    grossSalary,
    epfWage,
    epfEmployee,
    epfEmployer,
    etfEmployer,
    netSalary,
    employerCost,
  };
}

export function summarizeRun(
  entries: Array<{
    grossSalary: number;
    allowances: number;
    deductions: number;
    epfEmployee: number;
    epfEmployer: number;
    etfEmployer: number;
    netSalary: number;
  }>,
) {
  return {
    employeeCount: entries.length,
    totalGross: roundMoney(entries.reduce((s, e) => s + e.grossSalary, 0)),
    totalAllowances: roundMoney(entries.reduce((s, e) => s + e.allowances, 0)),
    totalDeductions: roundMoney(entries.reduce((s, e) => s + e.deductions, 0)),
    totalEpfEmployee: roundMoney(entries.reduce((s, e) => s + e.epfEmployee, 0)),
    totalEpfEmployer: roundMoney(entries.reduce((s, e) => s + e.epfEmployer, 0)),
    totalEtf: roundMoney(entries.reduce((s, e) => s + e.etfEmployer, 0)),
    totalNet: roundMoney(entries.reduce((s, e) => s + e.netSalary, 0)),
  };
}

export const DEFAULT_PAYROLL_COMPONENTS: Array<{
  code: string;
  name: string;
  type: 'ALLOWANCE' | 'DEDUCTION';
  isEpfApplicable: boolean;
  defaultAmount: number;
}> = [
  { code: 'TRAVEL', name: 'Travel Allowance', type: 'ALLOWANCE', isEpfApplicable: true, defaultAmount: 0 },
  { code: 'MEAL', name: 'Meal Allowance', type: 'ALLOWANCE', isEpfApplicable: false, defaultAmount: 0 },
  { code: 'ATTEND', name: 'Attendance Allowance', type: 'ALLOWANCE', isEpfApplicable: true, defaultAmount: 0 },
  { code: 'ADVANCE', name: 'Salary Advance', type: 'DEDUCTION', isEpfApplicable: false, defaultAmount: 0 },
  { code: 'LOAN', name: 'Loan Recovery', type: 'DEDUCTION', isEpfApplicable: false, defaultAmount: 0 },
  { code: 'OTHER_DED', name: 'Other Deduction', type: 'DEDUCTION', isEpfApplicable: false, defaultAmount: 0 },
];
