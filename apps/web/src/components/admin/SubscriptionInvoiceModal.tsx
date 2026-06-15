'use client'

import { useState, useEffect } from 'react'
import { X, Printer, Send, Loader2, FileText, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchSubscriptionInvoice,
  sendSubscriptionInvoice,
  type SubscriptionInvoice,
  type TenantRow,
} from '@/lib/admin-api'
import { SubscriptionInvoiceDocument } from '@/components/admin/SubscriptionInvoiceDocument'
import { buildSubscriptionInvoicePrintHtml } from '@/lib/subscription-invoice-document'

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
    if (!invoice) return
    const w = window.open('', '_blank')
    if (!w) {
      toast.error('Pop-up blocked — allow pop-ups to print')
      return
    }
    const logoUrl = `${window.location.origin}/hexaone-logo.png`
    w.document.write(buildSubscriptionInvoicePrintHtml(invoice, logoUrl))
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 400)
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

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
            </div>
          ) : invoice ? (
            <SubscriptionInvoiceDocument invoice={invoice} monthLabel={monthLabel} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
