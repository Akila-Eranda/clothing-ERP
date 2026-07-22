'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { RefreshCw, AlertTriangle, Info, AlertCircle } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { ClientSideTable, DataTableColumnHeader } from '@/components/table'
import { fetchPlatformAuditLogs, type AuditLogRow } from '@/lib/admin-api'
import { Button } from '@/components/ui/button'

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
  INFO: 'bg-blue-400',
  WARN: 'bg-amber-400',
  ERROR: 'bg-red-500',
}
const SEV_ICON: Record<string, React.ElementType> = {
  INFO: Info,
  WARN: AlertTriangle,
  ERROR: AlertCircle,
}
const SEV_TEXT: Record<string, string> = {
  INFO: 'text-blue-600 bg-blue-50',
  WARN: 'text-amber-600 bg-amber-50',
  ERROR: 'text-red-600 bg-red-50',
}

type LogRow = AuditLogRow & { _severity: 'INFO' | 'WARN' | 'ERROR'; _actor: string }

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchPlatformAuditLogs({ page: '1', limit: '500' })
      setLogs(
        (res.data ?? []).map((log) => {
          const actor = log.user
            ? `${log.user.firstName ?? ''} ${log.user.lastName ?? ''}`.trim() || log.user.email
            : '—'
          return { ...log, _severity: severity(log), _actor: actor }
        }),
      )
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load activity logs')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const columns = useMemo<ColumnDef<LogRow>[]>(() => [
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Time" />,
      cell: ({ row }) => (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleString('en-LK')}
        </span>
      ),
    },
    {
      id: 'severity',
      accessorKey: '_severity',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Severity" />,
      cell: ({ row }) => {
        const sev = row.original._severity
        const Icon = SEV_ICON[sev]
        return (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${SEV_TEXT[sev]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[sev]}`} />
            <Icon size={10} /> {sev}
          </span>
        )
      },
    },
    {
      accessorKey: 'action',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
      cell: ({ row }) => <span className="font-mono text-xs text-gray-800">{row.original.action}</span>,
    },
    {
      accessorKey: 'resource',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Resource" />,
      cell: ({ row }) => (
        <span className="text-xs text-gray-600">
          {row.original.resource}
          {row.original.resourceId && (
            <span className="text-gray-400 ml-1">#{row.original.resourceId.slice(0, 8)}</span>
          )}
        </span>
      ),
    },
    {
      id: 'tenant',
      accessorFn: (l) => l.tenant?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tenant" />,
      cell: ({ row }) => (
        <div className="text-xs text-gray-600">
          {row.original.tenant?.name ?? '—'}
          {row.original.tenant?.subdomain && (
            <span className="block text-[10px] text-gray-400 font-mono">{row.original.tenant.subdomain}</span>
          )}
        </div>
      ),
    },
    {
      id: 'actor',
      accessorKey: '_actor',
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => <span className="text-xs text-gray-600">{row.original._actor}</span>,
    },
  ], [])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">Activity Logs</h1>
          <p className="text-sm text-gray-500">
            {loading ? 'Loading…' : `${logs.length} audit events`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="ml-auto"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>
      )}

      <ClientSideTable
        data={logs}
        columns={columns}
        pageCount={Math.max(1, Math.ceil(logs.length / 10))}
        searchableColumns={[
          { id: 'action', title: 'Action' },
          { id: 'resource', title: 'Resource' },
          { id: 'tenant', title: 'Tenant' },
          { id: 'actor', title: 'User' },
        ]}
        filterableColumns={[
          {
            id: 'severity',
            title: 'Severity',
            options: [
              { value: 'INFO', label: 'Info' },
              { value: 'WARN', label: 'Warn' },
              { value: 'ERROR', label: 'Error' },
            ],
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: 'activity-logs-export' }}
      />
    </div>
  )
}
