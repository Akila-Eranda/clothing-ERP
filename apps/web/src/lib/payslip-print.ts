import { executeReceiptPrint } from '@/lib/receipt-print';
import type { ReceiptSettings } from '@/lib/use-receipt-settings';
import { APP_NAME } from '@/lib/constants';

export interface PayslipPrintData {
  employee: { firstName: string; lastName: string; designation?: string | null; code: string };
  basicSalary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  netSalary: number;
  paidAt?: string | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function padLine(left: string, right: string, width: number) {
  const l = left.length > width - 8 ? left.slice(0, width - 8) : left;
  const gap = Math.max(1, width - l.length - right.length);
  return l + ' '.repeat(gap) + right;
}

export function buildThermalPayslipHtml(
  p: PayslipPrintData,
  month: number,
  year: number,
  settings: ReceiptSettings,
): string {
  const pw = settings.paperWidth === '58mm' ? '58mm' : '80mm';
  const bodyWidth = settings.paperWidth === '58mm' ? '54mm' : '72mm';
  const padWidth = settings.paperWidth === '58mm' ? 24 : 32;
  const fs = settings.fontSize === 'small' ? '10px' : settings.fontSize === 'large' ? '12px' : '10.5px';

  const monthName = MONTHS[month - 1]?.toUpperCase() ?? '';
  const empName = `${p.employee.firstName} ${p.employee.lastName}`.trim();
  const gross = p.basicSalary + p.allowances + p.bonus;
  const periodEnd = new Date(year, month, 0).getDate();
  const payslipNo = `PS-${year}-${String(month).padStart(2, '0')}-${p.employee.code.replace('EMP-', '')}`;
  const fmt = (n: number) => n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const shopName = (settings.shopName || APP_NAME).toUpperCase();
  const tagline = settings.tagline ? `<div class="center sub">${settings.tagline}</div>` : '';
  const addr = [settings.address1, settings.address2].filter(Boolean).map((a) => `<div class="center sub">${a}</div>`).join('');
  const phone = settings.phone ? `<div class="center sub">Tel: ${settings.phone}</div>` : '';
  const email = settings.email ? `<div class="center sub">${settings.email}</div>` : '';

  const paymentDate = p.paidAt
    ? new Date(p.paidAt).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Pending';

  const earningRows = [
    `<div class="pre">${padLine('Basic Salary', fmt(p.basicSalary), padWidth)}</div>`,
    p.allowances > 0 ? `<div class="pre">${padLine('Allowances', fmt(p.allowances), padWidth)}</div>` : '',
    p.bonus > 0 ? `<div class="pre">${padLine('Bonus', fmt(p.bonus), padWidth)}</div>` : '',
  ].filter(Boolean).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Payslip - ${empName}</title>
<style>
  @page { size: ${pw} auto; margin: 3mm 2mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fs};
    line-height: 1.4;
    width: ${bodyWidth};
    max-width: ${bodyWidth};
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .sub { font-size: 9px; line-height: 1.35; }
  .pre { white-space: pre; font-family: inherit; font-size: inherit; }
  .dash { border-top: 1px dashed #000; margin: 3px 0; }
  .solid { border-top: 1.5px solid #000; margin: 3px 0; }
  .dbl { border-top: 3px double #000; margin: 4px 0; }
  .section { font-weight: bold; font-size: 10px; letter-spacing: 0.5px; margin: 4px 0 2px; }
  .meta { font-size: 10px; line-height: 1.5; word-break: break-word; }
  .grand { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; padding: 3px 0; }
  .foot { text-align: center; font-size: 9px; margin-top: 8px; line-height: 1.5; }
  @media print { body { padding: 0; } }
</style></head><body>

<div class="center bold" style="font-size:14px;letter-spacing:2px;">${shopName}</div>
${tagline}${addr}${phone}${email}
<div class="dbl"></div>
<div class="center bold" style="font-size:12px;letter-spacing:2px;">** PAYSLIP **</div>
<div class="center sub">${monthName} ${year}</div>
<div class="dbl"></div>

<div class="meta"><span class="bold">Payslip:</span> ${payslipNo}</div>
<div class="meta"><span class="bold">Employee:</span> ${empName}</div>
<div class="meta"><span class="bold">Emp ID:</span> ${p.employee.code}</div>
<div class="meta"><span class="bold">Designation:</span> ${p.employee.designation ?? '—'}</div>
<div class="meta"><span class="bold">Period:</span> 01 ${MONTHS[month - 1]?.slice(0, 3)} ${year} - ${periodEnd} ${MONTHS[month - 1]?.slice(0, 3)} ${year}</div>
<div class="meta"><span class="bold">Paid on:</span> ${paymentDate}</div>

<div class="dash"></div>
<div class="section">EARNINGS (LKR)</div>
<div class="dash"></div>
${earningRows}
<div class="dash"></div>
<div class="pre bold">${padLine('TOTAL EARNINGS', fmt(gross), padWidth)}</div>

<div class="dash"></div>
<div class="section">DEDUCTIONS (LKR)</div>
<div class="dash"></div>
<div class="pre">${padLine('Total Deductions', fmt(p.deductions), padWidth)}</div>
<div class="dash"></div>
<div class="pre bold">${padLine('TOTAL DEDUCTIONS', fmt(p.deductions), padWidth)}</div>

<div class="solid"></div>
<div class="grand"><span>NET PAY</span><span>LKR ${fmt(p.netSalary)}</span></div>
<div class="solid"></div>

<div class="foot">${settings.footerText || 'Computer generated payslip.'}</div>
<div class="foot bold">THANK YOU!</div>
</body></html>`;
}

export async function printThermalPayslip(
  p: PayslipPrintData,
  month: number,
  year: number,
  settings: ReceiptSettings,
) {
  const empName = `${p.employee.firstName} ${p.employee.lastName}`.trim();
  const payslipNo = `PS-${year}-${String(month).padStart(2, '0')}-${p.employee.code.replace('EMP-', '')}`;
  const html = buildThermalPayslipHtml(p, month, year, settings);
  return executeReceiptPrint({
    html,
    printType: 'PAYSLIP',
    invoiceNumber: payslipNo,
    settings,
    title: `Payslip - ${empName}`,
  });
}
