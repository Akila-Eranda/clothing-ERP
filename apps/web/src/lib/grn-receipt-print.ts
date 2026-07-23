import { executeReceiptPrint } from '@/lib/receipt-print';
import type { ReceiptSettings } from '@/lib/use-receipt-settings';
import { resolvePublicAssetUrl } from '@/lib/upload';
import { APP_NAME } from '@/lib/constants';
import { receiptMoney, receiptThemeStyleBlock } from '@/lib/receipt-theme';

export type GrnReceiptLine = {
  name: string;
  sku?: string;
  qty: number;
  unitCost: number;
  lineTotal: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
};

export type GrnReceiptData = {
  grnNumber: string;
  supplierName: string;
  receivedAt?: string | Date | null;
  notes?: string | null;
  source?: string | null;
  poNumber?: string | null;
  paymentMethod?: string | null;
  paymentAmount?: number | null;
  cashierName?: string | null;
  items: GrnReceiptLine[];
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
  return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function buildGrnReceiptHtml(data: GrnReceiptData, settings: ReceiptSettings): string {
  const s = settings;
  const pw = s.paperWidth === '58mm' ? '58mm' : '80mm';
  const totalQty = data.items.reduce((sum, i) => sum + i.qty, 0);
  const total = data.items.reduce((sum, i) => sum + i.lineTotal, 0);

  const rows = data.items
    .map((i) => {
      const meta = [
        i.sku,
        i.batchNumber ? `B:${i.batchNumber}` : null,
        i.expiryDate ? `Exp:${new Date(i.expiryDate).toLocaleDateString()}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return `<div class="item"><div class="iname">${esc(i.name)}</div>${
        meta ? `<div class="info" style="text-align:left">${esc(meta)}</div>` : ''
      }<div class="irow"><span class="q">${i.qty} × ${receiptMoney(i.unitCost)}</span><span class="a">${receiptMoney(i.lineTotal)}</span></div></div>`;
    })
    .join('');

  const logoHtml = s.logoUrl
    ? `<img class="logo" src="${resolvePublicAssetUrl(s.logoUrl)}" alt=""/>`
    : '';
  const addr = [s.address1, s.address2]
    .filter(Boolean)
    .map((a) => `<div class="info">${esc(a!)}</div>`)
    .join('');
  const contactHtml = [s.phone, s.email]
    .filter(Boolean)
    .map((t) => `<div class="info">${esc(t!)}</div>`)
    .join('');
  const cashierHtml =
    s.showCashier && data.cashierName
      ? `<div class="row"><span>Received by</span><span>${esc(data.cashierName)}</span></div>`
      : '';
  const paymentHtml =
    data.paymentAmount && data.paymentAmount > 0
      ? `<hr class="d"/><div class="pay"><div class="row"><span>Paid now</span><span><b>${esc(data.paymentMethod || 'CASH')}</b></span></div><div class="row"><span>Amount</span><span>${receiptMoney(data.paymentAmount)}</span></div></div>`
      : '';
  const notesHtml = data.notes
    ? `<hr class="d"/><div class="info" style="text-align:left">Notes: ${esc(data.notes)}</div>`
    : '';
  const poHtml = data.poNumber
    ? `<div class="row"><span>PO</span><span>${esc(data.poNumber)}</span></div>`
    : '';
  const sourceHtml = data.source
    ? `<div class="row"><span>Source</span><span>${esc(data.source)}</span></div>`
    : '';

  const css = receiptThemeStyleBlock({
    paperWidth: pw,
    fontSize: s.fontSize,
    theme: 'light',
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>GRN ${esc(data.grnNumber)}</title><style>${css}</style></head><body>
<div class="hdr">${logoHtml}<div class="shop">${esc(s.shopName || APP_NAME)}</div>${s.tagline ? `<div class="tag">${esc(s.tagline)}</div>` : ''}${addr}${contactHtml}</div>
<div class="badge">Goods Receipt</div>
<div class="meta">
  <div class="row"><span>GRN</span><span><b>${esc(data.grnNumber)}</b></span></div>
  <div class="row"><span>Date</span><span>${esc(fmtWhen(data.receivedAt))}</span></div>
  <div class="row"><span>Supplier</span><span><b>${esc(data.supplierName)}</b></span></div>
  ${poHtml}${sourceHtml}${cashierHtml}
</div>
<hr class="dbl"/>
<div class="sec">Items</div>
${rows}
<hr class="d"/>
<div class="sums">
  <div class="row"><span>Lines / Qty</span><span>${data.items.length} / ${totalQty}</span></div>
  <div class="tot"><span>TOTAL</span><span>${receiptMoney(total)}</span></div>
</div>
${paymentHtml}
${notesHtml}
<hr class="d"/>
<div class="foot">${esc(s.footerText || 'Goods received — keep for records')}</div>
</body></html>`;
}

export async function printGrnReceipt(opts: {
  data: GrnReceiptData;
  settings: ReceiptSettings;
}) {
  const html = buildGrnReceiptHtml(opts.data, opts.settings);
  return executeReceiptPrint({
    html,
    printType: 'GRN',
    invoiceNumber: opts.data.grnNumber,
    settings: opts.settings,
    title: `GRN ${opts.data.grnNumber}`,
  });
}
