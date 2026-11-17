/**
 * Customer bill message (WhatsApp / copy / share) built from a template with {placeholders}.
 *
 * The template is edited in Settings and stored in `tenant.settings.billMessageTemplate`; a shop that never
 * edited it gets DEFAULT_BILL_TEMPLATE. The message is always built on the server from the real invoice and
 * the customer's CURRENT credit balance. Missing optional data never breaks the message:
 *   - a line whose placeholders are ALL empty is left out (e.g. "Shop no - {shop_phone}" without a phone);
 *   - {customer_name} falls back to "Customer", money to 0.00;
 *   - line breaks are kept exactly (\n), so copying or sharing the text keeps its layout.
 * Pure functions (no Prisma) so they are unit-tested.
 */

export const DEFAULT_BILL_TEMPLATE = `Hi {customer_name}

Your Bill

{shop_name}
Shop no - {shop_phone}

Bill: {invoice_number}

Items:
{items}

Total: LKR {total}
Payment: {payment_method}

Account Summary:
Total Credit Balance: LKR {customer_credit_balance}

Thank you for shopping with us!`;

export const BILL_TEMPLATE_MAX_LENGTH = 2000;

export const BILL_PLACEHOLDERS: { key: string; description: string }[] = [
  { key: 'customer_name', description: 'Customer name (Customer when unknown)' },
  { key: 'customer_phone', description: 'Customer phone' },
  { key: 'shop_name', description: 'Shop name' },
  { key: 'shop_phone', description: 'Shop phone' },
  { key: 'invoice_number', description: 'Invoice number' },
  { key: 'date', description: 'Invoice date (YYYY-MM-DD)' },
  { key: 'items', description: 'One line per item: name, quantity × unit price = line total' },
  { key: 'subtotal', description: 'Subtotal before discounts' },
  { key: 'discount', description: 'Total discount' },
  { key: 'total', description: 'Invoice total' },
  { key: 'amount_paid', description: 'Amount paid' },
  { key: 'change', description: 'Change returned' },
  { key: 'payment_method', description: 'Payment method(s)' },
  { key: 'customer_credit_balance', description: "Customer's current credit balance (amount owed)" },
  { key: 'customer_wallet_balance', description: "Customer's current wallet balance" },
];

const KNOWN = new Set(BILL_PLACEHOLDERS.map((p) => p.key));
const PLACEHOLDER = /\{([a-z_]+)\}/g;

export type BillMessageData = {
  customerName?: string | null;
  customerPhone?: string | null;
  shopName?: string | null;
  shopPhone?: string | null;
  invoiceNumber?: string | null;
  date?: Date | string | null;
  items: { name: string; variant?: string | null; quantity: number; unitPrice: number; total: number }[];
  subtotal?: number | null;
  discount?: number | null;
  total?: number | null;
  amountPaid?: number | null;
  change?: number | null;
  paymentMethod?: string | null;
  customerCreditBalance?: number | null;
  customerWalletBalance?: number | null;
};

const money = (n: number | null | undefined) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const qty = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '0');
const text = (v: string | null | undefined) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '');

function dateText(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** One line per item: name (variant), quantity, unit price, line total. */
export function formatBillItems(items: BillMessageData['items']): string {
  return items
    .map((i) => {
      const name = text(i.name) || 'Item';
      const variant = text(i.variant);
      const label = variant && variant.toLowerCase() !== 'default' ? `${name} (${variant})` : name;
      return `• ${label} — ${qty(i.quantity)} × ${money(i.unitPrice)} = ${money(i.total)}`;
    })
    .join('\n');
}

/** Why a template cannot be saved, or null. Unknown placeholders are refused (a typo would be sent as-is). */
export function billTemplateError(template: unknown): string | null {
  if (typeof template !== 'string') return 'Template must be text';
  if (!template.trim()) return 'Template cannot be empty';
  if (template.length > BILL_TEMPLATE_MAX_LENGTH) return `Template is longer than ${BILL_TEMPLATE_MAX_LENGTH} characters`;
  const unknown = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) if (!KNOWN.has(m[1])) unknown.add(`{${m[1]}}`);
  if (unknown.size) return `Unknown placeholder${unknown.size > 1 ? 's' : ''}: ${[...unknown].join(', ')}`;
  return null;
}

/** The template of a shop (stored value, else the default). */
export function resolveBillTemplate(tenantSettings: unknown): string {
  const stored = (tenantSettings as Record<string, unknown> | null)?.['billMessageTemplate'];
  return typeof stored === 'string' && stored.trim() && !billTemplateError(stored) ? stored : DEFAULT_BILL_TEMPLATE;
}

export function renderBillMessage(template: string, data: BillMessageData): string {
  const values: Record<string, string> = {
    customer_name: text(data.customerName) || 'Customer',
    customer_phone: text(data.customerPhone),
    shop_name: text(data.shopName),
    shop_phone: text(data.shopPhone),
    invoice_number: text(data.invoiceNumber),
    date: dateText(data.date),
    items: formatBillItems(data.items ?? []),
    subtotal: money(data.subtotal ?? data.total),
    discount: money(data.discount),
    total: money(data.total),
    amount_paid: money(data.amountPaid ?? data.total),
    change: money(data.change),
    payment_method: text(data.paymentMethod),
    customer_credit_balance: money(data.customerCreditBalance),
    customer_wallet_balance: money(data.customerWalletBalance),
  };
  const out: string[] = [];
  for (const line of template.replace(/\r\n?/g, '\n').split('\n')) {
    const keys = [...line.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((k) => k in values);
    // A line whose placeholders ALL came out empty is dropped (never a dangling "Shop no - ").
    if (keys.length > 0 && keys.every((k) => values[k] === '')) continue;
    out.push(line.replace(PLACEHOLDER, (m, k: string) => (k in values ? values[k] : m)).replace(/[ \t]+$/g, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
