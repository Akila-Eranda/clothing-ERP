'use client';

import Image from 'next/image';
import { fmtInvoiceDate, fmtInvoiceMoney, type QuotationPrintData } from '@/lib/quotation-document';
import { resolvePublicAssetUrl } from '@/lib/upload';
import { APP_LOGO_PATH } from '@/lib/constants';

interface Props {
  quote: QuotationPrintData;
}

function customerLabel(q: QuotationPrintData): string {
  if (!q.customer) return 'Walk-in Customer';
  return `${q.customer.firstName} ${q.customer.lastName ?? ''}`.trim() || q.customer.phone || 'Customer';
}

export function QuotationDocument({ quote }: Props) {
  const shop = quote.shop;
  const logoSrc = shop.logoUrl ? resolvePublicAssetUrl(shop.logoUrl) : APP_LOGO_PATH;
  const address = [shop.address1, shop.address2].filter(Boolean).join(', ');

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none print:border-0">
      <div className="h-1.5 bg-gradient-to-r from-teal-700 via-teal-600 to-teal-400" />

      <div className="p-8">
        <div className="flex justify-between items-start gap-6 mb-8">
          <div className="flex gap-4 items-start">
            <div className="relative w-[120px] h-[52px] shrink-0" data-invoice-logo>
              <Image
                src={logoSrc}
                alt={shop.shopName}
                fill
                className="object-contain object-left"
                priority
                unoptimized={logoSrc.startsWith('http') || logoSrc.startsWith('/uploads')}
              />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{shop.shopName}</p>
              {shop.tagline && <p className="text-xs text-gray-500 mt-0.5">{shop.tagline}</p>}
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                {address && <>{address}<br /></>}
                {[shop.phone, shop.email, shop.website].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">QUOTATION</h1>
            <p className="inline-block mt-2 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-lg text-xs font-semibold font-mono text-teal-800">
              #{quote.quoteNumber}
            </p>
            <p className="mt-2 inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700">
              {quote.status.replace(/_/g, ' ')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 py-5 border-y border-gray-200 mb-6">
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Prepared For</p>
            <p className="text-sm font-semibold text-gray-900 mt-1.5">{customerLabel(quote)}</p>
            {quote.customer?.phone && <p className="text-xs text-gray-500 mt-0.5">{quote.customer.phone}</p>}
            {quote.customer?.email && <p className="text-xs text-gray-500">{quote.customer.email}</p>}
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Quote Date</p>
            <p className="text-sm font-semibold text-gray-900 mt-1.5">{fmtInvoiceDate(quote.createdAt)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Valid Until</p>
            <p className="text-sm font-semibold text-gray-900 mt-1.5">
              {quote.validUntil ? fmtInvoiceDate(quote.validUntil) : 'Open'}
            </p>
          </div>
        </div>

        <table className="w-full mb-5">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-900">
              <th className="text-left py-2.5 px-3 text-[9px] font-bold text-gray-500 uppercase tracking-wide">Part / Description</th>
              <th className="text-center py-2.5 px-3 text-[9px] font-bold text-gray-500 uppercase tracking-wide w-12">Qty</th>
              <th className="text-right py-2.5 px-3 text-[9px] font-bold text-gray-500 uppercase tracking-wide w-24">Unit</th>
              <th className="text-right py-2.5 px-3 text-[9px] font-bold text-gray-500 uppercase tracking-wide w-14">Tax</th>
              <th className="text-right py-2.5 px-3 text-[9px] font-bold text-gray-500 uppercase tracking-wide w-28">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, i) => {
              const title = item.variantName && item.variantName !== item.productName
                ? `${item.productName} — ${item.variantName}`
                : item.productName;
              return (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-3.5 px-3">
                    <p className="text-sm font-bold text-gray-900">{title}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{item.sku}</p>
                  </td>
                  <td className="py-3.5 px-3 text-center text-sm text-gray-600">{item.quantity}</td>
                  <td className="py-3.5 px-3 text-right text-sm text-gray-600">{fmtInvoiceMoney(item.unitPrice, 'LKR')}</td>
                  <td className="py-3.5 px-3 text-right text-sm text-gray-500">{item.taxRate ? `${item.taxRate}%` : '—'}</td>
                  <td className="py-3.5 px-3 text-right text-sm font-bold text-gray-900">{fmtInvoiceMoney(item.total, 'LKR')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex justify-end mb-6">
          <div className="w-full max-w-xs space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600 px-1">
              <span>Subtotal</span>
              <span>{fmtInvoiceMoney(quote.subtotal, 'LKR')}</span>
            </div>
            {quote.discountAmount > 0 && (
              <div className="flex justify-between text-sm text-gray-600 px-1">
                <span>Discount</span>
                <span>-{fmtInvoiceMoney(quote.discountAmount, 'LKR')}</span>
              </div>
            )}
            {quote.taxAmount > 0 && (
              <div className="flex justify-between text-sm text-gray-600 px-1">
                <span>Tax</span>
                <span>{fmtInvoiceMoney(quote.taxAmount, 'LKR')}</span>
              </div>
            )}
            <div className="flex justify-between items-center bg-gray-900 text-white rounded-xl px-4 py-3.5 mt-2 font-bold text-sm">
              <span>Grand Total</span>
              <span>{fmtInvoiceMoney(quote.total, 'LKR')}</span>
            </div>
          </div>
        </div>

        {quote.notes?.trim() && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Notes & Terms</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{quote.notes.trim()}</p>
          </div>
        )}

        <p className="text-xs text-gray-400 leading-relaxed">
          This quotation is valid until the date shown above. Prices and availability may change after expiry.
        </p>
      </div>
    </div>
  );
}
