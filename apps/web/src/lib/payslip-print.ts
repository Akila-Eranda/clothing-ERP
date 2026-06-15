import { executeReceiptPrint } from '@/lib/receipt-print';
import type { ReceiptSettings } from '@/lib/use-receipt-settings';
import type { PayslipSettings } from '@/lib/payslip-settings';
import { PAYSLIP_DEFAULTS } from '@/lib/payslip-settings';
import { APP_NAME } from '@/lib/constants';
import { resolvePublicAssetUrl } from '@/lib/upload';

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildThermalPayslipHtml(
  p: PayslipPrintData,
  month: number,
  year: number,
  receiptSettings: ReceiptSettings,
  payslipSettings: PayslipSettings = PAYSLIP_DEFAULTS,
): string {
  const ps = { ...PAYSLIP_DEFAULTS, ...payslipSettings };
  const paperWidth =
    ps.paperWidth === 'inherit' ? receiptSettings.paperWidth : ps.paperWidth;
  const fontSizeKey =
    ps.fontSize === 'inherit' ? receiptSettings.fontSize : ps.fontSize;

  const pw = paperWidth === '58mm' ? '58mm' : '80mm';
  const bodyWidth = paperWidth === '58mm' ? '54mm' : '72mm';
  const padWidth = paperWidth === '58mm' ? 24 : 32;
  const fs = fontSizeKey === 'small' ? '10px' : fontSizeKey === 'large' ? '12px' : '10.5px';

  const monthName = MONTHS[month - 1]?.toUpperCase() ?? '';
  const empName = `${p.employee.firstName} ${p.employee.lastName}`.trim();
  const gross = p.basicSalary + p.allowances + p.bonus;
  const periodEnd = new Date(year, month, 0).getDate();
  const payslipNo = `PS-${year}-${String(month).padStart(2, '0')}-${p.employee.code.replace('EMP-', '')}`;
  const fmt = (n: number) => n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cur = ps.currencyLabel || 'LKR';

  const shopName = (
    ps.useReceiptShopInfo
      ? receiptSettings.shopName || ps.companyName || APP_NAME
      : ps.companyName || receiptSettings.shopName || APP_NAME
  ).toUpperCase();
  const taglineText = ps.useReceiptShopInfo ? receiptSettings.tagline : ps.tagline;
  const address1 = ps.useReceiptShopInfo ? receiptSettings.address1 : ps.address1;
  const address2 = ps.useReceiptShopInfo ? receiptSettings.address2 : ps.address2;
  const phone = ps.useReceiptShopInfo ? receiptSettings.phone : ps.phone;
  const email = ps.useReceiptShopInfo ? receiptSettings.email : ps.email;
  const logoUrl = ps.logoUrl || (ps.useReceiptShopInfo ? receiptSettings.logoUrl : '');

  const tagline = taglineText ? `<div class="center sub">${escapeHtml(taglineText)}</div>` : '';
  const addr = [address1, address2]
    .filter(Boolean)
    .map((a) => `<div class="center sub">${escapeHtml(a!)}</div>`)
    .join('');
  const phoneLine = ps.showShopContact && phone ? `<div class="center sub">Tel: ${escapeHtml(phone)}</div>` : '';
  const emailLine = ps.showShopContact && email ? `<div class="center sub">${escapeHtml(email)}</div>` : '';
  const headerMsg = ps.headerText ? `<div class="center sub">${escapeHtml(ps.headerText)}</div>` : '';
  const logoHtml =
    ps.showLogo && logoUrl
      ? `<img src="${resolvePublicAssetUrl(logoUrl)}" style="max-width:80px;display:block;margin:0 auto 4px" alt="logo"/>`
      : '';

  const paymentDate = p.paidAt
    ? new Date(p.paidAt).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Pending';

  const metaRows = [
    ps.showPayslipNumber ? `<div class="meta"><span class="bold">Payslip:</span> ${escapeHtml(payslipNo)}</div>` : '',
    `<div class="meta"><span class="bold">Employee:</span> ${escapeHtml(empName)}</div>`,
    ps.showEmployeeId ? `<div class="meta"><span class="bold">Emp ID:</span> ${escapeHtml(p.employee.code)}</div>` : '',
    ps.showDesignation
      ? `<div class="meta"><span class="bold">Designation:</span> ${escapeHtml(p.employee.designation ?? '—')}</div>`
      : '',
    ps.showPayPeriod
      ? `<div class="meta"><span class="bold">Period:</span> 01 ${MONTHS[month - 1]?.slice(0, 3)} ${year} - ${periodEnd} ${MONTHS[month - 1]?.slice(0, 3)} ${year}</div>`
      : '',
    ps.showPaidDate ? `<div class="meta"><span class="bold">Paid on:</span> ${escapeHtml(paymentDate)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  const earningRows = [
    `<div class="pre">${padLine(ps.labelBasicSalary, fmt(p.basicSalary), padWidth)}</div>`,
    p.allowances > 0 ? `<div class="pre">${padLine(ps.labelAllowances, fmt(p.allowances), padWidth)}</div>` : '',
    p.bonus > 0 ? `<div class="pre">${padLine(ps.labelBonus, fmt(p.bonus), padWidth)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  const title = escapeHtml(ps.title || 'PAYSLIP');
  const signature = ps.signatureLine
    ? `<div class="foot">${escapeHtml(ps.signatureLine)}</div>`
    : '';
  const thankYou = ps.thankYouText
    ? `<div class="foot bold">${escapeHtml(ps.thankYouText)}</div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Payslip - ${escapeHtml(empName)}</title>
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

${logoHtml}
<div class="center bold" style="font-size:14px;letter-spacing:2px;">${escapeHtml(shopName)}</div>
${tagline}${addr}${phoneLine}${emailLine}${headerMsg}
<div class="dbl"></div>
<div class="center bold" style="font-size:12px;letter-spacing:2px;">** ${title} **</div>
<div class="center sub">${monthName} ${year}</div>
<div class="dbl"></div>

${metaRows}

<div class="dash"></div>
<div class="section">${escapeHtml(ps.labelEarningsSection)} (${cur})</div>
<div class="dash"></div>
${earningRows}
<div class="dash"></div>
<div class="pre bold">${padLine('TOTAL EARNINGS', fmt(gross), padWidth)}</div>

<div class="dash"></div>
<div class="section">${escapeHtml(ps.labelDeductionsSection)} (${cur})</div>
<div class="dash"></div>
<div class="pre">${padLine(ps.labelDeductions, fmt(p.deductions), padWidth)}</div>
<div class="dash"></div>
<div class="pre bold">${padLine('TOTAL DEDUCTIONS', fmt(p.deductions), padWidth)}</div>

<div class="solid"></div>
<div class="grand"><span>${escapeHtml(ps.labelNetPay)}</span><span>${cur} ${fmt(p.netSalary)}</span></div>
<div class="solid"></div>

${signature}
<div class="foot">${escapeHtml(ps.footerText || 'Computer generated payslip.')}</div>
${thankYou}
</body></html>`;
}

export async function printThermalPayslip(
  p: PayslipPrintData,
  month: number,
  year: number,
  receiptSettings: ReceiptSettings,
  payslipSettings: PayslipSettings = PAYSLIP_DEFAULTS,
) {
  const empName = `${p.employee.firstName} ${p.employee.lastName}`.trim();
  const payslipNo = `PS-${year}-${String(month).padStart(2, '0')}-${p.employee.code.replace('EMP-', '')}`;
  const html = buildThermalPayslipHtml(p, month, year, receiptSettings, payslipSettings);
  const paperWidth =
    payslipSettings.paperWidth === 'inherit'
      ? receiptSettings.paperWidth
      : payslipSettings.paperWidth;
  return executeReceiptPrint({
    html,
    printType: 'PAYSLIP',
    invoiceNumber: payslipNo,
    settings: receiptSettings,
    paperWidth,
    title: `Payslip - ${empName}`,
  });
}

/** Sample data for settings preview */
export const PAYSLIP_PREVIEW_SAMPLE: PayslipPrintData = {
  employee: { firstName: 'Sample', lastName: 'Employee', designation: 'Sales Associate', code: 'EMP-001' },
  basicSalary: 45000,
  allowances: 5000,
  bonus: 2000,
  deductions: 3500,
  netSalary: 48500,
  paidAt: new Date().toISOString(),
};
