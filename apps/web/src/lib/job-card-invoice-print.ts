import { executeReceiptPrint } from '@/lib/receipt-print';
import type { ReceiptSettings } from '@/lib/use-receipt-settings';
import { resolvePublicAssetUrl } from '@/lib/upload';
import { APP_NAME } from '@/lib/constants';
import { receiptMoney, receiptThemeStyleBlock } from '@/lib/receipt-theme';

export type RepairInvoiceLine = {
  lineType: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type RepairInvoiceData = {
  jobNumber: string;
  customerName: string;
  customerPhone?: string;
  vehicleLabel?: string;
  repairDescription?: string | null;
  afterNotes?: string | null;
  status?: string;
  createdAt?: string | Date | null;
  total: number;
  lines: RepairInvoiceLine[];
};

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtWhen(d?: string | Date | null) {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) return new Date().toLocaleString();
  return dt.toLocaleString();
}

function isPartLine(lineType: string) {
  return String(lineType || '').toUpperCase() === 'PART';
}

/** Build repair/job-card invoice HTML. Parts section respects `showAddedPartsOnInvoice`. */
export function buildRepairInvoiceHtml(
  data: RepairInvoiceData,
  settings: ReceiptSettings,
): string {
  const showParts = settings.showAddedPartsOnInvoice !== false;
  const partLines = data.lines.filter((l) => isPartLine(l.lineType));
  const workLines = data.lines.filter((l) => !isPartLine(l.lineType));

  const repairDesc =
    (data.repairDescription || '').trim() ||
    workLines.map((l) => l.description).filter(Boolean).join(', ') ||
    'Repair / workshop service';

  const workRows = workLines
    .map(
      (l) =>
        `<div class="item"><div class="iname">${esc(l.description)}</div>` +
        `<div class="irow"><span class="q">${l.quantity} × ${receiptMoney(l.unitPrice)}</span>` +
        `<span class="a">${receiptMoney(l.total)}</span></div></div>`,
    )
    .join('');

  const partRows =
    showParts && partLines.length > 0
      ? partLines
          .map(
            (l) =>
              `<div class="item"><div class="iname">${esc(l.description)}</div>` +
              `<div class="irow"><span class="q">${l.quantity} × ${receiptMoney(l.unitPrice)}</span>` +
              `<span class="a">${receiptMoney(l.total)}</span></div></div>`,
          )
          .join('')
      : '';

  const logoHtml = settings.logoUrl
    ? `<img class="logo" src="${esc(resolvePublicAssetUrl(settings.logoUrl))}" alt=""/>`
    : '';
  const addr = [settings.address1, settings.address2].filter(Boolean).map(esc).join('<br/>');
  const contact = [settings.phone, settings.email].filter(Boolean).map(esc).join(' · ');
  const css = receiptThemeStyleBlock({
    paperWidth: settings.paperWidth === '58mm' ? '58mm' : '80mm',
    fontSize: settings.fontSize,
    theme: 'light',
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Repair Invoice ${esc(data.jobNumber)}</title><style>${css}</style></head><body>
<div class="hdr">${logoHtml}<div class="shop">${esc(settings.shopName || APP_NAME)}</div>${settings.tagline ? `<div class="tag">${esc(settings.tagline)}</div>` : ''}${addr ? `<div class="tag">${addr}</div>` : ''}${contact ? `<div class="tag">${contact}</div>` : ''}</div>
<div class="badge">Repair Invoice</div>
<div class="meta">
  <div class="row"><span>Job #</span><span>${esc(data.jobNumber)}</span></div>
  <div class="row"><span>Date</span><span>${esc(fmtWhen(data.createdAt))}</span></div>
  ${settings.showCustomer !== false && data.customerName ? `<div class="row"><span>Customer</span><span>${esc(data.customerName)}</span></div>` : ''}
  ${data.customerPhone ? `<div class="row"><span>Phone</span><span>${esc(data.customerPhone)}</span></div>` : ''}
  ${data.vehicleLabel && data.vehicleLabel !== '—' ? `<div class="row"><span>Vehicle</span><span>${esc(data.vehicleLabel)}</span></div>` : ''}
</div>
<hr class="dbl"/>
<div class="sec">Repair</div>
<div class="item"><div class="iname">${esc(repairDesc)}</div></div>
${workRows ? `<hr class="d"/><div class="sec">Labour / Services</div>${workRows}` : ''}
${showParts && partRows ? `<hr class="d"/><div class="sec">Added Parts</div>${partRows}` : ''}
${!showParts && partLines.length > 0 ? `<p class="tag" style="margin-top:6px">Parts used are recorded in stock (not listed on this invoice).</p>` : ''}
${data.afterNotes ? `<hr class="d"/><div class="sec">Notes</div><div class="item"><div class="iname">${esc(data.afterNotes)}</div></div>` : ''}
<hr class="dbl"/>
<div class="tot"><span>TOTAL</span><span>${receiptMoney(data.total)}</span></div>
<hr class="d"/>
${settings.footerText ? `<div class="foot">${esc(settings.footerText)}</div>` : ''}
</body></html>`;
}

export async function printRepairInvoice(
  data: RepairInvoiceData,
  settings: ReceiptSettings,
) {
  const html = buildRepairInvoiceHtml(data, settings);
  return executeReceiptPrint({
    html,
    printType: 'REPAIR',
    invoiceNumber: data.jobNumber,
    settings,
    title: `Repair Invoice ${data.jobNumber}`,
  });
}
