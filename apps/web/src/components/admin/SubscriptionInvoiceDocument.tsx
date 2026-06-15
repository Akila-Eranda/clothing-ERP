'use client'

import Image from 'next/image'
import type { SubscriptionInvoice } from '@/lib/admin-api'
import { fmtInvoiceDate, fmtInvoiceMoney } from '@/lib/subscription-invoice-document'

interface Props {
  invoice: SubscriptionInvoice
  monthLabel: string
}

export function SubscriptionInvoiceDocument({ invoice, monthLabel }: Props) {
  const b = invoice.billing

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none print:border-0">
      <div className="h-1.5 bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500" />

      <div className="p-8">
        <div className="flex justify-between items-start gap-6 mb-8">
          <div className="flex gap-4 items-start">
            <div className="relative w-[120px] h-[52px] shrink-0">
              <Image
                src="/hexaone-logo.png"
                alt={b.companyBrandName}
                fill
                className="object-contain object-left"
                priority
              />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{b.companyBrandName}</p>
              <p className="text-xs text-gray-500 mt-0.5">{b.companyLegalName}</p>
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                {b.companyWebsite}<br />
                {b.companyEmail}<br />
                {b.companyPhone}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">INVOICE</h1>
            <p className="inline-block mt-2 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold font-mono text-gray-600">
              #{invoice.invoiceNumber}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 py-5 border-y border-gray-200 mb-6">
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Bill To</p>
            <p className="text-sm font-semibold text-gray-900 mt-1.5">{invoice.tenantName}</p>
            <p className="text-xs text-gray-500 mt-0.5">{invoice.tenantEmail}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Issue Date</p>
            <p className="text-sm font-semibold text-gray-900 mt-1.5">{fmtInvoiceDate(invoice.issueDate)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Valid Until</p>
            <p className="text-sm font-semibold text-gray-900 mt-1.5">{fmtInvoiceDate(invoice.validUntil)}</p>
          </div>
        </div>

        <table className="w-full mb-5">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-900">
              <th className="text-left py-2.5 px-3 text-[9px] font-bold text-gray-500 uppercase tracking-wide">Description</th>
              <th className="text-center py-2.5 px-3 text-[9px] font-bold text-gray-500 uppercase tracking-wide w-16">Qty</th>
              <th className="text-right py-2.5 px-3 text-[9px] font-bold text-gray-500 uppercase tracking-wide w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-4 px-3">
                <p className="text-sm font-bold text-gray-900">Hexalyte {invoice.planName} Plan</p>
                <p className="text-xs text-gray-500 mt-1">
                  {monthLabel} subscription · {fmtInvoiceMoney(invoice.unitPrice, invoice.currency)} / month
                </p>
              </td>
              <td className="py-4 px-3 text-center text-sm text-gray-600">{invoice.months}</td>
              <td className="py-4 px-3 text-right text-sm font-bold text-gray-900">
                {fmtInvoiceMoney(invoice.subtotal, invoice.currency)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end mb-7">
          <div className="w-full max-w-xs space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600 px-1">
              <span>Subtotal</span>
              <span>{fmtInvoiceMoney(invoice.subtotal, invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600 px-1">
              <span>Tax ({invoice.taxRate}%)</span>
              <span>{fmtInvoiceMoney(invoice.taxAmount, invoice.currency)}</span>
            </div>
            <div className="flex justify-between items-center bg-gray-900 text-white rounded-xl px-4 py-3.5 mt-2 font-bold text-sm">
              <span>Total ({monthLabel})</span>
              <span>{fmtInvoiceMoney(invoice.total, invoice.currency)}</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white">
          <p className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Bank Transfer Details</p>
          <div className="grid grid-cols-2 gap-y-2.5 gap-x-8 text-xs">
            {[
              ['Bank', b.bankName],
              ['Account Name', b.bankAccountName],
              ['Account Number', b.bankAccountNumber],
              ['SWIFT Code', b.bankSwift],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-gray-500">{k}</span>
                <span className="font-semibold text-gray-900 text-right">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6 pt-4 border-t border-gray-100">
          Thank you for your business · {b.companyLegalName}
        </p>
      </div>
    </div>
  )
}
