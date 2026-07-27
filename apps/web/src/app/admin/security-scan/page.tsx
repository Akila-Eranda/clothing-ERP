'use client'

import { useCallback, useState } from 'react'
import {
  Shield, RefreshCw, CheckCircle, AlertTriangle, XCircle, Info, ScanSearch,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  runSecurityScan,
  type SecurityScanCheck,
  type SecurityScanResult,
  type SecurityScanSeverity,
} from '@/lib/admin-api'

const STATUS_META: Record<
  SecurityScanSeverity,
  { label: string; className: string; Icon: typeof CheckCircle }
> = {
  pass: { label: 'Pass', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle },
  warn: { label: 'Warn', className: 'bg-amber-50 text-amber-800 border-amber-200', Icon: AlertTriangle },
  fail: { label: 'Fail', className: 'bg-red-50 text-red-700 border-red-200', Icon: XCircle },
  info: { label: 'Info', className: 'bg-sky-50 text-sky-700 border-sky-200', Icon: Info },
}

function scoreTone(score: number) {
  if (score >= 90) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (score >= 70) return 'text-amber-800 bg-amber-50 border-amber-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

function CheckRow({ check }: { check: SecurityScanCheck }) {
  const meta = STATUS_META[check.status]
  const Icon = meta.Icon
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex gap-3">
      <div className={`mt-0.5 h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 ${meta.className}`}>
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{check.title}</p>
          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${meta.className}`}>
            {meta.label}
          </span>
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
            {check.category}
          </span>
        </div>
        <p className="text-sm text-gray-600 mt-1 break-words">{check.detail}</p>
        {check.recommendation && (
          <p className="text-xs text-amber-800 mt-2 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
            {check.recommendation}
          </p>
        )}
      </div>
    </div>
  )
}

export default function SecurityScanPage() {
  const [result, setResult] = useState<SecurityScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await runSecurityScan()
      setResult(data)
    } catch (e: unknown) {
      setError((e as Error).message || 'Security scan failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const summary = result?.summary

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-gray-900" />
            <h1 className="text-base font-bold text-gray-900">System Security Scan</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Checks auth hardening, sessions, tenants, uploads, and public endpoints for hijack IOCs.
          </p>
        </div>
        <Button onClick={run} disabled={loading} className="gap-2">
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <ScanSearch size={14} />}
          {loading ? 'Scanning…' : result ? 'Re-scan' : 'Run security scan'}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!result && !loading && !error && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <ScanSearch className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm font-semibold text-gray-800">No scan yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Click <span className="font-medium">Run security scan</span> to check the live platform.
          </p>
        </div>
      )}

      {loading && !result && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-gray-400 mb-2" />
          Running checks…
        </div>
      )}

      {summary && (
        <>
          <div className={`rounded-xl border p-5 flex flex-wrap items-center gap-4 ${scoreTone(summary.score)}`}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Security score</p>
              <p className="text-3xl font-bold tabular-nums">{summary.score}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="px-2 py-1 rounded-lg bg-white/70 border border-black/5">{summary.pass} pass</span>
              <span className="px-2 py-1 rounded-lg bg-white/70 border border-black/5">{summary.warn} warn</span>
              <span className="px-2 py-1 rounded-lg bg-white/70 border border-black/5">{summary.fail} fail</span>
              <span className="px-2 py-1 rounded-lg bg-white/70 border border-black/5">{summary.info} info</span>
            </div>
            <p className="text-xs opacity-80 ml-auto">
              Scanned {new Date(result!.scannedAt).toLocaleString()}
            </p>
          </div>

          <div className="space-y-3">
            {result!.checks.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
