'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Activity, Database, Wifi, Server } from 'lucide-react'
import { fetchHealth } from '@/lib/admin-api'
import { APP_NAME } from '@/lib/constants'
import { PageHeader, PageKpiGrid, pageKpi } from '@/components/ui/page-kpi'
import { ADMIN_CARD } from '@/lib/admin-ui'
import { cn } from '@/lib/utils'

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={cn('inline-flex w-2.5 h-2.5 rounded-full animate-pulse', ok ? 'bg-emerald-500' : 'bg-red-500')} />
  )
}

export default function SystemHealthPage() {
  const [health, setHealth]     = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const h = await fetchHealth()
      setHealth(h)
      setLastCheck(new Date())
    } catch (e: any) {
      setError(e.message || 'Failed to reach API')
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const apiOk    = !error && health !== null
  const dbOk     =
    health?.services?.database === 'healthy' ||
    health?.info?.database?.status === 'up'
  const redisOk  =
    health?.services?.redis === 'healthy' ||
    health?.info?.redis?.status === 'up'
  const allOk    = apiOk && health?.status === 'ok' && dbOk && redisOk

  const services = [
    {
      name: 'API Server',
      description: 'NestJS application server',
      ok: apiOk,
      icon: Server,
      detail: error || (apiOk ? 'Responding normally' : 'Not reachable'),
    },
    {
      name: 'PostgreSQL Database',
      description: 'Primary data store',
      ok: dbOk,
      icon: Database,
      detail: dbOk ? 'Connected & accepting queries' : 'Connection issue',
    },
    {
      name: 'Redis Cache',
      description: 'Session & queue store',
      ok: redisOk,
      icon: Activity,
      detail: redisOk ? 'Connected & operating' : 'Connection issue',
    },
    {
      name: 'Network',
      description: 'Frontend → API connectivity',
      ok: apiOk,
      icon: Wifi,
      detail: apiOk ? 'Reachable from browser' : 'Cannot reach API',
    },
  ]

  const kpis = [
    pageKpi('Overall', loading ? '…' : allOk ? 'Healthy' : 'Degraded', Activity, allOk ? 'success' : 'danger'),
    pageKpi('API', apiOk ? 'Up' : 'Down', Server, apiOk ? 'success' : 'danger'),
    pageKpi('Database', dbOk ? 'Up' : 'Down', Database, dbOk ? 'success' : 'danger'),
    pageKpi('Redis', redisOk ? 'Up' : 'Down', Activity, redisOk ? 'success' : 'danger'),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="System Health"
        description={lastCheck ? `Last checked: ${lastCheck.toLocaleTimeString()}` : 'Checking platform services'}
        onRefresh={load}
        refreshing={loading}
      />

      <PageKpiGrid items={kpis} loading={loading} cols={4} />

      <div className={cn(
        'rounded-xl border p-5 flex items-center gap-4',
        allOk
          ? 'bg-emerald-500/10 border-emerald-500/20'
          : 'bg-red-500/10 border-red-500/20',
      )}>
        {loading ? (
          <Activity size={20} className="text-muted-foreground animate-spin" />
        ) : allOk ? (
          <CheckCircle size={28} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        ) : (
          <AlertTriangle size={28} className="text-red-500 flex-shrink-0" />
        )}
        <div>
          <p className={cn('text-base font-bold', allOk ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300')}>
            {loading ? 'Checking…' : allOk ? 'All Systems Operational' : 'Service Disruption Detected'}
          </p>
          <p className={cn('text-sm', allOk ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
            {loading ? 'Running health checks…' : allOk ? `${APP_NAME} platform is running normally.` : 'One or more services are experiencing issues.'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusDot ok={!loading && allOk} />
          <span className={cn('text-xs font-semibold', allOk ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {loading ? 'Checking' : allOk ? 'Healthy' : 'Degraded'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {services.map(svc => {
          const Icon = svc.icon
          return (
            <div key={svc.name} className={cn(ADMIN_CARD, 'p-5')}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    svc.ok ? 'bg-emerald-500/10' : 'bg-red-500/10',
                  )}>
                    <Icon size={18} className={svc.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{svc.name}</p>
                    <p className="text-xs text-muted-foreground">{svc.description}</p>
                  </div>
                </div>
                {loading ? (
                  <Activity size={14} className="text-muted-foreground animate-spin" />
                ) : svc.ok ? (
                  <CheckCircle size={16} className="text-emerald-500" />
                ) : (
                  <XCircle size={16} className="text-red-500" />
                )}
              </div>
              <div className={cn(
                'px-3 py-2 rounded-lg text-xs',
                svc.ok
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400',
              )}>
                {loading ? 'Checking…' : svc.detail}
              </div>
            </div>
          )
        })}
      </div>

      {health && (
        <div className={cn(ADMIN_CARD, 'p-5')}>
          <h2 className="text-sm font-semibold text-foreground mb-3">Raw Health Response</h2>
          <pre className="text-xs text-muted-foreground bg-muted rounded-lg p-3 overflow-x-auto font-mono">
            {JSON.stringify(health, null, 2)}
          </pre>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">Auto-refreshes every 30 seconds</p>
    </div>
  )
}
