'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Printer, Send, Loader2, FileText, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchSubscriptionInvoice,
  sendSubscriptionInvoice,
  type SubscriptionInvoice,
  type TenantRow,
} from '@/lib/admin-api'

function fmtMoney(amount: number, currency: string) {
  const sym = currency.replace(/\.$/, '').trim() || 'Rs.'
  return `${sym} ${amount.toLocaleString('en-LK')}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

interface Props {
  tenant: TenantRow
  onClose: () => void
}

export default function SubscriptionInvoiceModal({ tenant, onClose }: Props) {
  const [invoice, setInvoice] = useState<SubscriptionInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [months, setMonths] = useState(1)
  const [email, setEmail] = useState(tenant.email)
  const printRef = useRef<HTMLDivElement>(null)

  async function load(m = months) {
    setLoading(true)
    try {
      const inv = await fetchSubscriptionInvoice(tenant.id, m)
      setInvoice(inv)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate invoice')
      onClose()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setEmail(tenant.email)
    load(1)
  }, [tenant.id])

  function handlePrint() {
    if (!printRef.current) return
    const w = window.open('', '_blank')
    if (!w) {
      toast.error('Pop-up blocked — allow pop-ups to print')
      return
    }
    w.document.write(`
      <!DOCTYPE html><html><head><title>Invoice ${invoice?.invoiceNumber ?? ''}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#111}
        @media print{@page{margin:12mm}}
      </style></head><body>${printRef.current.innerHTML}</body></html>
    `)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 300)
  }

  async function handleSend() {
    if (!email.trim()) {
      toast.error('Enter client email')
      return
    }
    setSending(true)
    try {
      const res = await sendSubscriptionInvoice(tenant.id, { months, email: email.trim() })
      toast.success(`Invoice sent to ${res.email}`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to send invoice')
    } finally {
      setSending(false)
    }
  }

  const monthLabel = months === 1 ? '1 Month' : `${months} Months`

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-gray-100 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={18} className="text-gray-500 shrink-0" />
            <h2 className="text-sm font-bold text-gray-900 truncate">
              Subscription Invoice{invoice ? ` — ${invoice.invoiceNumber}` : ''}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrint}
              disabled={!invoice || loading}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              <Printer size={13} /> Print / Save PDF
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-white border-b border-gray-100 shrink-0">
          <label className="text-xs text-gray-500 flex items-center gap-2">
            Period
            <select
              value={months}
              onChange={e => { const m = parseInt(e.target.value, 10); setMonths(m); load(m) }}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
            >
              {[1, 3, 6, 12].map(n => (
                <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500 flex items-center gap-2 flex-1 min-w-[200px]">
            Send to
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
              placeholder="client@email.com"
            />
          </label>
          <button
            onClick={() => load(months)}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg"
            title="Regenerate"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleSend}
            disabled={sending || loading || !invoice}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Send to Client
          </button>
          <button
            onClick={handlePrint}
            disabled={!invoice || loading}
            className="sm:hidden flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg"
          >
            <Printer size={13} /> PDF
          </button>
        </div>

        {/* Invoice body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
            </div>
          ) : invoice ? (
            <div ref={printRef} className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <div className="flex justify-between gap-6 mb-8">
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest text-blue-600">{invoice.billing.companyBrandName}</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{invoice.billing.companyLegalName}</p>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    {invoice.billing.companyWebsite}<br />
                    {invoice.billing.companyEmail}<br />
                    {invoice.billing.companyPhone}
                  </p>
                </div>
                <div className="text-right">
                  <h1 className="text-3xl font-black text-gray-900 tracking-tight">INVOICE</h1>
                  <p className="text-sm text-gray-500 mt-1">#{invoice.invoiceNumber}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Bill To</p>
                  <p className="text-sm font-semibold mt-1">{invoice.tenantName}</p>
                  <p className="text-xs text-gray-500">{invoice.tenantEmail}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Issue Date</p>
                  <p className="text-sm font-semibold mt-1">{fmtDate(invoice.issueDate)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Valid Until</p>
                  <p className="text-sm font-semibold mt-1">{fmtDate(invoice.validUntil)}</p>
                </div>
              </div>

              <table className="w-full mb-4">
                <thead>
                  <tr className="border-b-2 border-gray-900">
                    <th className="text-left py-2 text-[10px] font-bold text-gray-400 uppercase">Description</th>
                    <th className="text-center py-2 text-[10px] font-bold text-gray-400 uppercase w-16">Qty</th>
                    <th className="text-right py-2 text-[10px] font-bold text-gray-400 uppercase w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-4">
                      <p className="text-sm font-semibold">Hexalyte {invoice.planName} Plan</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {monthLabel} subscription · {fmtMoney(invoice.unitPrice, invoice.currency)} / month
                      </p>
                    </td>
                    <td className="py-4 text-center text-sm">{invoice.months}</td>
                    <td className="py-4 text-right text-sm font-semibold">{fmtMoney(invoice.subtotal, invoice.currency)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="ml-auto max-w-xs space-y-1.5">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{fmtMoney(invoice.subtotal, invoice.currency)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Tax ({invoice.taxRate}%)</span>
                  <span>{fmtMoney(invoice.taxAmount, invoice.currency)}</span>
                </div>
                <div className="flex justify-between items-center bg-gray-900 text-white rounded-lg px-4 py-3 mt-2 font-bold text-sm">
                  <span>Total ({monthLabel})</span>
                  <span>{fmtMoney(invoice.total, invoice.currency)}</span>
                </div>
              </div>

              <div className="mt-8 p-4 rounded-xl border border-gray-200 bg-gray-50">
                <p className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wide mb-3">Bank Transfer Details</p>
                <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-xs">
                  {[
                    ['Bank', invoice.billing.bankName],
                    ['Account Name', invoice.billing.bankAccountName],
                    ['Account Number', invoice.billing.bankAccountNumber],
                    ['SWIFT Code', invoice.billing.bankSwift],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="text-gray-500">{k}</span>
                      <span className="font-semibold text-gray-900 text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
