import type { SubscriptionInvoice } from '@/lib/admin-api'

export const INVOICE_LOGO_URL =
  (typeof window !== 'undefined' ? window.location.origin : '') + '/hexaone-logo.png'

export function fmtInvoiceMoney(amount: number, currency: string) {
  const sym = currency.replace(/\.$/, '').trim() || 'Rs.'
  return `${sym} ${amount.toLocaleString('en-LK')}`
}

export function fmtInvoiceDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const INVOICE_CSS = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;color:#0f172a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:760px;margin:0 auto;padding:40px 44px}
  .top-bar{height:6px;background:linear-gradient(90deg,#1d4ed8,#2563eb,#3b82f6);border-radius:999px;margin-bottom:28px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:32px}
  .brand-block{display:flex;gap:16px;align-items:flex-start}
  .logo{width:120px;height:auto;object-fit:contain}
  .company-name{font-size:15px;font-weight:700;color:#0f172a;margin-bottom:2px}
  .company-legal{font-size:12px;color:#64748b;margin-bottom:8px}
  .company-meta{font-size:11px;color:#64748b;line-height:1.7}
  .inv-badge{text-align:right}
  .inv-badge h1{font-size:32px;font-weight:800;letter-spacing:-.03em;color:#0f172a;line-height:1}
  .inv-num{display:inline-block;margin-top:8px;padding:6px 12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;font-weight:600;color:#475569;font-family:ui-monospace,monospace}
  .meta-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:20px;padding:20px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin-bottom:24px}
  .meta-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:6px}
  .meta-val{font-size:13px;font-weight:600;color:#0f172a}
  .meta-sub{font-size:11px;color:#64748b;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead th{text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;padding:10px 12px;background:#f8fafc;border-bottom:2px solid #0f172a}
  thead th:nth-child(2){text-align:center;width:64px}
  thead th:nth-child(3){text-align:right;width:120px}
  tbody td{padding:16px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:top}
  tbody td:nth-child(2){text-align:center;color:#475569}
  tbody td:nth-child(3){text-align:right;font-weight:700;color:#0f172a}
  .item-title{font-weight:700;color:#0f172a}
  .item-sub{font-size:11px;color:#64748b;margin-top:4px}
  .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:28px}
  .totals{width:280px}
  .tot-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#475569}
  .tot-grand{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:16px 18px;background:#0f172a;color:#fff;border-radius:10px;font-size:15px;font-weight:800}
  .bank{border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;background:linear-gradient(180deg,#f8fafc,#fff)}
  .bank-title{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:14px}
  .bank-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 32px;font-size:12px}
  .bank-grid .lbl{color:#64748b}
  .bank-grid .val{font-weight:600;color:#0f172a;text-align:right}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8}
  @media print{
    body{background:#fff}
    .page{padding:24px 32px}
    @page{margin:10mm;size:A4}
  }
`

export function buildSubscriptionInvoicePrintHtml(
  inv: SubscriptionInvoice,
  logoUrl = INVOICE_LOGO_URL || 'https://admin3.hexalyte.com/hexaone-logo.png',
): string {
  const monthLabel = inv.months === 1 ? '1 Month' : `${inv.months} Months`
  const b = inv.billing

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Invoice ${inv.invoiceNumber}</title>
<style>${INVOICE_CSS}</style></head><body>
<div class="page">
  <div class="top-bar"></div>
  <div class="head">
    <div class="brand-block">
      <img class="logo" src="${logoUrl}" alt="${b.companyBrandName}" />
      <div>
        <div class="company-name">${b.companyBrandName}</div>
        <div class="company-legal">${b.companyLegalName}</div>
        <div class="company-meta">
          ${b.companyWebsite}<br/>${b.companyEmail}<br/>${b.companyPhone}
        </div>
      </div>
    </div>
    <div class="inv-badge">
      <h1>INVOICE</h1>
      <div class="inv-num">#${inv.invoiceNumber}</div>
    </div>
  </div>
  <div class="meta-grid">
    <div>
      <div class="meta-lbl">Bill To</div>
      <div class="meta-val">${inv.tenantName}</div>
      <div class="meta-sub">${inv.tenantEmail}</div>
    </div>
    <div>
      <div class="meta-lbl">Issue Date</div>
      <div class="meta-val">${fmtInvoiceDate(inv.issueDate)}</div>
    </div>
    <div>
      <div class="meta-lbl">Valid Until</div>
      <div class="meta-val">${fmtInvoiceDate(inv.validUntil)}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead>
    <tbody><tr>
      <td><div class="item-title">Hexalyte ${inv.planName} Plan</div>
          <div class="item-sub">${monthLabel} subscription · ${fmtInvoiceMoney(inv.unitPrice, inv.currency)} / month</div></td>
      <td>${inv.months}</td>
      <td>${fmtInvoiceMoney(inv.subtotal, inv.currency)}</td>
    </tr></tbody>
  </table>
  <div class="totals-wrap"><div class="totals">
    <div class="tot-row"><span>Subtotal</span><span>${fmtInvoiceMoney(inv.subtotal, inv.currency)}</span></div>
    <div class="tot-row"><span>Tax (${inv.taxRate}%)</span><span>${fmtInvoiceMoney(inv.taxAmount, inv.currency)}</span></div>
    <div class="tot-grand"><span>Total (${monthLabel})</span><span>${fmtInvoiceMoney(inv.total, inv.currency)}</span></div>
  </div></div>
  <div class="bank">
    <div class="bank-title">Bank Transfer Details</div>
    <div class="bank-grid">
      <span class="lbl">Bank</span><span class="val">${b.bankName}</span>
      <span class="lbl">Account Name</span><span class="val">${b.bankAccountName}</span>
      <span class="lbl">Account Number</span><span class="val">${b.bankAccountNumber}</span>
      <span class="lbl">SWIFT Code</span><span class="val">${b.bankSwift}</span>
    </div>
  </div>
  <div class="footer">Thank you for your business · ${b.companyLegalName}</div>
</div></body></html>`
}
