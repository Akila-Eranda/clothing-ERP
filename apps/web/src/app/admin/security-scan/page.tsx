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
import { PageHeader, PageKpiGrid, pageKpi, PAGE_HEADER_BTN_TONES } from '@/components/ui/page-kpi'
import { ADMIN_CARD } from '@/lib/admin-ui'
import { cn } from '@/lib/utils'

const STATUS_META: Record<
  SecurityScanSeverity,
  { label: string; className: string; Icon: typeof CheckCircle }
> = {
  pass: { label: 'Pass', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20', Icon: CheckCircle },
  warn: { label: 'Warn', className: 'bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/20', Icon: AlertTriangle },
  fail: { label: 'Fail', className: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20', Icon: XCircle },
  info: { label: 'Info', className: 'bg-primary/10 text-primary border-primary/20', Icon: Info },
}

function scoreTone(score: number) {
  if (score >= 90) return 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  if (score >= 70) return 'text-amber-800 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
  return 'text-red-700 dark:text-red-400 bg-red-500/10 border-red-500/20'
}

function CheckRow({ check }: { check: SecurityScanCheck }) {
  const meta = STATUS_META[check.status]
  const Icon = meta.Icon
  return (
    <div className={cn(ADMIN_CARD, 'p-4 flex gap-3')}>
      <div className={cn('mt-0.5 h-8 w-8 rounded-lg border flex items-center justify-center shrink-0', meta.className)}>
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{check.title}</p>
          <span className={cn('text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border', meta.className)}>
            {meta.label}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {check.category}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 break-words">{check.detail}</p>
        {check.recommendation && (
          <p className="text-xs text-amber-800 dark:text-amber-400 mt-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
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

  const kpis = summary ? [
    pageKpi('Score', summary.score, Shield, summary.score >= 90 ? 'success' : summary.score >= 70 ? 'warning' : 'danger'),
    pageKpi('Pass', summary.pass, CheckCircle, 'success'),
    pageKpi('Warn', summary.warn, AlertTriangle, 'warning'),
    pageKpi('Fail', summary.fail, XCircle, 'danger'),
  ] : [
    pageKpi('Score', '—', Shield, 'neutral'),
    pageKpi('Pass', '—', CheckCircle, 'success'),
    pageKpi('Warn', '—', AlertTriangle, 'warning'),
    pageKpi('Fail', '—', XCircle, 'danger'),
  ]

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="System Security Scan"
        description="Checks auth hardening, sessions, tenants, uploads, and public endpoints for hijack IOCs."
        actions={
          <Button onClick={run} disabled={loading} className={cn('gap-2', PAGE_HEADER_BTN_TONES.blue)} variant="outline" size="sm">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <ScanSearch size={14} />}
            {loading ? 'Scanning…' : result ? 'Re-scan' : 'Run security scan'}
          </Button>
        }
      />

      <PageKpiGrid items={kpis} loading={loading && !result} cols={4} />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {!result && !loading && !error && (
        <div className={cn(ADMIN_CARD, 'border-dashed p-10 text-center')}>
          <ScanSearch className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-semibold text-foreground">No scan yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Click <span className="font-medium">Run security scan</span> to check the live platform.
          </p>
        </div>
      )}

      {loading && !result && (
        <div className={cn(ADMIN_CARD, 'p-10 text-center text-sm text-muted-foreground')}>
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-muted-foreground mb-2" />
          Running checks…
        </div>
      )}

      {summary && (
        <>
          <div className={cn('rounded-xl border p-5 flex flex-wrap items-center gap-4', scoreTone(summary.score))}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Security score</p>
              <p className="text-3xl font-bold tabular-nums">{summary.score}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="px-2 py-1 rounded-lg bg-card/70 border border-border">{summary.pass} pass</span>
              <span className="px-2 py-1 rounded-lg bg-card/70 border border-border">{summary.warn} warn</span>
              <span className="px-2 py-1 rounded-lg bg-card/70 border border-border">{summary.fail} fail</span>
              <span className="px-2 py-1 rounded-lg bg-card/70 border border-border">{summary.info} info</span>
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
