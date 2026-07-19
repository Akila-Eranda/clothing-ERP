import { executeReceiptPrint } from '@/lib/receipt-print';
import type { ReceiptSettings } from '@/lib/use-receipt-settings';
import { resolvePublicAssetUrl } from '@/lib/upload';
import { APP_NAME } from '@/lib/constants';

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

function fmtMoney(n: number) {
  return `LKR ${n.toFixed(2)}`;
}

function fmtWhen(d?: string | Date | null) {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) return new Date().toLocaleString();
  return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function buildGrnReceiptHtml(data: GrnReceiptData, settings: ReceiptSettings): string {
  const s = settings;
  const pw = s.paperWidth === '58mm' ? '58mm' : '80mm';
  const fs = s.fontSize === 'small' ? '11px' : s.fontSize === 'large' ? '14px' : '12px';
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
      return `<div class="iname">${esc(i.name)}</div>${
        meta ? `<div class="meta">${esc(meta)}</div>` : ''
      }<div class="row"><span>${i.qty} x ${fmtMoney(i.unitCost)}</span><span>${fmtMoney(i.lineTotal)}</span></div>`;
    })
    .join('');

  const logoHtml = s.logoUrl
    ? `<img src="${resolvePublicAssetUrl(s.logoUrl)}" style="max-width:80px;display:block;margin:0 auto 4px"/>`
    : '';
  const addr = [s.address1, s.address2]
    .filter(Boolean)
    .map((a) => `<sub>${esc(a!)}</sub>`)
    .join('');
  const contactHtml = [
    s.phone && `<sub>${esc(s.phone)}</sub>`,
    s.email && `<sub>${esc(s.email)}</sub>`,
  ]
    .filter(Boolean)
    .join('');
  const cashierHtml =
    s.showCashier && data.cashierName
      ? `<div class="row"><span>Received by:</span><span>${esc(data.cashierName)}</span></div>`
      : '';
  const paymentHtml =
    data.paymentAmount && data.paymentAmount > 0
      ? `<hr class="d"/><div class="row"><span>Paid now</span><span><b>${esc(data.paymentMethod || 'CASH')}</b></span></div><div class="row"><span>Amount</span><span>${fmtMoney(data.paymentAmount)}</span></div>`
      : '';
  const notesHtml = data.notes
    ? `<hr class="d"/><div class="meta">Notes: ${esc(data.notes)}</div>`
    : '';
  const poHtml = data.poNumber
    ? `<div class="row"><span>PO:</span><span>${esc(data.poNumber)}</span></div>`
    : '';
  const sourceHtml = data.source
    ? `<div class="row"><span>Source:</span><span>${esc(data.source)}</span></div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>GRN ${esc(data.grnNumber)}</title><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#ffffff!important;color:#000000!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Courier New',monospace;font-size:${fs};padding:6mm;max-width:${pw};margin:0 auto}
h1{font-size:1.35em;font-weight:900;text-align:center;color:#000}
.badge{text-align:center;font-weight:900;letter-spacing:1px;margin:2px 0 4px;font-size:0.95em}
sub{font-size:0.85em;display:block;text-align:center;margin-bottom:1px;color:#000}
.d{border:none;border-top:1px dashed #000;margin:5px 0}
.row{display:flex;justify-content:space-between;margin:2px 0;font-size:0.9em;color:#000;gap:8px}
.iname{font-size:0.9em;font-weight:bold;margin-top:4px;color:#000}
.meta{font-size:0.75em;color:#000;opacity:0.85;margin-top:1px}
.tot{display:flex;justify-content:space-between;font-size:1.15em;font-weight:900;border-top:2px solid #000;padding-top:4px;margin-top:4px;color:#000}
.foot{text-align:center;margin-top:10px;font-size:0.8em;line-height:1.6;color:#000}
@media print{@page{margin:0;size:${pw} auto}html,body{background:#fff!important;color:#000!important}body{padding:3mm}}
</style></head><body>
${logoHtml}
<h1>${esc(s.shopName || APP_NAME)}</h1>
${s.tagline ? `<sub>${esc(s.tagline)}</sub>` : ''}
${addr}${contactHtml}
<div class="badge">GOODS RECEIPT (GRN)</div>
<hr class="d"/>
<div class="row"><span>GRN:</span><span><b>${esc(data.grnNumber)}</b></span></div>
<div class="row"><span>Date:</span><span>${esc(fmtWhen(data.receivedAt))}</span></div>
<div class="row"><span>Supplier:</span><span><b>${esc(data.supplierName)}</b></span></div>
${poHtml}${sourceHtml}${cashierHtml}
<hr class="d"/>
<div style="font-size:0.8em;font-weight:bold;margin-bottom:2px">ITEMS</div>
${rows}
<hr class="d"/>
<div class="row"><span>Lines / Qty</span><span>${data.items.length} / ${totalQty}</span></div>
<div class="tot"><span>TOTAL</span><span>${fmtMoney(total)}</span></div>
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
