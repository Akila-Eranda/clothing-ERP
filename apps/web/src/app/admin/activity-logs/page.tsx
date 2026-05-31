'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, AlertTriangle, Info, AlertCircle } from 'lucide-react'
import { fetchPlatformAuditLogs, type AuditLogRow } from '@/lib/admin-api'

const SEV_FROM_ACTION: Record<string, 'INFO' | 'WARN' | 'ERROR'> = {
  DELETE: 'ERROR',
  DAY_END: 'INFO',
  CREATE: 'INFO',
  UPDATE: 'WARN',
}

function severity(log: AuditLogRow): 'INFO' | 'WARN' | 'ERROR' {
  if (log.action.includes('DELETE') || log.action.includes('REJECT')) return 'ERROR'
  if (log.action.includes('SUSPEND') || log.action.includes('UPDATE')) return 'WARN'
  return SEV_FROM_ACTION[log.action] ?? 'INFO'
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

export default function ActivityLogsPage() {
  const [logs, setLogs]           = useState<AuditLogRow[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [sevFilter, setSevFilter] = useState('ALL')
  const [page, setPage]           = useState(1)
  const PER_PAGE = 25

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchPlatformAuditLogs({
        page: String(page),
        limit: String(PER_PAGE),
        ...(search.trim() ? { search: search.trim() } : {}),
      })
      setLogs(res.data)
      setTotal(res.total)
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load activity logs')
      setLogs([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { load() }, [load])

  const filtered = logs.filter(l => {
    if (sevFilter === 'ALL') return true
    return severity(l) === sevFilter
  })

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">Activity Logs</h1>
          <p className="text-sm text-gray-500">
            {loading ? 'Loading…' : `${total} audit events`}
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 bg-white text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {['ALL', 'INFO', 'WARN', 'ERROR'].map(s => (
          <button
            key={s}
            onClick={() => setSevFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              sevFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 max-w-md">
        <Search size={14} className="text-gray-400" />
        <input
          className="flex-1 text-sm outline-none bg-transparent"
          placeholder="Search action, resource…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          onKeyDown={e => e.key === 'Enter' && load()}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Time', 'Severity', 'Action', 'Resource', 'Tenant', 'User'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">No activity logs yet</td></tr>
            ) : filtered.map(log => {
              const sev = severity(log)
              const Icon = SEV_ICON[sev]
              const actor = log.user
                ? `${log.user.firstName ?? ''} ${log.user.lastName ?? ''}`.trim() || log.user.email
                : '—'
              return (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('en-LK')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${SEV_TEXT[sev]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[sev]}`} />
                      <Icon size={10} /> {sev}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-800">{log.action}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {log.resource}
                    {log.resourceId && <span className="text-gray-400 ml-1">#{log.resourceId.slice(0, 8)}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {log.tenant?.name ?? '—'}
                    {log.tenant?.subdomain && (
                      <span className="block text-[10px] text-gray-400 font-mono">{log.tenant.subdomain}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{actor}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
