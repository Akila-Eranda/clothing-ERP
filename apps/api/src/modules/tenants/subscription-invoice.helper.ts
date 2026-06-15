export interface PlatformBillingSettings {
  companyLegalName: string;
  companyBrandName: string;
  companyWebsite: string;
  companyEmail: string;
  companyPhone: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankSwift: string;
  invoiceDueDays: number;
  taxRate: number;
}

export const DEFAULT_BILLING_SETTINGS: PlatformBillingSettings = {
  companyLegalName: 'Hexalyte Innovation (Pvt) Ltd',
  companyBrandName: 'HEXALYTE INNOVATION',
  companyWebsite: 'www.hexalyte.com',
  companyEmail: 'info@hexalyte.com',
  companyPhone: '+94 70 3130100',
  bankName: 'Commercial Bank',
  bankAccountName: 'Akila Eranda Gankewela',
  bankAccountNumber: '2000124779',
  bankSwift: 'CCEYLKLX',
  invoiceDueDays: 20,
  taxRate: 0,
};

export interface SubscriptionInvoiceData {
  invoiceNumber: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  planKey: string;
  planName: string;
  months: number;
  unitPrice: number;
  currency: string;
  intervalLabel: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  issueDate: string;
  validUntil: string;
  billing: PlatformBillingSettings;
}

export function generateSubscriptionInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `HX-${year}-${suffix}`;
}

function fmtMoney(amount: number, currency: string): string {
  const sym = currency.replace(/\.$/, '').trim() || 'Rs.';
  return `${sym} ${amount.toLocaleString('en-LK')}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function buildSubscriptionInvoiceHtml(inv: SubscriptionInvoiceData, forEmail = false): string {
  const monthLabel = inv.months === 1 ? '1 Month' : `${inv.months} Months`;
  const planLine = `Hexalyte ${inv.planName} Plan`;
  const planSub = `${monthLabel} subscription · ${fmtMoney(inv.unitPrice, inv.currency)} / month`;
  const b = inv.billing;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#f3f4f6;padding:${forEmail ? '0' : '24px'}}
  .wrap{max-width:720px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
  .body{padding:32px 36px}
  .head{display:flex;justify-content:space-between;gap:24px;margin-bottom:28px}
  .brand{font-size:11px;font-weight:800;letter-spacing:.08em;color:#2563eb}
  .legal{font-size:13px;font-weight:600;margin-top:4px}
  .meta{font-size:12px;color:#6b7280;line-height:1.6;margin-top:6px}
  .inv-title{text-align:right}
  .inv-title h1{font-size:28px;font-weight:900;letter-spacing:-.02em}
  .inv-title p{font-size:13px;color:#6b7280;margin-top:4px}
  .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px}
  .lbl{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
  .val{font-size:13px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  th{text-align:left;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;padding:10px 0;border-bottom:2px solid #111}
  th:last-child,td:last-child{text-align:right}
  td{padding:14px 0;border-bottom:1px solid #f3f4f6;font-size:13px;vertical-align:top}
  .desc-sub{font-size:11px;color:#6b7280;margin-top:3px}
  .totals{margin-left:auto;width:280px;margin-top:8px}
  .tot-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#374151}
  .tot-grand{margin-top:10px;background:#111;color:#fff;border-radius:8px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:15px}
  .bank{margin-top:28px;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;background:#fafafa}
  .bank h3{font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
  .bank-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:12px}
  .bank-grid span:first-child{color:#6b7280}
  .bank-grid span:last-child{font-weight:600;text-align:right}
  @media print{body{background:#fff;padding:0}.wrap{border:none;border-radius:0}}
</style></head>
<body><div class="wrap"><div class="body">
  <div class="head">
    <div>
      <div class="brand">${b.companyBrandName}</div>
      <div class="legal">${b.companyLegalName}</div>
      <div class="meta">
        ${b.companyWebsite}<br/>
        ${b.companyEmail}<br/>
        ${b.companyPhone}
      </div>
    </div>
    <div class="inv-title">
      <h1>INVOICE</h1>
      <p>#${inv.invoiceNumber}</p>
    </div>
  </div>
  <div class="grid">
    <div><div class="lbl">Bill To</div><div class="val">${inv.tenantName}</div><div class="meta">${inv.tenantEmail}</div></div>
    <div><div class="lbl">Issue Date</div><div class="val">${fmtDate(new Date(inv.issueDate))}</div></div>
    <div><div class="lbl">Valid Until</div><div class="val">${fmtDate(new Date(inv.validUntil))}</div></div>
  </div>
  <table>
    <thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead>
    <tbody><tr>
      <td><strong>${planLine}</strong><div class="desc-sub">${planSub}</div></td>
      <td>${inv.months}</td>
      <td><strong>${fmtMoney(inv.subtotal, inv.currency)}</strong></td>
    </tr></tbody>
  </table>
  <div class="totals">
    <div class="tot-row"><span>Subtotal</span><span>${fmtMoney(inv.subtotal, inv.currency)}</span></div>
    <div class="tot-row"><span>Tax (${inv.taxRate}%)</span><span>${fmtMoney(inv.taxAmount, inv.currency)}</span></div>
    <div class="tot-grand"><span>Total (${monthLabel})</span><span>${fmtMoney(inv.total, inv.currency)}</span></div>
  </div>
  <div class="bank">
    <h3>Bank Transfer Details</h3>
    <div class="bank-grid">
      <span>Bank</span><span>${b.bankName}</span>
      <span>Account Name</span><span>${b.bankAccountName}</span>
      <span>Account Number</span><span>${b.bankAccountNumber}</span>
      <span>SWIFT Code</span><span>${b.bankSwift}</span>
    </div>
  </div>
</div></div></body></html>`;
}

export function buildSubscriptionInvoice(
  tenant: { id: string; name: string; email: string; plan: string },
  plan: { key: string; name: string; price: number; currency: string; interval: string },
  billing: PlatformBillingSettings,
  months = 1,
): SubscriptionInvoiceData {
  const issue = new Date();
  const valid = new Date(issue);
  valid.setDate(valid.getDate() + (billing.invoiceDueDays || 20));

  const unitPrice = plan.price;
  const subtotal = unitPrice * months;
  const taxRate = billing.taxRate ?? 0;
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + taxAmount;

  const intervalLabel = plan.interval === 'mo' ? 'month' : plan.interval;

  return {
    invoiceNumber: generateSubscriptionInvoiceNumber(),
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantEmail: tenant.email,
    planKey: plan.key,
    planName: plan.name,
    months,
    unitPrice,
    currency: plan.currency || 'Rs.',
    intervalLabel,
    subtotal,
    taxRate,
    taxAmount,
    total,
    issueDate: issue.toISOString(),
    validUntil: valid.toISOString(),
    billing,
  };
}
