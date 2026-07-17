import {
  calculatePayroll,
  payslipNumber,
  periodLabel,
  roundMoney,
  summarizeRun,
} from './payroll.helper';

describe('Sprint 10 — Payroll helpers (EPF/ETF)', () => {
  it('calculates SL EPF 8/12 and ETF 3 on contributory wage', () => {
    const r = calculatePayroll({
      basicSalary: 100000,
      allowanceLines: [
        { amount: 10000, isEpfApplicable: true },
        { amount: 5000, isEpfApplicable: false },
      ],
      deductionLines: [{ amount: 2000 }],
      bonus: 0,
    });
    expect(r.grossSalary).toBe(115000);
    expect(r.epfWage).toBe(110000);
    expect(r.epfEmployee).toBe(8800);
    expect(r.epfEmployer).toBe(13200);
    expect(r.etfEmployer).toBe(3300);
    expect(r.netSalary).toBe(104200); // 115000 - 2000 - 8800
    expect(r.employerCost).toBe(131500);
  });

  it('respects EPF wage cap', () => {
    const r = calculatePayroll({
      basicSalary: 200000,
      epfWageCap: 100000,
    });
    expect(r.epfWage).toBe(100000);
    expect(r.epfEmployee).toBe(8000);
  });

  it('summarizes a run and formats payslip numbers', () => {
    const s = summarizeRun([
      {
        grossSalary: 100,
        allowances: 10,
        deductions: 5,
        epfEmployee: 8,
        epfEmployer: 12,
        etfEmployer: 3,
        netSalary: 87,
      },
      {
        grossSalary: 200,
        allowances: 20,
        deductions: 0,
        epfEmployee: 16,
        epfEmployer: 24,
        etfEmployer: 6,
        netSalary: 184,
      },
    ]);
    expect(s.employeeCount).toBe(2);
    expect(s.totalNet).toBe(271);
    expect(periodLabel(2026, 7)).toBe('2026-07');
    expect(payslipNumber(2026, 7, 3)).toBe('PS-202607-0003');
    expect(roundMoney(1.005)).toBe(1.01);
  });
});
