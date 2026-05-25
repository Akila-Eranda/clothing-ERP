'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, AlertTriangle, Info, AlertCircle } from 'lucide-react'
import { fetchTenants, type TenantRow } from '@/lib/admin-api'

interface LogEntry {
  id: string
  timestamp: string
  action: string
  actor: string
  target: string
  severity: 'INFO' | 'WARN' | 'ERROR'
  tenantName?: string
}

const SEV_DOT: Record<string, string> = {
  INFO:  'bg-blue-400',
  WARN:  'bg-amber-400',
  ERROR: 'bg-red-500',
}
const SEV_ICON: Record<string, React.ElementType> = {
  INFO:  Info,
  WARN:  AlertTriangle,
  ERROR: AlertCircle,
}
const SEV_TEXT: Record<string, string> = {
  INFO:  'text-blue-600 bg-blue-50',
  WARN:  'text-amber-600 bg-amber-50',
  ERROR: 'text-red-600 bg-red-50',
}

function buildLogsFromTenants(tenants: TenantRow[]): LogEntry[] {
  return tenants.flatMap(t => {
    const entries: LogEntry[] = []

    entries.push({
      id: `tenant-created-${t.id}`,
      timestamp: t.createdAt,
      action: 'TENANT_REGISTERED',
      actor: t.email,
      target: t.subdomain,
      severity: 'INFO',
      tenantName: t.name,
    })

    if (t.status === 'SUSPENDED') {
      entries.push({
        id: `tenant-suspended-${t.id}`,
        timestamp: t.updatedAt,
        action: 'TENANT_SUSPENDED',
        actor: 'admin',
        target: t.subdomain,
        severity: 'WARN',
        tenantName: t.name,
      })
    }

    return entries
  })
}

export default function ActivityLogsPage() {
  const [logs, setLogs]           = useState<LogEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [sevFilter, setSevFilter] = useState('ALL')
  const [page, setPage]           = useState(1)
  const PER_PAGE = 25

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchTenants({ limit: '500' })
      const builtLogs = buildLogsFromTenants(res.data)
      builtLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setLogs(builtLogs)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = logs.filter(l => {
    const matchSearch = !search || [l.action, l.actor, l.target, l.tenantName ?? ''].some(s =>
      s.toLowerCase().includes(search.toLowerCase())
    )
    const matchSev = sevFilter === 'ALL' || l.severity === sevFilter
    return matchSearch && matchSev
  })

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const summary = {
    INFO:  logs.filter(l => l.severity === 'INFO').length,
    WARN:  logs.filter(l => l.severity === 'WARN').length,
    ERROR: logs.filter(l => l.severity === 'ERROR').length,
  }

  function relTime(s: string) {
    const diff = (Date.now() - new Date(s).getTime()) / 1000
    if (diff < 60)    return `${Math.round(diff)}s ago`
    if (diff < 3600)  return `${Math.round(diff / 60)}m ago`
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
    return new Date(s).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: '2-digit' })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">Activity Logs</h1>
          <p className="text-sm text-gray-500">{filtered.length} events</p>
        </div>
        <button onClick={load} disabled={loading} className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 bg-white text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Severity summary */}
      <div className="grid grid-cols-3 gap-4">
        {(['INFO', 'WARN', 'ERROR'] as const).map(sev => {
          const Icon = SEV_ICON[sev]
          return (
            <button key={sev} onClick={() => setSevFilter(sevFilter === sev ? 'ALL' : sev)}
              className={`bg-white rounded-xl border p-4 flex items-center gap-3 transition-all ${sevFilter === sev ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${SEV_TEXT[sev]}`}>
                <Icon size={15} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{sev}</p>
                <p className="text-xl font-bold text-gray-900">{summary[sev]}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-[220px]">
          <Search size={14} className="text-gray-400" />
          <input
            className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1"
            placeholder="Search action, actor, target…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="px-3 py-2 text-sm border border-gray-200 bg-white rounded-lg outline-none text-gray-700"
          value={sevFilter}
          onChange={e => { setSevFilter(e.target.value); setPage(1) }}
        >
          <option value="ALL">All Severity</option>
          <option value="INFO">Info</option>
          <option value="WARN">Warning</option>
          <option value="ERROR">Error</option>
        </select>
      </div>

      {/* Log list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw size={20} className="animate-spin mx-auto text-gray-300" />
          </div>
        ) : paginated.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">No logs match filters.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {paginated.map(log => (
              <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50">
                <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${SEV_DOT[log.severity]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${SEV_TEXT[log.severity]}`}>
                      {log.severity}
                    </span>
                    <span className="text-xs font-semibold text-gray-800">{log.action.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="font-medium text-gray-700">{log.actor}</span>
                    {log.target ? ` → ${log.target}` : ''}
                    {log.tenantName ? ` (${log.tenantName})` : ''}
                  </p>
                </div>
                <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">{relTime(log.timestamp)}</span>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {page} of {totalPages} · {filtered.length} events</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
