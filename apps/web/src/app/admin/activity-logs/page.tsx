'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { AlertTriangle, Info, AlertCircle, ScrollText } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { ClientSideTable, DataTableColumnHeader } from '@/components/table'
import { fetchPlatformAuditLogs, type AuditLogRow } from '@/lib/admin-api'
import { parseApiList } from '@/lib/parse-api-list'
import { PageHeader, PageKpiGrid, pageKpi } from '@/components/ui/page-kpi'
import { cn } from '@/lib/utils'

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
  INFO: 'bg-primary',
  WARN: 'bg-amber-400',
  ERROR: 'bg-red-500',
}
const SEV_ICON: Record<string, React.ElementType> = {
  INFO: Info,
  WARN: AlertTriangle,
  ERROR: AlertCircle,
}
const SEV_TEXT: Record<string, string> = {
  INFO: 'text-primary bg-primary/10',
  WARN: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  ERROR: 'text-red-600 dark:text-red-400 bg-red-500/10',
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
        parseApiList<AuditLogRow>(res.data).map((log) => {
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
        <span className="text-xs text-muted-foreground whitespace-nowrap">
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
          <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold', SEV_TEXT[sev])}>
            <span className={cn('w-1.5 h-1.5 rounded-full', SEV_DOT[sev])} />
            <Icon size={10} /> {sev}
          </span>
        )
      },
    },
    {
      id: 'action',
      accessorFn: (l) =>
        `${l.action} ${l.resource ?? ''} ${l.tenant?.name ?? ''} ${l._actor ?? ''}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
      cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.action}</span>,
    },
    {
      accessorKey: 'resource',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Resource" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.resource}
          {row.original.resourceId && (
            <span className="text-muted-foreground/70 ml-1">#{row.original.resourceId.slice(0, 8)}</span>
          )}
        </span>
      ),
    },
    {
      id: 'tenant',
      accessorFn: (l) => l.tenant?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tenant" />,
      cell: ({ row }) => (
        <div className="text-xs text-muted-foreground">
          {row.original.tenant?.name ?? '—'}
          {row.original.tenant?.subdomain && (
            <span className="block text-[10px] text-muted-foreground font-mono">{row.original.tenant.subdomain}</span>
          )}
        </div>
      ),
    },
    {
      id: 'actor',
      accessorKey: '_actor',
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original._actor}</span>,
    },
  ], [])

  const kpis = [
    pageKpi('Events', logs.length, ScrollText, 'primary'),
    pageKpi('Info', logs.filter((l) => l._severity === 'INFO').length, Info, 'info'),
    pageKpi('Warnings', logs.filter((l) => l._severity === 'WARN').length, AlertTriangle, 'warning'),
    pageKpi('Errors', logs.filter((l) => l._severity === 'ERROR').length, AlertCircle, 'danger'),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity Logs"
        description={loading ? 'Loading…' : `${logs.length} audit events`}
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{error}</p>
      )}

      <PageKpiGrid items={kpis} loading={loading} cols={4} />

      <ClientSideTable
        data={logs}
        columns={columns}
        searchableColumns={[
          { id: 'action', title: 'Action / resource / tenant / user' },
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
