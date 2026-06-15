import { fmtInvoiceDate, fmtInvoiceMoney, resolveInvoiceLogoDataUrl, INVOICE_LOGO_URL } from '@/lib/subscription-invoice-document';
import { resolvePublicAssetUrl } from '@/lib/upload';

export interface QuotationPrintItem {
  productName: string;
  variantName?: string | null;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
  total: number;
}

export interface QuotationPrintShop {
  shopName: string;
  tagline?: string;
  address1?: string;
  address2?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
}

export interface QuotationPrintData {
  quoteNumber: string;
  status: string;
  createdAt: string;
  validUntil?: string | null;
  notes?: string | null;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  customer?: {
    firstName: string;
    lastName?: string | null;
    phone?: string;
    email?: string | null;
  } | null;
  items: QuotationPrintItem[];
  shop: QuotationPrintShop;
}

export { fmtInvoiceDate, fmtInvoiceMoney, resolveInvoiceLogoDataUrl };

const QUOTE_CSS = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;color:#0f172a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:760px;margin:0 auto;padding:40px 44px}
  .top-bar{height:6px;background:linear-gradient(90deg,#0d9488,#14b8a6,#2dd4bf);border-radius:999px;margin-bottom:28px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:32px}
  .brand-block{display:flex;gap:16px;align-items:flex-start}
  .logo{width:120px;height:auto;object-fit:contain}
  .company-name{font-size:15px;font-weight:700;color:#0f172a;margin-bottom:2px}
  .company-tagline{font-size:12px;color:#64748b;margin-bottom:8px}
  .company-meta{font-size:11px;color:#64748b;line-height:1.7}
  .inv-badge{text-align:right}
  .inv-badge h1{font-size:32px;font-weight:800;letter-spacing:-.03em;color:#0f172a;line-height:1}
  .inv-num{display:inline-block;margin-top:8px;padding:6px 12px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;font-size:12px;font-weight:600;color:#0f766e;font-family:ui-monospace,monospace}
  .status-pill{display:inline-block;margin-top:8px;padding:4px 10px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:#ecfdf5;color:#047857}
  .meta-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:20px;padding:20px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin-bottom:24px}
  .meta-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:6px}
  .meta-val{font-size:13px;font-weight:600;color:#0f172a}
  .meta-sub{font-size:11px;color:#64748b;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead th{text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;padding:10px 12px;background:#f8fafc;border-bottom:2px solid #0f172a}
  thead th:nth-child(3),thead th:nth-child(4),thead th:nth-child(5){text-align:right;width:72px}
  tbody td{padding:14px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:top}
  tbody td:nth-child(3),tbody td:nth-child(4),tbody td:nth-child(5){text-align:right;color:#475569}
  tbody td:nth-child(5){font-weight:700;color:#0f172a}
  .item-title{font-weight:700;color:#0f172a}
  .item-sub{font-size:11px;color:#64748b;margin-top:4px;font-family:ui-monospace,monospace}
  .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:28px}
  .totals{width:280px}
  .tot-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#475569}
  .tot-grand{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:16px 18px;background:#0f172a;color:#fff;border-radius:10px;font-size:15px;font-weight:800}
  .notes{border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;background:#f8fafc;margin-bottom:24px}
  .notes-title{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:8px}
  .notes-body{font-size:12px;color:#475569;line-height:1.6;white-space:pre-wrap}
  .terms{font-size:11px;color:#94a3b8;line-height:1.6;margin-bottom:16px}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8}
  @media print{
    body{background:#fff}
    .page{padding:24px 32px}
    @page{margin:10mm;size:A4}
  }
`;

function customerLabel(q: QuotationPrintData): string {
  if (!q.customer) return 'Walk-in Customer';
  return `${q.customer.firstName} ${q.customer.lastName ?? ''}`.trim() || q.customer.phone || 'Customer';
}

function shopLogoUrl(shop: QuotationPrintShop, fallback: string): string {
  if (shop.logoUrl) return resolvePublicAssetUrl(shop.logoUrl);
  return fallback;
}

export function buildQuotationPrintHtml(q: QuotationPrintData, logoDataUrl = INVOICE_LOGO_URL): string {
  const shop = q.shop;
  const logo = shopLogoUrl(shop, logoDataUrl);
  const rows = q.items.map((item) => {
    const title = item.variantName && item.variantName !== item.productName
      ? `${item.productName} — ${item.variantName}`
      : item.productName;
    return `<tr>
      <td><div class="item-title">${title}</div><div class="item-sub">${item.sku}</div></td>
      <td>${item.quantity}</td>
      <td>${fmtInvoiceMoney(item.unitPrice, 'LKR')}</td>
      <td>${item.taxRate ? `${item.taxRate}%` : '—'}</td>
      <td>${fmtInvoiceMoney(item.total, 'LKR')}</td>
    </tr>`;
  }).join('');

  const notesBlock = q.notes?.trim()
    ? `<div class="notes"><div class="notes-title">Notes & Terms</div><div class="notes-body">${q.notes.trim()}</div></div>`
    : '';

  const contact = [shop.phone, shop.email, shop.website].filter(Boolean).join(' · ');
  const address = [shop.address1, shop.address2].filter(Boolean).join(', ');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Quotation ${q.quoteNumber}</title>
<style>${QUOTE_CSS}</style></head><body>
<div class="page">
  <div class="top-bar"></div>
  <div class="head">
    <div class="brand-block">
      ${logo ? `<img class="logo" src="${logo}" alt="${shop.shopName}" />` : ''}
      <div>
        <div class="company-name">${shop.shopName}</div>
        ${shop.tagline ? `<div class="company-tagline">${shop.tagline}</div>` : ''}
        <div class="company-meta">
          ${address ? `${address}<br/>` : ''}
          ${contact}
        </div>
      </div>
    </div>
    <div class="inv-badge">
      <h1>QUOTATION</h1>
      <div class="inv-num">#${q.quoteNumber}</div>
      <div class="status-pill">${q.status.replace(/_/g, ' ')}</div>
    </div>
  </div>
  <div class="meta-grid">
    <div>
      <div class="meta-lbl">Prepared For</div>
      <div class="meta-val">${customerLabel(q)}</div>
      ${q.customer?.phone ? `<div class="meta-sub">${q.customer.phone}</div>` : ''}
      ${q.customer?.email ? `<div class="meta-sub">${q.customer.email}</div>` : ''}
    </div>
    <div>
      <div class="meta-lbl">Quote Date</div>
      <div class="meta-val">${fmtInvoiceDate(q.createdAt)}</div>
    </div>
    <div>
      <div class="meta-lbl">Valid Until</div>
      <div class="meta-val">${q.validUntil ? fmtInvoiceDate(q.validUntil) : 'Open'}</div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th>Part / Description</th><th style="text-align:center;width:48px">Qty</th>
      <th>Unit Price</th><th>Tax</th><th>Line Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals-wrap"><div class="totals">
    <div class="tot-row"><span>Subtotal</span><span>${fmtInvoiceMoney(q.subtotal, 'LKR')}</span></div>
    ${q.discountAmount > 0 ? `<div class="tot-row"><span>Discount</span><span>-${fmtInvoiceMoney(q.discountAmount, 'LKR')}</span></div>` : ''}
    ${q.taxAmount > 0 ? `<div class="tot-row"><span>Tax</span><span>${fmtInvoiceMoney(q.taxAmount, 'LKR')}</span></div>` : ''}
    <div class="tot-grand"><span>Grand Total</span><span>${fmtInvoiceMoney(q.total, 'LKR')}</span></div>
  </div></div>
  ${notesBlock}
  <p class="terms">This quotation is valid until the date shown above. Prices and availability are subject to change after expiry. Payment terms as agreed with your account manager.</p>
  <div class="footer">Thank you for your business · ${shop.shopName}</div>
</div></body></html>`;
}

export function quotationToPrintData(
  quote: {
    quoteNumber: string;
    status: string;
    createdAt: string;
    validUntil?: string | null;
    notes?: string | null;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
    customer?: QuotationPrintData['customer'];
    items: {
      quantity: number;
      unitPrice: number;
      discount?: number;
      taxRate?: number;
      total?: number;
      variant: { sku: string; name?: string | null; product: { name: string } };
    }[];
  },
  shop: QuotationPrintShop,
): QuotationPrintData {
  return {
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    createdAt: quote.createdAt,
    validUntil: quote.validUntil,
    notes: quote.notes,
    subtotal: quote.subtotal,
    taxAmount: quote.taxAmount,
    discountAmount: quote.discountAmount,
    total: quote.total,
    customer: quote.customer,
    shop,
    items: quote.items.map((item) => ({
      productName: item.variant.product.name,
      variantName: item.variant.name,
      sku: item.variant.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxRate: item.taxRate,
      total: item.total ?? item.quantity * item.unitPrice,
    })),
  };
}
